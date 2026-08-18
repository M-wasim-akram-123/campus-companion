import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { sessionIdFromAccessToken, userIdFromAccessToken } from "@/lib/auth-session";
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

function supabasePublicConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url, publishableKey };
}

/** Same auth combo as the working token/login client: publishable apikey + user JWT. */
function createUserClient(token: string) {
  const { url, publishableKey } = supabasePublicConfig();
  return createClient<Database>(url, publishableKey, {
    realtime: { transport: WebSocket },
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function requireUser(request: Request) {
  const token = bearerToken(request);
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const userId = userIdFromAccessToken(token);
  const sessionId = sessionIdFromAccessToken(token);
  if (!userId) throw new Response("Unauthorized", { status: 401 });
  if (!sessionId) throw new Response("Invalid session token", { status: 400 });

  return { userId, token, sessionId, client: createUserClient(token) };
}

/** Sign out other devices using the user JWT — never send sb_secret_ to Auth. */
async function signOutOtherSessions(token: string) {
  try {
    const { url, publishableKey } = supabasePublicConfig();
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/logout?scope=others`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[auth/session] signOut others:", res.status, body.slice(0, 200));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[auth/session] signOut others:", message);
  }
}

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      /** Called after login — ends other browser sessions and registers this one. */
      POST: async ({ request }) => {
        try {
          const { userId, token, sessionId, client } = requireUser(request);
          const now = new Date().toISOString();

          await signOutOtherSessions(token);

          const { error: profileErr } = await client
            .from("profiles")
            .update({
              active_auth_session_id: sessionId,
              last_seen_at: now,
              last_login_at: now,
              updated_at: now,
            })
            .eq("id", userId);

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
          const { userId, sessionId, client } = requireUser(request);
          const now = new Date().toISOString();

          const { data: profile, error: fetchErr } = await client
            .from("profiles")
            .select("active_auth_session_id")
            .eq("id", userId)
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

          const { error: updateErr } = await client
            .from("profiles")
            .update({ last_seen_at: now, updated_at: now })
            .eq("id", userId);

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

      /** Logout — release the active session slot so the same user can sign in again. */
      DELETE: async ({ request }) => {
        try {
          const { userId, client } = requireUser(request);
          const now = new Date().toISOString();

          const { error: updateErr } = await client
            .from("profiles")
            .update({
              active_auth_session_id: null,
              last_seen_at: now,
              updated_at: now,
            })
            .eq("id", userId);

          if (updateErr) return json({ error: updateErr.message }, 500);

          return json({ ok: true });
        } catch (error) {
          if (error instanceof Response) {
            return json({ error: await error.text() }, error.status);
          }
          const message = error instanceof Error ? error.message : "Session clear failed.";
          return json({ error: message }, 500);
        }
      },
    },
  },
});
