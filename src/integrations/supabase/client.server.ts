// Server-side Supabase client with service role key - bypasses RLS.
// Use this for admin operations in server functions and server routes only.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import {
  assertAdminKeyMatchesProject,
  supabaseServiceRoleKey,
  supabaseUrl,
} from "@/lib/supabase-env.server";

function createSupabaseAdminClient() {
  const url = supabaseUrl();
  const serviceKey = supabaseServiceRoleKey();

  if (!url || !serviceKey) {
    const missing = [
      ...(!url ? ["SUPABASE_URL"] : []),
      ...(!serviceKey ? ["SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Add the real service_role JWT from Supabase Dashboard → Settings → API.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  if (serviceKey.startsWith("sb_service_role_key_")) {
    throw new Error(
      "Invalid SUPABASE_SERVICE_ROLE_KEY. Use the real Supabase service_role JWT (starts with eyJ...), not sb_service_role_key_...",
    );
  }

  assertAdminKeyMatchesProject(url, serviceKey);

  return createClient<Database>(url, serviceKey, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;
let _supabaseAdminKey: string | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    const key = supabaseServiceRoleKey();
    if (!_supabaseAdmin || _supabaseAdminKey !== key) {
      _supabaseAdmin = createSupabaseAdminClient();
      _supabaseAdminKey = key;
    }
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
