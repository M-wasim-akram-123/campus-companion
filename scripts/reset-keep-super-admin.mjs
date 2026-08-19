/**
 * Wipe all campus data except super_admin auth users / profiles / roles.
 * Usage: node scripts/reset-keep-super-admin.mjs
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

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
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket },
});

const VIEWS = new Set([
  "finance_defaulters",
  "finance_monthly_collection",
  "finance_section_summary",
  "finance_upcoming_month",
]);

const TABLES = [
  "fee_payment_allocations",
  "fee_voucher_lines",
  "fee_payments",
  "fee_vouchers",
  "student_fee_installments",
  "student_fee_projections",
  "student_fee_plans",
  "student_finance_ledger",
  "finance_audit_log",
  "cashier_sessions",
  "finance_counters",
  "internal_test_marks",
  "internal_test_section_meta",
  "internal_tests",
  "internal_test_series_sections",
  "internal_test_series",
  "student_academic_ledger",
  "student_academic_year_closes",
  "session_academic_year_closes",
  "lms_lecture_deliveries",
  "lms_salary_lecture_entries",
  "lms_teacher_leaves",
  "lms_campus_day_offs",
  "lms_course_enrollments",
  "lms_student_semester_enrollments",
  "lms_teacher_assignments",
  "lms_course_offerings",
  "lms_class_groups",
  "lms_program_courses",
  "lms_semester_instances",
  "lms_semester_templates",
  "lms_department_programs",
  "lms_teacher_profiles",
  "lms_courses",
  "lms_departments",
  "student_document_audit_log",
  "student_documents",
  "student_promotion_log",
  "roll_no_slip_requests",
  "board_gazette_results",
  "board_gazette_imports",
  "announcement_sections",
  "announcements",
  "inquiry_interactions",
  "inquiries",
  "intermediate_teacher_assignments",
  "intermediate_section_subjects",
  "intermediate_subjects",
  "campus_incharge_assignments",
  "students",
  "sections",
  "classes",
  "fee_policy_installment_templates",
  "fee_policy_components",
  "fee_scholarship_slabs",
  "fee_collection_plans",
  "admission_fee_policies",
  "admission_number_counters",
  "academic_sessions",
  "programs",
];

async function deleteAll(table) {
  const attempts = [
    () => admin.from(table).delete().not("id", "is", null),
    () => admin.from(table).delete().gte("created_at", "1970-01-01"),
    () => admin.from(table).delete().not("user_id", "is", null),
    () => admin.from(table).delete().not("student_id", "is", null),
    () => admin.from(table).delete().not("offering_id", "is", null),
    () => admin.from(table).delete().not("department_id", "is", null),
    () => admin.from(table).delete().not("series_id", "is", null),
    () => admin.from(table).delete().not("off_date", "is", null),
  ];
  let lastError = null;
  for (const run of attempts) {
    const { error } = await run();
    if (!error) return { ok: true };
    lastError = error.message;
    if (/column|schema cache|does not exist|Could not find/i.test(error.message)) continue;
    if (/foreign key|violates/i.test(error.message)) return { ok: false, fk: true, error: error.message };
    return { ok: false, error: error.message };
  }
  return { ok: false, error: lastError };
}

async function main() {
  const { data: roleRows, error: roleErr } = await admin
    .from("user_roles")
    .select("user_id, role")
    .eq("role", "super_admin");
  if (roleErr) throw new Error(`Could not load super_admin roles: ${roleErr.message}`);

  const superIds = [...new Set((roleRows ?? []).map((r) => r.user_id))];
  if (!superIds.length) throw new Error("No super_admin user found. Aborting.");

  const { data: authList, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (authErr) throw new Error(`Could not list auth users: ${authErr.message}`);

  const users = authList.users ?? [];
  const superUsers = users.filter((u) => superIds.includes(u.id));
  const realSupers = superUsers.filter((u) => !u.email?.toLowerCase().endsWith("@test.local"));
  const keep = (realSupers.length ? realSupers : superUsers).map((u) => ({
    id: u.id,
    email: u.email,
  }));
  const keepIds = new Set(keep.map((u) => u.id));

  console.log("Keeping super admin(s):");
  for (const u of keep) console.log(`  - ${u.email} (${u.id})`);

  for (const bucket of ["student-photos", "student-documents"]) {
    const { data: objects } = await admin.storage.from(bucket).list("", { limit: 1000 });
    if (objects?.length) {
      const paths = objects.map((o) => o.name);
      await admin.storage.from(bucket).remove(paths);
    }
  }

  for (let pass = 1; pass <= 8; pass++) {
    let blocked = 0;
    for (const table of TABLES) {
      if (VIEWS.has(table)) continue;
      const result = await deleteAll(table);
      if (!result.ok) {
        blocked += 1;
        if (pass === 8) console.warn(`  leftover ${table}: ${result.error}`);
      }
    }
    if (blocked === 0) break;
  }

  const { error: extraRolesErr } = await admin
    .from("user_roles")
    .delete()
    .not("user_id", "in", `(${[...keepIds].join(",")})`);
  if (extraRolesErr) {
    for (const id of users.map((u) => u.id).filter((id) => !keepIds.has(id))) {
      await admin.from("user_roles").delete().eq("user_id", id);
    }
  }

  const { error: extraRoleTypeErr } = await admin.from("user_roles").delete().neq("role", "super_admin");
  if (extraRoleTypeErr) console.warn("role cleanup:", extraRoleTypeErr.message);

  const { error: extraProfilesErr } = await admin
    .from("profiles")
    .delete()
    .not("id", "in", `(${[...keepIds].join(",")})`);
  if (extraProfilesErr) {
    for (const u of users.filter((u) => !keepIds.has(u.id))) {
      await admin.from("profiles").delete().eq("id", u.id);
    }
  }

  let deletedUsers = 0;
  for (const u of users) {
    if (keepIds.has(u.id)) continue;
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) console.warn(`auth delete ${u.email}: ${error.message}`);
    else deletedUsers += 1;
  }

  const { count: students } = await admin.from("students").select("id", { count: "exact", head: true });
  const { count: inquiries } = await admin.from("inquiries").select("id", { count: "exact", head: true });
  const { count: programs } = await admin.from("programs").select("id", { count: "exact", head: true });
  const { count: roles } = await admin.from("user_roles").select("user_id", { count: "exact", head: true });
  const remainingAuth = (await admin.auth.admin.listUsers({ perPage: 1000 })).data?.users ?? [];

  console.log("\nReset complete.");
  console.log(`Auth users kept: ${remainingAuth.map((u) => u.email).join(", ") || "(none)"}`);
  console.log(`Auth users deleted: ${deletedUsers}`);
  console.log(`Remaining roles: ${roles ?? 0}`);
  console.log(`Students: ${students ?? 0}`);
  console.log(`Inquiries: ${inquiries ?? 0}`);
  console.log(`Programs: ${programs ?? 0}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
