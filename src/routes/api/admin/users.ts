import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AppRole } from "@/hooks/use-auth";
import type { Database } from "@/integrations/supabase/types";
import { isUserOnline } from "@/lib/auth-session";

const APP_ROLES: AppRole[] = [
  "super_admin",
  "campus_incharge",
  "registrar",
  "admission_officer",
  "sub_admission_officer",
  "hr",
  "finance_admin",
  "finance_officer",
  "cashier",
  "receptionist",
  "teacher",
  "student",
];
const SYSTEM_USER_ROLES = APP_ROLES.filter((role) => role !== "student");

type CreateUserBody = {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
  roles: AppRole[];
};

type UpdateUserBody = {
  full_name?: string;
  email?: string;
  phone?: string;
  password?: string;
  roles?: AppRole[];
  disabled?: boolean;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function errorJson(error: unknown) {
  if (error instanceof Response) {
    return json({ error: await error.text() }, error.status);
  }
  const message = error instanceof Error ? error.message : "User management request failed.";
  return json({ error: message }, 500);
}

async function requireSuperAdmin(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    realtime: {
      transport: WebSocket,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userRes.user) throw new Response("Unauthorized", { status: 401 });

  const { data: roleRows, error: roleErr } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (roleErr || !roleRows) throw new Response("Forbidden", { status: 403 });

  return userRes.user;
}

function normalizeRoles(input: unknown): AppRole[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((r): r is AppRole => SYSTEM_USER_ROLES.includes(r as AppRole)))];
}

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireSuperAdmin(request);

          const [{ data: profiles }, { data: roles }, authUsers] = await Promise.all([
            supabaseAdmin
              .from("profiles")
              .select("id, full_name, phone, created_at, updated_at, last_seen_at, last_login_at")
              .order("created_at", { ascending: false }),
            supabaseAdmin.from("user_roles").select("user_id, role, created_at"),
            supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
          ]);

          if (authUsers.error) return json({ error: authUsers.error.message }, 500);

          const roleMap = new Map<string, AppRole[]>();
          for (const r of roles ?? []) {
            const list = roleMap.get(r.user_id) ?? [];
            list.push(r.role as AppRole);
            roleMap.set(r.user_id, list);
          }

          const authMap = new Map(authUsers.data.users.map((u) => [u.id, u]));
          const rows = (profiles ?? [])
            .map((p) => {
              const authUser = authMap.get(p.id);
              return {
                id: p.id,
                full_name: p.full_name,
                phone: p.phone,
                email: authUser?.email ?? "",
                created_at: p.created_at,
                last_sign_in_at: authUser?.last_sign_in_at ?? null,
                last_seen_at: (p as { last_seen_at?: string | null }).last_seen_at ?? null,
                last_login_at: (p as { last_login_at?: string | null }).last_login_at ?? null,
                is_online: isUserOnline((p as { last_seen_at?: string | null }).last_seen_at),
                disabled: authUser?.banned_until
                  ? new Date(authUser.banned_until) > new Date()
                  : false,
                roles: roleMap.get(p.id) ?? [],
              };
            })
            .filter((user) => !user.roles.includes("student"));

          return json({ users: rows });
        } catch (error) {
          return errorJson(error);
        }
      },

      POST: async ({ request }) => {
        try {
          await requireSuperAdmin(request);
          const body = (await request.json()) as CreateUserBody;
          const roles = normalizeRoles(body.roles);

          if (!body.email?.trim() || !body.password || !body.full_name?.trim()) {
            return json({ error: "Full name, email and password are required." }, 400);
          }
          if (!roles.length) return json({ error: "Select at least one role." }, 400);
          if (body.password.length < 8)
            return json({ error: "Password must be at least 8 characters." }, 400);

          const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: body.email.trim(),
            password: body.password,
            email_confirm: true,
            user_metadata: {
              full_name: body.full_name.trim(),
              phone: body.phone?.trim() || null,
            },
          });
          if (error || !data.user)
            return json({ error: error?.message ?? "User creation failed." }, 400);

          const userId = data.user.id;
          const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
            id: userId,
            full_name: body.full_name.trim(),
            phone: body.phone?.trim() || null,
            updated_at: new Date().toISOString(),
          });
          if (profileErr) return json({ error: profileErr.message }, 500);

          await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
          const { error: roleErr } = await supabaseAdmin
            .from("user_roles")
            .insert(roles.map((role) => ({ user_id: userId, role })));
          if (roleErr) return json({ error: roleErr.message }, 500);

          return json({ ok: true, user_id: userId });
        } catch (error) {
          return errorJson(error);
        }
      },

      PATCH: async ({ request }) => {
        try {
          await requireSuperAdmin(request);
          const url = new URL(request.url);
          const userId = url.searchParams.get("id");
          if (!userId) return json({ error: "Missing user id." }, 400);

          const body = (await request.json()) as UpdateUserBody;
          if (body.full_name !== undefined && !body.full_name.trim()) {
            return json({ error: "Full name is required." }, 400);
          }
          if (body.email !== undefined && !body.email.trim()) {
            return json({ error: "Email is required." }, 400);
          }
          if (body.password !== undefined && body.password.length > 0 && body.password.length < 8) {
            return json({ error: "Password must be at least 8 characters." }, 400);
          }

          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (body.full_name !== undefined) patch.full_name = body.full_name.trim() || null;
          if (body.phone !== undefined) patch.phone = body.phone.trim() || null;

          const { error: profileErr } = await supabaseAdmin
            .from("profiles")
            .update(patch)
            .eq("id", userId);
          if (profileErr) return json({ error: profileErr.message }, 500);

          const authPatch: Record<string, unknown> = {};
          if (body.email !== undefined) {
            authPatch.email = body.email.trim();
            authPatch.email_confirm = true;
          }
          if (body.password) authPatch.password = body.password;
          if (body.full_name !== undefined || body.phone !== undefined) {
            authPatch.user_metadata = {
              ...(body.full_name !== undefined ? { full_name: body.full_name.trim() } : {}),
              ...(body.phone !== undefined ? { phone: body.phone.trim() || null } : {}),
            };
          }
          if (Object.keys(authPatch).length > 0) {
            const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
              userId,
              authPatch as never,
            );
            if (authErr) return json({ error: authErr.message }, 500);
          }

          if (body.roles) {
            const roles = normalizeRoles(body.roles);
            if (!roles.length) return json({ error: "Select at least one role." }, 400);
            await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
            const { error: roleErr } = await supabaseAdmin
              .from("user_roles")
              .insert(roles.map((role) => ({ user_id: userId, role })));
            if (roleErr) return json({ error: roleErr.message }, 500);
          }

          if (body.disabled !== undefined) {
            const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
              ban_duration: body.disabled ? "876000h" : "none",
            } as never);
            if (authErr) return json({ error: authErr.message }, 500);
          }

          return json({ ok: true });
        } catch (error) {
          return errorJson(error);
        }
      },

      DELETE: async ({ request }) => {
        try {
          await requireSuperAdmin(request);
          const url = new URL(request.url);
          const userId = url.searchParams.get("id");
          if (!userId) return json({ error: "Missing user id." }, 400);

          const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
          if (error) {
            const message = error.message ?? "";
            if (/database error deleting user/i.test(message)) {
              return json(
                {
                  error:
                    "Could not delete this user because records they created still reference them. Run supabase/patch-fix-user-delete-fk.sql in Supabase, then try again. Tip: you can also disable the user instead of deleting.",
                },
                409,
              );
            }
            return json({ error: message || "User deletion failed." }, 500);
          }
          return json({ ok: true });
        } catch (error) {
          return errorJson(error);
        }
      },
    },
  },
});
