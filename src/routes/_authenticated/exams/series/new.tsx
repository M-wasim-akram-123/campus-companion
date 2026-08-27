import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canManageExams } from "@/lib/exam-permissions";
import { createInternalTestSeries } from "@/lib/internal-exams";
import { InternalTestSeriesForm } from "@/components/exams/InternalTestSeriesForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/exams/series/new")({
  component: NewTestSeriesPage,
});

function NewTestSeriesPage() {
  const navigate = useNavigate();
  const { roles, loading, user } = useAuth();
  const allowed = canManageExams(roles);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !allowed) navigate({ to: "/dashboard" });
  }, [allowed, loading, navigate]);

  if (loading || !allowed) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="px-0">
        <Link to="/exams"><ArrowLeft className="mr-2 h-4 w-4" />Back to exams</Link>
      </Button>
      <div>
        <h1 className="text-3xl font-bold">Announce test series</h1>
        <p className="text-muted-foreground">
          Create Test 1, Test 2, etc. Papers are announced automatically for every subject already
          assigned to the selected sections. Subjects without marks stay out of the series.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Series details</CardTitle>
        </CardHeader>
        <CardContent>
          <InternalTestSeriesForm
            saving={saving}
            onSubmit={async (values) => {
              setSaving(true);
              try {
                const series = await createInternalTestSeries(values, user?.id ?? null);
                toast.success("Test series announced for assigned subjects");
                navigate({ to: "/exams/series/$id", params: { id: series.id } });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not create series");
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
