import { createClient } from "@supabase/supabase-js";
import { userIdFromAccessToken } from "@/lib/auth-session";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase-env.server";
import type { Database } from "@/integrations/supabase/types";

function supabasePublicConfig() {
  const url = supabaseUrl();
  const publishableKey = supabasePublishableKey();
  if (!url || !publishableKey) {
    throw new Error(
      "Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return { url, publishableKey };
}

function createUserClient(token: string) {
  const { url, publishableKey } = supabasePublicConfig();
  return createClient<Database>(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function bearerToken(request: Request): string {
  const auth = request.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function requireAccessToken(request: Request) {
  const token = bearerToken(request);
  if (!token) throw new Response("Unauthorized", { status: 401 });
  const userId = userIdFromAccessToken(token);
  if (!userId) throw new Response("Unauthorized", { status: 401 });
  return { token, userId, client: createUserClient(token) };
}

export async function requireStaff(request: Request) {
  const { userId, client } = requireAccessToken(request);

  const { data: roles, error: roleErr } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (roleErr || !roles?.length) throw new Response("Forbidden", { status: 403 });

  return { id: userId };
}

export async function requireSuperAdmin(request: Request) {
  const { userId, client } = requireAccessToken(request);

  const { data: roleRows, error: roleErr } = await client
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (roleErr || !roleRows) throw new Response("Forbidden", { status: 403 });

  return { id: userId };
}
