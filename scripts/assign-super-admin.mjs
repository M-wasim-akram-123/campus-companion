/**
 * Assign super_admin to an existing user by email (needs service role key).
 *
 * Usage: npm run assign-super-admin -- admin@college.com
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const email = process.argv[2] || "admin@college.com";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"\n]*)"?/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Add SUPABASE_SERVICE_ROLE_KEY to .env (Supabase → Settings → API → service_role secret)\n" +
      "Or run supabase/assign-super-admin.sql in SQL Editor instead.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error(listError.message);
  process.exit(1);
}

const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

const { error: roleError } = await admin.from("user_roles").upsert(
  { user_id: user.id, role: "super_admin" },
  { onConflict: "user_id,role" },
);
if (roleError) {
  console.error("Role assign failed:", roleError.message);
  process.exit(1);
}

await admin.from("profiles").upsert({
  id: user.id,
  full_name: user.user_metadata?.full_name || "Admin",
});

console.log(`Assigned super_admin to ${email} (user id: ${user.id})`);
console.log("Sign out and sign in again so roles refresh in the app.");
