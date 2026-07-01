import type { AppRole } from "@/hooks/use-auth";

import type { AppRole } from "@/hooks/use-auth";
import { isCampusInchargeScoped } from "@/lib/campus-incharge";

/** Super Admin may change student status (active, left, etc.). Campus Incharge is view-only. */
export function canChangeStudentStatus(roles: AppRole[]): boolean {
  return roles.includes("super_admin");
}

/** Campus Incharge (scoped) is view-only; other permitted roles may edit profiles. */
export function canEditStudentProfile(roles: AppRole[]): boolean {
  if (isCampusInchargeScoped(roles)) return false;
  return roles.some((role) =>
    ["super_admin", "admission_officer", "registrar"].includes(role),
  );
}

/** Only Super Admin may change remaining annual fee / installment amounts when editing a student. */
export function canEditStudentRemainingFees(roles: AppRole[]): boolean {
  return roles.includes("super_admin");
}

/** Registrar (and Super Admin) may change program, session, section, class, and matric marks obtained. */
export function canEditStudentRegistrarFields(roles: AppRole[]): boolean {
  return roles.some((role) => role === "super_admin" || role === "registrar");
}
