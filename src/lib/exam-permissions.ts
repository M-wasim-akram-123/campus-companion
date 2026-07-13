import type { AppRole } from "@/hooks/use-auth";

const EXAM_STAFF_ROLES: AppRole[] = ["super_admin", "exam_officer"];

export function canManageExams(roles: AppRole[]): boolean {
  return roles.some((r) => EXAM_STAFF_ROLES.includes(r));
}

export function canViewExamMarks(roles: AppRole[]): boolean {
  return canManageExams(roles);
}
