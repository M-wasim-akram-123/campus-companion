import type { AppRole } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

const BROAD_STUDENT_ACCESS_ROLES: AppRole[] = [
  "super_admin",
  "admission_officer",
  "registrar",
  "hr",
  "finance_admin",
  "finance_officer",
  "cashier",
  "receptionist",
  "teacher",
  "sub_admission_officer",
];

/** Staff with full student module access (not class-scoped campus incharge). */
export function hasBroadStudentAccess(roles: AppRole[]): boolean {
  return roles.some((role) => BROAD_STUDENT_ACCESS_ROLES.includes(role));
}

/** Campus incharge without broader roles — limited to assigned classes, view-only. */
export function isCampusInchargeScoped(roles: AppRole[]): boolean {
  return roles.includes("campus_incharge") && !hasBroadStudentAccess(roles);
}

export async function fetchCampusInchargeClassIds(userId?: string): Promise<string[]> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userId ?? userRes.user?.id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from("campus_incharge_assignments")
    .select("class_id")
    .eq("user_id", uid);
  if (error) throw error;
  return (data ?? []).map((row) => row.class_id);
}

export async function saveCampusInchargeClassIds(userId: string, classIds: string[]) {
  const { error: deleteError } = await supabase
    .from("campus_incharge_assignments")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw deleteError;

  if (!classIds.length) return;

  const { error: insertError } = await supabase.from("campus_incharge_assignments").insert(
    classIds.map((class_id) => ({ user_id: userId, class_id })),
  );
  if (insertError) throw insertError;
}

export async function fetchCampusInchargeAssignmentsForUser(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("campus_incharge_assignments")
    .select("class_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.class_id);
}
