import type { AppRole, TeacherScope } from "@/hooks/use-auth";

/** First screen after sign-in for each role mix. */
export function defaultHomePathForRoles(
  roles: AppRole[],
  teacherScope: TeacherScope = "both",
): string {
  if (!roles.length) return "/settings/profile";

  if (
    roles.includes("sub_admission_officer") &&
    !roles.some((r) => ["super_admin", "admission_officer", "receptionist"].includes(r))
  ) {
    return "/inquiries";
  }
  if (roles.includes("super_admin")) return "/dashboard";
  if (roles.includes("bs_coordinator") && !roles.some((r) => ["hod", "academic_coordinator", "registrar", "super_admin"].includes(r))) {
    return "/lms/deliveries";
  }
  if (roles.includes("teacher") && !roles.some((r) => ["hod", "academic_coordinator", "bs_coordinator"].includes(r))) {
    return teacherScope === "bs" ? "/lms/my-classes" : "/exams";
  }
  if (roles.some((r) => ["hod", "academic_coordinator"].includes(r))) {
    return "/lms";
  }
  if (roles.includes("exam_officer")) return "/exams";
  if (roles.includes("bs_finance_admin") && !roles.some((r) => ["super_admin", "finance_admin", "finance_officer", "cashier"].includes(r))) {
    return "/finance";
  }
  if (roles.some((r) => ["finance_admin", "finance_officer", "cashier"].includes(r))) {
    return "/finance";
  }
  if (roles.some((r) => ["admission_officer", "receptionist"].includes(r))) {
    return "/inquiries";
  }
  if (roles.some((r) => ["campus_incharge", "registrar", "hr"].includes(r))) {
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
  "bs_finance_admin",
  "cashier",
  "exam_officer",
  "receptionist",
  "hod",
  "academic_coordinator",
  "bs_coordinator",
  "teacher",
];
