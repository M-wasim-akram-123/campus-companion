import type { AppRole, TeacherScope } from "@/hooks/use-auth";

const EXAM_STAFF_ROLES: AppRole[] = ["super_admin", "exam_officer"];
const INTERMEDIATE_TEST_ROLES: AppRole[] = [
  ...EXAM_STAFF_ROLES,
  "teacher",
];

export function canManageExams(roles: AppRole[]): boolean {
  return roles.some((r) => EXAM_STAFF_ROLES.includes(r));
}

export function canAccessIntermediateExams(
  roles: AppRole[],
  teacherScope: TeacherScope = "both",
): boolean {
  if (canManageExams(roles)) return true;
  return (
    roles.some((role) => INTERMEDIATE_TEST_ROLES.includes(role)) &&
    (teacherScope === "inter" || teacherScope === "both")
  );
}

export function canViewExamMarks(roles: AppRole[]): boolean {
  return canManageExams(roles);
}
