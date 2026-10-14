import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAcademicPromotionAutoRun } from "@/hooks/use-academic-promotion";
import { defaultHomePathForRoles } from "@/lib/auth-routing";
import { hasRoutePermission } from "@/lib/route-permissions";
import { AppLayout } from "@/components/AppLayout";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  component: AuthGate,
});

function AuthGate() {
  const { user, session, loading, roles, teacherScope } = useAuth();
  const navigate = useNavigate();
  useAcademicPromotionAutoRun();

  useEffect(() => {
    if (!loading && !user && !session) navigate({ to: "/login" });
  }, [user, session, loading, navigate]);

  useEffect(() => {
    if (loading || !user) return;
    const path = window.location.pathname;
    if (path === "/dashboard" || path === "/dashboard/") {
      const home = defaultHomePathForRoles(roles, teacherScope);
      if (home !== "/dashboard") navigate({ to: home, replace: true });
    }
  }, [loading, user, roles, teacherScope, navigate]);

  // Route permission guard
  useEffect(() => {
    if (loading || !user || roles.length === 0) return;
    
    const path = window.location.pathname;
    
    // Skip check for profile page (open to all)
    if (path === "/settings/profile" || path === "/settings/profile/") {
      return;
    }
    
    // Check if user has permission for current route
    if (!hasRoutePermission(path, roles, teacherScope)) {
      const homePath = defaultHomePathForRoles(roles, teacherScope);
      toast.error("Access denied", {
        description: "You don't have permission to access that page.",
      });
      navigate({ to: homePath, replace: true });
    }
  }, [loading, user, roles, teacherScope, navigate]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }
  if (!user && !session) return null;
  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return <AppLayout />;
}
