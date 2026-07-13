import type { AppRole } from "@/hooks/use-auth";

const ANNOUNCEMENT_MANAGER_ROLES: AppRole[] = [
  "super_admin",
  "exam_officer",
  "campus_incharge",
  "registrar",
];

export function canManageAnnouncements(roles: AppRole[]): boolean {
  return roles.some((r) => ANNOUNCEMENT_MANAGER_ROLES.includes(r));
}
