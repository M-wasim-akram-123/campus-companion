import type { AppRole, TeacherScope } from "@/hooks/use-auth";

/**
 * Route permission configuration matching the sidebar navigation in AppLayout.tsx
 */
export type RoutePermission = {
  roles?: AppRole[];
  teacherScopes?: TeacherScope[];
};

/**
 * Map of route patterns to their required permissions
 * Routes without entries are accessible to all authenticated users
 */
export const ROUTE_PERMISSIONS: Record<string, RoutePermission> = {
  "/dashboard": { roles: ["super_admin"] },
  
  "/inquiries": {
    roles: ["super_admin", "admission_officer", "sub_admission_officer", "receptionist"],
  },
  
  "/admissions/new": {
    roles: ["super_admin", "admission_officer"],
  },
  
  "/students": {
    roles: ["super_admin", "campus_incharge", "registrar", "admission_officer", "hr"],
  },
  
  "/students/roll-no-slips": {
    roles: ["super_admin", "registrar", "finance_admin", "finance_officer"],
  },
  
  "/students/documents": {
    roles: ["super_admin", "admission_officer", "hr", "finance_admin", "finance_officer", "bs_finance_admin"],
  },
  
  "/exams": {
    roles: ["super_admin", "exam_officer", "teacher"],
    teacherScopes: ["inter", "both"],
  },
  
  "/exams/catalog": {
    roles: ["super_admin", "exam_officer"],
  },
  
  "/exams/reports": {
    roles: ["super_admin", "exam_officer"],
  },
  
  "/exams/series": {
    roles: ["super_admin", "exam_officer"],
  },
  
  "/exams/tests": {
    roles: ["super_admin", "exam_officer", "teacher"],
    teacherScopes: ["inter", "both"],
  },
  
  "/lms": {
    roles: [
      "super_admin",
      "hod",
      "academic_coordinator",
      "bs_coordinator",
      "registrar",
      "exam_officer",
      "hr",
    ],
  },
  
  "/lms/my-classes": {
    roles: ["teacher"],
    teacherScopes: ["bs", "both"],
  },
  
  "/lms/teachers": {
    roles: [
      "super_admin",
      "hod",
      "academic_coordinator",
      "registrar",
      "exam_officer",
      "hr",
    ],
  },
  
  "/lms/departments": {
    roles: [
      "super_admin",
      "hod",
      "academic_coordinator",
      "registrar",
      "exam_officer",
      "hr",
    ],
  },
  
  "/lms/semesters": {
    roles: [
      "super_admin",
      "hod",
      "academic_coordinator",
      "registrar",
      "exam_officer",
      "hr",
    ],
  },
  
  "/lms/courses": {
    roles: [
      "super_admin",
      "hod",
      "academic_coordinator",
      "registrar",
      "exam_officer",
      "hr",
    ],
  },
  
  "/lms/offerings": {
    roles: [
      "super_admin",
      "hod",
      "academic_coordinator",
      "registrar",
      "exam_officer",
      "hr",
    ],
  },
  
  "/lms/deliveries": {
    roles: [
      "super_admin",
      "hod",
      "academic_coordinator",
      "registrar",
      "bs_coordinator",
    ],
  },
  
  "/lms/calendar": {
    roles: [
      "super_admin",
      "hod",
      "academic_coordinator",
      "registrar",
      "exam_officer",
      "hr",
    ],
  },
  
  "/lms/salary": {
    roles: [
      "super_admin",
      "hod",
      "academic_coordinator",
      "registrar",
      "exam_officer",
      "hr",
    ],
  },
  
  "/lms/classes": {
    roles: ["super_admin"], // Classes page is SA-restricted
  },
  
  "/announcements": {
    roles: ["super_admin", "exam_officer", "campus_incharge", "registrar"],
  },
  
  "/finance": {
    roles: ["super_admin", "finance_admin", "finance_officer", "cashier", "bs_finance_admin"],
  },
  
  "/settings/academic": {
    roles: ["super_admin"],
  },
  
  "/settings/board-gazette": {
    roles: ["super_admin"],
  },
  
  "/settings/fees": {
    roles: ["super_admin", "finance_admin", "finance_officer", "bs_finance_admin"],
  },
  
  "/settings/collection-plans": {
    roles: ["super_admin", "finance_admin", "bs_finance_admin"],
  },
  
  "/settings/users": {
    roles: ["super_admin"],
  },
  
  // /settings/profile is open to all authenticated users
};

/**
 * Check if user has permission to access a route
 */
export function hasRoutePermission(
  pathname: string,
  userRoles: AppRole[],
  teacherScope: TeacherScope = "both"
): boolean {
  // Find matching permission by checking route prefixes
  let permission: RoutePermission | undefined;
  let matchedPath = "";
  
  for (const [path, perm] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname === path || pathname.startsWith(path + "/")) {
      // Use the most specific match
      if (path.length > matchedPath.length) {
        matchedPath = path;
        permission = perm;
      }
    }
  }
  
  // If no permission defined, route is open to all authenticated users
  if (!permission || !permission.roles) {
    return true;
  }
  
  // Check if user has any of the required roles
  const hasRequiredRole = userRoles.some((role) => permission.roles?.includes(role));
  if (!hasRequiredRole) {
    return false;
  }
  
  // If teacherScopes are specified, check teacher scope
  if (permission.teacherScopes && userRoles.includes("teacher")) {
    return permission.teacherScopes.includes(teacherScope);
  }
  
  return true;
}

/**
 * Get the reason why a user doesn't have access
 */
export function getAccessDeniedReason(
  pathname: string,
  userRoles: AppRole[],
  teacherScope: TeacherScope = "both"
): string {
  let permission: RoutePermission | undefined;
  let matchedPath = "";
  
  for (const [path, perm] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname === path || pathname.startsWith(path + "/")) {
      if (path.length > matchedPath.length) {
        matchedPath = path;
        permission = perm;
      }
    }
  }
  
  if (!permission || !permission.roles) {
    return "Access denied";
  }
  
  const hasRequiredRole = userRoles.some((role) => permission.roles?.includes(role));
  if (!hasRequiredRole) {
    const roleNames = permission.roles.join(", ");
    return `This page requires one of these roles: ${roleNames}`;
  }
  
  if (permission.teacherScopes && userRoles.includes("teacher")) {
    if (!permission.teacherScopes.includes(teacherScope)) {
      const scopeNames = permission.teacherScopes.join(" or ");
      return `Teachers with ${scopeNames} teaching scope only`;
    }
  }
  
  return "Access denied";
}
