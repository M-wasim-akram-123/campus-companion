import type { AppRole } from "@/hooks/use-auth";

export const INQUIRY_MANAGER_ROLES: AppRole[] = ["super_admin", "admission_officer", "receptionist"];

export const SUB_OFFICER_ALLOWED_STATUSES = ["follow_up", "interested", "lost"] as const;

export type SubOfficerInquiryStatus = (typeof SUB_OFFICER_ALLOWED_STATUSES)[number];

export function isSubAdmissionOfficer(roles: AppRole[]): boolean {
  return roles.includes("sub_admission_officer");
}

export function canManageInquiries(roles: AppRole[]): boolean {
  return INQUIRY_MANAGER_ROLES.some((role) => roles.includes(role));
}

/** Sub admission officer without full inquiry manager access. */
export function isFollowUpOnlyOfficer(roles: AppRole[]): boolean {
  return isSubAdmissionOfficer(roles) && !canManageInquiries(roles);
}

export function canAssignFollowUpOfficer(roles: AppRole[]): boolean {
  return roles.includes("super_admin") || roles.includes("admission_officer");
}

export function canAccessInquiryFollowUp(
  inquiry: { follow_up_assigned_to?: string | null },
  userId: string | undefined,
  roles: AppRole[],
): boolean {
  if (!userId) return false;
  if (canManageInquiries(roles)) return true;
  if (isFollowUpOnlyOfficer(roles)) return inquiry.follow_up_assigned_to === userId;
  return false;
}

export function canDeleteInquiry(roles: AppRole[]): boolean {
  return roles.includes("super_admin");
}

export function isSubOfficerAllowedStatus(status: string): status is SubOfficerInquiryStatus {
  return SUB_OFFICER_ALLOWED_STATUSES.includes(status as SubOfficerInquiryStatus);
}
