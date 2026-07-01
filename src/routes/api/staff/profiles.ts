import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireStaff(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.");
  }

  const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    realtime: { transport: WebSocket },
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userRes.user) throw new Response("Unauthorized", { status: 401 });

  const { data: roles, error: roleErr } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id);
  if (roleErr || !roles?.length) throw new Response("Forbidden", { status: 403 });

  return userRes.user;
}

export const Route = createFileRoute("/api/staff/profiles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireStaff(request);
          const url = new URL(request.url);
          const ids = [...new Set((url.searchParams.get("ids") ?? "").split(",").filter(Boolean))];
          if (!ids.length) return json({ profiles: [] });

          const [{ data: profiles, error: profileErr }, authUsers] = await Promise.all([
            supabaseAdmin.from("profiles").select("id, full_name").in("id", ids),
            supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
          ]);
          if (profileErr) return json({ error: profileErr.message }, 500);
          if (authUsers.error) return json({ error: authUsers.error.message }, 500);

          const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || ""]));
          const authMap = new Map(authUsers.data.users.map((u) => [u.id, u]));
          const rows = ids.map((id) => {
            const authUser = authMap.get(id);
            return {
              id,
              full_name:
                profileMap.get(id) ||
                (authUser?.user_metadata?.full_name as string | undefined) ||
                authUser?.email ||
                "Unknown",
            };
          });

          return json({ profiles: rows });
        } catch (error) {
          if (error instanceof Response) return json({ error: await error.text() }, error.status);
          return json({ error: error instanceof Error ? error.message : "Failed to load staff profiles." }, 500);
        }
      },
    },
  },
});
