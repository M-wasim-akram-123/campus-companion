import type { AppRole, TeacherScope } from "@/hooks/use-auth";

export const LMS_ROLES: AppRole[] = [
  "super_admin",
  "hod",
  "academic_coordinator",
  "bs_coordinator",
  "registrar",
  "teacher",
  "exam_officer",
  "hr",
  "student",
];

export function canAccessLms(roles: AppRole[]): boolean {
  return roles.some((role) => LMS_ROLES.includes(role));
}

export function canAccessMyBsClasses(
  roles: AppRole[],
  teacherScope: TeacherScope,
): boolean {
  if (!roles.includes("teacher")) return false;
  return teacherScope === "bs" || teacherScope === "both";
}

export function canManageLmsAcademics(roles: AppRole[]): boolean {
  return roles.some((role) =>
    ["super_admin", "hod", "academic_coordinator", "registrar"].includes(role),
  );
}

export function canManageLmsTeachers(roles: AppRole[]): boolean {
  return roles.some((role) =>
    ["super_admin", "hod", "academic_coordinator", "registrar", "hr"].includes(role),
  );
}

export function canManageTeacherCompensation(roles: AppRole[]): boolean {
  return roles.some((role) => role === "super_admin" || role === "hr");
}

export function canManageLmsExams(roles: AppRole[]): boolean {
  return roles.some((role) => role === "super_admin" || role === "exam_officer");
}

/** Salary sheet + day offs / leave: BS LMS staff only — finance and BS coordinators not included. */
export function canViewLmsSalarySheet(roles: AppRole[]): boolean {
  return roles.some((role) =>
    ["super_admin", "hod", "academic_coordinator", "registrar", "exam_officer", "hr"].includes(role),
  );
}

export function canManageLmsCalendar(roles: AppRole[]): boolean {
  return canViewLmsSalarySheet(roles);
}

/** Academic managers always; BS coordinators mark only assigned semesters (enforced in DB). */
export function canMarkLectureDeliveries(roles: AppRole[]): boolean {
  return roles.some((role) =>
    ["super_admin", "hod", "academic_coordinator", "registrar", "bs_coordinator"].includes(role),
  );
}

export function isBsCoordinator(roles: AppRole[]): boolean {
  return roles.includes("bs_coordinator");
}
