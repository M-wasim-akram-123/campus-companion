import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sessionIdFromAccessToken } from "@/lib/auth-session";
import type { Database } from "@/integrations/supabase/types";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bearerToken(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

async function requireUser(request: Request) {
  const token = bearerToken(request);
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase environment variables.");
  }

  const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    realtime: { transport: WebSocket },
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userRes.user) throw new Response("Unauthorized", { status: 401 });

  const sessionId = sessionIdFromAccessToken(token);
  if (!sessionId) throw new Response("Invalid session token", { status: 400 });

  return { user: userRes.user, token, sessionId };
}

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      /** Called after login — ends other browser sessions and registers this one. */
      POST: async ({ request }) => {
        try {
          const { user, token, sessionId } = await requireUser(request);
          const now = new Date().toISOString();

          const { error: signOutErr } = await supabaseAdmin.auth.admin.signOut(token, "others");
          if (signOutErr) {
            console.warn("[auth/session] signOut others:", signOutErr.message);
          }

          const { error: profileErr } = await supabaseAdmin
            .from("profiles")
            .update({
              active_auth_session_id: sessionId,
              last_seen_at: now,
              last_login_at: now,
              updated_at: now,
            })
            .eq("id", user.id);

          if (profileErr) {
            if (
              profileErr.message.includes("active_auth_session_id") ||
              profileErr.message.includes("last_seen_at")
            ) {
              return json(
                {
                  error:
                    "Session tracking columns are missing. Run supabase/patch-staff-session-presence.sql in Supabase.",
                },
                500,
              );
            }
            return json({ error: profileErr.message }, 500);
          }

          return json({ ok: true, session_id: sessionId });
        } catch (error) {
          if (error instanceof Response) {
            return json({ error: await error.text() }, error.status);
          }
          const message = error instanceof Error ? error.message : "Session registration failed.";
          return json({ error: message }, 500);
        }
      },

      /** Heartbeat — refresh last seen and verify this session is still the active one. */
      PATCH: async ({ request }) => {
        try {
          const { user, sessionId } = await requireUser(request);
          const now = new Date().toISOString();

          const { data: profile, error: fetchErr } = await supabaseAdmin
            .from("profiles")
            .select("active_auth_session_id")
            .eq("id", user.id)
            .maybeSingle();

          if (fetchErr) return json({ error: fetchErr.message }, 500);

          const activeId = (profile as { active_auth_session_id?: string | null } | null)
            ?.active_auth_session_id;

          if (activeId && activeId !== sessionId) {
            return json(
              {
                ok: false,
                revoked: true,
                error: "You were signed out because this account logged in on another device.",
              },
              409,
            );
          }

          const { error: updateErr } = await supabaseAdmin
            .from("profiles")
            .update({ last_seen_at: now, updated_at: now })
            .eq("id", user.id);

          if (updateErr) return json({ error: updateErr.message }, 500);

          return json({ ok: true, last_seen_at: now });
        } catch (error) {
          if (error instanceof Response) {
            return json({ error: await error.text() }, error.status);
          }
          const message = error instanceof Error ? error.message : "Heartbeat failed.";
          return json({ error: message }, 500);
        }
      },
    },
  },
});
