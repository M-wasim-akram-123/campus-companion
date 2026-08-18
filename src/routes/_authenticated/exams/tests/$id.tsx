import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccessIntermediateExams, canManageExams } from "@/lib/exam-permissions";
import {
  academicYearLabel,
  completeInternalTestSection,
  fetchInternalTestById,
  fetchInternalTestSectionMeta,
  fetchSeriesSections,
  formatSeriesSectionLabel,
  listStudentsForTest,
  publishInternalTest,
  saveTestMarks,
  seriesName,
  type SeriesSectionOption,
} from "@/lib/internal-exams";
import { ordinalYearLabel } from "@/lib/academic";
import { MarksEntryTable } from "@/components/exams/MarksEntryTable";
import { PublishTestDialog } from "@/components/exams/PublishTestDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/exams/tests/$id")({
  component: InternalTestDetailPage,
});

const EMPTY_SECTIONS: SeriesSectionOption[] = [];

function InternalTestDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles, teacherScope, loading, user } = useAuth();
  const allowed = canAccessIntermediateExams(roles, teacherScope);
  const canManage = canManageExams(roles);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [sectionId, setSectionId] = useState("");

  useEffect(() => {
    if (!loading && !allowed) navigate({ to: "/dashboard" });
  }, [allowed, loading, navigate]);

  const { data: test, isLoading } = useQuery({
    queryKey: ["internal-test", id],
    enabled: !!id && allowed,
    queryFn: () => fetchInternalTestById(id),
  });

  const { data: seriesSectionsData } = useQuery({
    queryKey: ["internal-test-series-sections", test?.series_id],
    enabled: !!test?.series_id,
    queryFn: () => fetchSeriesSections(test!.series_id!),
  });
  const seriesSections = seriesSectionsData ?? EMPTY_SECTIONS;
  const { data: sectionMeta = [] } = useQuery({
    queryKey: ["internal-test-section-meta", id],
    enabled: !!test,
    queryFn: () => fetchInternalTestSectionMeta(id),
  });

  const sectionOptions = useMemo(() => {
    const all =
      test?.section_id && test.sections?.name
        ? [
            {
              id: test.section_id,
              name: test.sections.name,
              gender: (test.sections.gender ?? "boys") as "boys" | "girls",
            },
          ]
        : seriesSections;

    if (canManage || !sectionMeta.length) return all;

    const allowedSectionIds = new Set(
      sectionMeta
        .filter((row) => row.teacher_user_id === user?.id)
        .map((row) => row.section_id),
    );
    return all.filter((section) => allowedSectionIds.has(section.id));
  }, [canManage, sectionMeta, seriesSections, test, user?.id]);

  useEffect(() => {
    if (!sectionOptions.length) {
      setSectionId((prev) => (prev === "" ? prev : ""));
      return;
    }
    setSectionId((prev) => (sectionOptions.some((s) => s.id === prev) ? prev : sectionOptions[0].id));
  }, [sectionOptions]);

  const selectedSection = sectionOptions.find((s) => s.id === sectionId);
  const selectedMeta = sectionMeta.find((row) => row.section_id === sectionId);

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["internal-test-students", id, sectionId],
    enabled: !!test && !!sectionId,
    queryFn: () => listStudentsForTest(test!, sectionId),
  });

  if (loading || !allowed) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  if (isLoading || !test) {
    return <div className="p-8 text-center text-muted-foreground">Loading test…</div>;
  }

  const readOnly =
    test.status === "published" || (!canManage && selectedMeta?.marks_completed === true);
  const testLabel = `${test.subject_name} — ${seriesName(test)}`;
  const backTo = test.series_id ? "/exams/series/$id" : "/exams";
  const backParams = test.series_id ? { id: test.series_id } : undefined;
  const scopeLabel = selectedSection ? formatSeriesSectionLabel(selectedSection) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="px-0">
            {test.series_id ? (
              <Link to={backTo} params={backParams}>
                <ArrowLeft className="mr-2 h-4 w-4" />Back to {seriesName(test)}
              </Link>
            ) : (
              <Link to="/exams"><ArrowLeft className="mr-2 h-4 w-4" />Back to exams</Link>
            )}
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{testLabel}</h1>
            <p className="text-muted-foreground">
              {test.academic_sessions?.label ?? "Session"} · {ordinalYearLabel(test.class_year_level)} ·{" "}
              {academicYearLabel(test.academic_year_start)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={test.status === "published" ? "default" : "secondary"} className="capitalize">
            {test.status}
          </Badge>
          {canManage && test.status === "draft" && (
            <PublishTestDialog
              testLabel={testLabel}
              publishing={publishing}
              onConfirm={async () => {
                setPublishing(true);
                try {
                  await publishInternalTest(test.id);
                  toast.success("Results published to student mobile");
                  await qc.invalidateQueries({ queryKey: ["internal-test", id] });
                  await qc.invalidateQueries({ queryKey: ["internal-tests"] });
                  if (test.series_id) {
                    await qc.invalidateQueries({ queryKey: ["internal-test-series-subjects", test.series_id] });
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Publish failed");
                } finally {
                  setPublishing(false);
                }
              }}
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Test date</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-semibold">{test.test_date}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Teacher</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {selectedMeta?.teacher_name_snapshot || test.teacher_name || "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Paper received</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {selectedMeta ? (selectedMeta.paper_received ? "Yes" : "No") : test.paper_received ? "Yes" : "No"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Max marks</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-semibold">{test.max_marks}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Students in section</CardTitle></CardHeader>
          <CardContent><div className="text-lg font-semibold">{students.length}</div></CardContent>
        </Card>
      </div>

      {test.published_at && (
        <p className="text-sm text-muted-foreground">
          Published {new Date(test.published_at).toLocaleString()}
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 space-y-0">
          <CardTitle>Mark entry</CardTitle>
          {sectionOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <Label htmlFor="marks-section" className="text-sm text-muted-foreground">
                Section
              </Label>
              <Select value={sectionId} onValueChange={setSectionId} disabled={readOnly && sectionOptions.length <= 1}>
                <SelectTrigger id="marks-section" className="w-[220px]">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {sectionOptions.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {formatSeriesSectionLabel(section)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {selectedMeta?.marks_completed && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Mark sheet completed by {selectedMeta.teacher_name_snapshot}
              {selectedMeta.marks_completed_at
                ? ` on ${new Date(selectedMeta.marks_completed_at).toLocaleString()}`
                : ""}
              .
            </div>
          )}
          {!sectionOptions.length ? (
            <p className="text-sm text-muted-foreground">
              No sections are linked to this test series. Edit the series and assign boys/girls sections first.
            </p>
          ) : studentsLoading ? (
            <p className="text-sm text-muted-foreground">Loading students…</p>
          ) : (
            <MarksEntryTable
              test={test}
              students={students}
              scopeLabel={scopeLabel}
              readOnly={readOnly}
              saving={saving}
              onSave={async (rows) => {
                setSaving(true);
                try {
                  await saveTestMarks(test, rows, user?.id ?? null);
                  toast.success("Marks saved");
                  await Promise.all([
                    qc.invalidateQueries({
                      queryKey: ["internal-test-students", id, sectionId],
                    }),
                    qc.invalidateQueries({ queryKey: ["internal-test-section-meta", id] }),
                  ]);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not save marks");
                } finally {
                  setSaving(false);
                }
              }}
            />
          )}
          {!readOnly && sectionId && students.length > 0 && (
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    await completeInternalTestSection(test.id, sectionId);
                    toast.success("Section mark sheet completed");
                    await qc.invalidateQueries({
                      queryKey: ["internal-test-section-meta", id],
                    });
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Could not complete mark sheet",
                    );
                  }
                }}
              >
                Complete section mark sheet
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
