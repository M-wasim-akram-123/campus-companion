import type { AppRole } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { hasBroadStudentAccess } from "@/lib/campus-incharge";

/** Teacher without broader student-admin roles — limited to assigned Inter sections + BS offerings. */
export function isTeacherScoped(roles: AppRole[]): boolean {
  return roles.includes("teacher") && !hasBroadStudentAccess(roles);
}

export async function fetchIntermediateTeacherSectionIds(userId?: string): Promise<string[]> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userId ?? userRes.user?.id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from("intermediate_teacher_assignments")
    .select("section_id")
    .eq("teacher_user_id", uid);
  if (error) throw error;
  return (data ?? []).map((row) => row.section_id);
}

export async function saveIntermediateTeacherSectionIds(userId: string, sectionIds: string[]) {
  const { error: deleteError } = await supabase
    .from("intermediate_teacher_assignments")
    .delete()
    .eq("teacher_user_id", userId);
  if (deleteError) throw deleteError;

  if (!sectionIds.length) return;

  const { error: insertError } = await supabase.from("intermediate_teacher_assignments").insert(
    sectionIds.map((section_id) => ({ teacher_user_id: userId, section_id })),
  );
  if (insertError) throw insertError;
}
