import { supabase } from "@/integrations/supabase/client";

async function authApi<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || "Request failed") as Error & { revoked?: boolean };
    if (json.revoked) err.revoked = true;
    throw err;
  }
  return json;
}

/** Register this login as the only active session (signs out other devices). */
export async function registerAuthSession() {
  return authApi<{ ok: boolean }>("/api/auth/session", { method: "POST" });
}

/** Clear server-side active session on logout (same device can sign in again). */
export async function clearAuthSession() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;

  await fetch("/api/auth/session", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

/** Update presence and verify session is still valid. */
export async function sendAuthHeartbeat(): Promise<{ ok: boolean; revoked?: boolean }> {
  try {
    return await authApi<{ ok: boolean }>("/api/auth/session", { method: "PATCH" });
  } catch (e: unknown) {
    if (e instanceof Error && (e as Error & { revoked?: boolean }).revoked) {
      return { ok: false, revoked: true };
    }
    throw e;
  }
}
