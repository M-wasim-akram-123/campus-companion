/**
 * Creates or resets the super admin via Supabase Auth Admin API.
 *
 * Requires in .env:
 *   VITE_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (Dashboard → Settings → API → service_role)
 *
 * Usage: npm run create-admin
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ADMIN_ID = "a0000000-0000-4000-8000-000000000001";
const EMAIL = "admin@college.edu.pk";
const PASSWORD = "SuperAdmin@2026";

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
    "Missing SUPABASE_SERVICE_ROLE_KEY in .env\n" +
      "Get it from: https://supabase.com/dashboard/project/_/settings/api\n" +
      "Add: SUPABASE_SERVICE_ROLE_KEY=your_service_role_key",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing } = await admin.auth.admin.getUserById(ADMIN_ID);

if (existing?.user) {
  const { error } = await admin.auth.admin.updateUserById(ADMIN_ID, {
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Super Admin" },
  });
  if (error) {
    console.error("Failed to update admin:", error.message);
    process.exit(1);
  }
  console.log("Updated existing super admin password.");
} else {
  const { error } = await admin.auth.admin.createUser({
    id: ADMIN_ID,
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Super Admin" },
  });
  if (error) {
    console.error("Failed to create admin:", error.message);
    process.exit(1);
  }
  console.log("Created super admin user.");
}

const { error: profileError } = await admin.from("profiles").upsert({
  id: ADMIN_ID,
  full_name: "Super Admin",
});

if (profileError) console.warn("Profile upsert:", profileError.message);

const { error: roleError } = await admin.from("user_roles").upsert(
  { user_id: ADMIN_ID, role: "super_admin" },
  { onConflict: "user_id,role" },
);

if (roleError) console.warn("Role upsert:", roleError.message);

console.log("\nSuper admin ready:");
console.log("  Email:   ", EMAIL);
console.log("  Password:", PASSWORD);
