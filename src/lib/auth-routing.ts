import type { AppRole } from "@/hooks/use-auth";

/** First screen after sign-in for each role mix. */
export function defaultHomePathForRoles(roles: AppRole[]): string {
  if (!roles.length) return "/settings/profile";

  if (
    roles.includes("sub_admission_officer") &&
    !roles.some((r) => ["super_admin", "admission_officer", "receptionist"].includes(r))
  ) {
    return "/inquiries";
  }
  if (roles.includes("super_admin")) return "/dashboard";
  if (roles.includes("exam_officer")) return "/exams";
  if (roles.some((r) => ["finance_admin", "finance_officer", "cashier"].includes(r))) {
    return "/finance";
  }
  if (roles.some((r) => ["admission_officer", "receptionist"].includes(r))) {
    return "/inquiries";
  }
  if (
    roles.some((r) =>
      ["campus_incharge", "registrar", "teacher", "hr"].includes(r),
    )
  ) {
    return "/students";
  }

  return "/settings/profile";
}

export const STAFF_ROLES: AppRole[] = [
  "super_admin",
  "campus_incharge",
  "registrar",
  "admission_officer",
  "sub_admission_officer",
  "hr",
  "finance_admin",
  "finance_officer",
  "cashier",
  "exam_officer",
  "receptionist",
  "teacher",
];
