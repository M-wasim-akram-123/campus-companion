import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  canAccessIntermediateExams,
  canManageExams,
} from "@/lib/exam-permissions";
import { createInternalTest } from "@/lib/internal-exams";
import { TeacherClassTestForm } from "@/components/exams/TeacherClassTestForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/exams/tests/new")({
  component: NewTeacherClassTestPage,
});

function NewTeacherClassTestPage() {
  const navigate = useNavigate();
  const { roles, teacherScope, loading, user } = useAuth();
  const allowed = canAccessIntermediateExams(roles, teacherScope);
  const examStaff = canManageExams(roles);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !allowed) {
      navigate({ to: "/dashboard", replace: true });
    } else if (!loading && examStaff) {
      navigate({ to: "/exams/series/new", replace: true });
    }
  }, [allowed, examStaff, loading, navigate]);

  if (loading || !allowed || examStaff || !user) {
    return (
      <div className="p-8 text-center text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="px-0">
        <Link to="/exams">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to my tests
        </Link>
      </Button>

      <div>
        <h1 className="text-3xl font-bold">New weekly or class test</h1>
        <p className="text-muted-foreground">
          Create a test only for a section and subject assigned to you. The
          exam department can monitor the test and its results.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Test details</CardTitle>
        </CardHeader>
        <CardContent>
          <TeacherClassTestForm
            teacherUserId={user.id}
            saving={saving}
            onSubmit={async (values) => {
              setSaving(true);
              try {
                const test = await createInternalTest(values, user.id);
                toast.success("Test created. You can enter marks now.");
                navigate({
                  to: "/exams/tests/$id",
                  params: { id: test.id },
                });
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not create test",
                );
              } finally {
                setSaving(false);
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
