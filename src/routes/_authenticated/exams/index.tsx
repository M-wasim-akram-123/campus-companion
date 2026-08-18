import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccessIntermediateExams } from "@/lib/exam-permissions";
import { ExamDashboard } from "@/components/exams/ExamDashboard";

export const Route = createFileRoute("/_authenticated/exams/")({
  component: ExamsIndexPage,
});

function ExamsIndexPage() {
  const navigate = useNavigate();
  const { roles, teacherScope, loading } = useAuth();
  const allowed = canAccessIntermediateExams(roles, teacherScope);

  useEffect(() => {
    if (!loading && !allowed) navigate({ to: "/dashboard" });
  }, [allowed, loading, navigate]);

  if (loading || !allowed) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  return <ExamDashboard />;
}
