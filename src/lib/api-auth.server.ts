import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import type { Database } from "@/integrations/supabase/types";

function createUserClient(token: string) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    realtime: { transport: WebSocket },
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

export async function requireStaff(request: Request) {
  const token = bearerToken(request);
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const userClient = createUserClient(token);
  const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userRes.user) throw new Response("Unauthorized", { status: 401 });

  const { data: roles, error: roleErr } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id);
  if (roleErr || !roles?.length) throw new Response("Forbidden", { status: 403 });

  return userRes.user;
}

export async function requireSuperAdmin(request: Request) {
  const token = bearerToken(request);
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const userClient = createUserClient(token);
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
