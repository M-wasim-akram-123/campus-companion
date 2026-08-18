import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAcademicPromotionAutoRun } from "@/hooks/use-academic-promotion";
import { defaultHomePathForRoles } from "@/lib/auth-routing";
import { AppLayout } from "@/components/AppLayout";

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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }
  if (!user && !session) return null;
  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return <AppLayout />;
}
