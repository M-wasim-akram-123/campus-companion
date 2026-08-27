import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canAccessIntermediateExams, canManageExams } from "@/lib/exam-permissions";
import {
  academicYearLabel,
  announceSeriesAssignedSubjects,
  createSeriesSubjectTest,
  deleteInternalTestSeries,
  fetchInternalTestSeriesById,
  fetchSeriesSections,
  fetchSeriesTestSectionMeta,
  fetchTestsForSeries,
  formatSeriesSectionLabel,
  setInternalTestSectionPaperReceived,
  summarizeSeriesProgress,
  testHasSeriesActivity,
  updateInternalTestSeries,
} from "@/lib/internal-exams";
import { ordinalYearLabel } from "@/lib/academic";
import { SeriesSubjectForm } from "@/components/exams/SeriesSubjectForm";
import { InternalTestSeriesForm } from "@/components/exams/InternalTestSeriesForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/exams/series/$id")({
  component: TestSeriesDetailPage,
});

function TestSeriesDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles, teacherScope, loading, user } = useAuth();
  const allowed = canAccessIntermediateExams(roles, teacherScope);
  const canManage = canManageExams(roles);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [showEditSeries, setShowEditSeries] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState(false);
  const [savingSeries, setSavingSeries] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !allowed) navigate({ to: "/dashboard" });
  }, [allowed, loading, navigate]);

  const { data: series, isLoading } = useQuery({
    queryKey: ["internal-test-series", id],
    enabled: !!id && allowed,
    queryFn: () => fetchInternalTestSeriesById(id),
  });

  const { data: seriesSections = [] } = useQuery({
    queryKey: ["internal-test-series-sections", id],
    enabled: !!series,
    queryFn: () => fetchSeriesSections(id),
  });

  const { data: tests = [], isLoading: testsLoading } = useQuery({
    queryKey: ["internal-test-series-subjects", id],
    enabled: !!series,
    queryFn: () => fetchTestsForSeries(id),
  });
  const { data: sectionMeta = [] } = useQuery({
    queryKey: ["internal-test-series-section-meta", id],
    enabled: !!series,
    queryFn: () => fetchSeriesTestSectionMeta(id),
  });

  const progress = useMemo(() => summarizeSeriesProgress(tests, sectionMeta), [tests, sectionMeta]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["internal-test-series", id] });
    qc.invalidateQueries({ queryKey: ["internal-test-series-subjects", id] });
    qc.invalidateQueries({ queryKey: ["internal-test-series-sections", id] });
    qc.invalidateQueries({ queryKey: ["internal-test-series-section-meta", id] });
  };

  useEffect(() => {
    if (!canManage || !series || testsLoading) return;
    let cancelled = false;
    void announceSeriesAssignedSubjects(series.id, user?.id ?? null)
      .then((result) => {
        if (cancelled || result.created === 0) return;
        toast.success(
          `Announced ${result.created} assigned subject${result.created === 1 ? "" : "s"}`,
        );
        refresh();
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : "Could not announce assigned subjects");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, series?.id, testsLoading, user?.id]);

  if (loading || !allowed) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  if (isLoading || !series) {
    return <div className="p-8 text-center text-muted-foreground">Loading series…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="px-0">
            <Link to="/exams"><ArrowLeft className="mr-2 h-4 w-4" />Back to exams</Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{series.name}</h1>
            <p className="text-muted-foreground">
              {series.academic_sessions?.label ?? "Session"} · {ordinalYearLabel(series.class_year_level)} ·{" "}
              {academicYearLabel(series.academic_year_start)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Announced for subjects assigned to these sections. Subjects without marks are not
              included in the series.
            </p>
            {seriesSections.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {seriesSections.map((section) => (
                  <Badge key={section.id} variant="outline">
                    {formatSeriesSectionLabel(section)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button asChild variant="outline">
              <Link to="/exams/catalog">
                <BookOpen className="mr-2 h-4 w-4" />
                Subject catalog
              </Link>
            </Button>
          )}
          {canManage && (
            <Button
              variant="outline"
              onClick={() => {
                setShowEditSeries((v) => !v);
                setShowAddSubject(false);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {showEditSeries ? "Hide edit" : "Edit series"}
            </Button>
          )}
          {canManage && (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete series
            </Button>
          )}
          {canManage && (
            <Button
              onClick={() => {
                setShowAddSubject((v) => !v);
                setShowEditSeries(false);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {showAddSubject ? "Hide form" : "Add subject"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Subjects announced</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{progress.totalSubjects}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Not included</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-500">{progress.notIncluded}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Papers pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{progress.papersPending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Awaiting marks</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{progress.marksPending}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Published</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{progress.published}</div>
          </CardContent>
        </Card>
      </div>

      {canManage && showEditSeries && (
        <Card>
          <CardHeader>
            <CardTitle>Edit series</CardTitle>
          </CardHeader>
          <CardContent>
            <InternalTestSeriesForm
              key={`${series.id}-${seriesSections.map((s) => s.id).sort().join(",")}`}
              saving={savingSeries}
              submitLabel="Save series"
              initial={{
                academic_session_id: series.academic_session_id,
                academic_year_start: series.academic_year_start,
                class_year_level: series.class_year_level,
                name: series.name,
                section_ids: seriesSections.map((s) => s.id),
              }}
              onSubmit={async (values) => {
                setSavingSeries(true);
                try {
                  await updateInternalTestSeries(series.id, values);
                  toast.success("Test series updated");
                  setShowEditSeries(false);
                  refresh();
                  qc.invalidateQueries({ queryKey: ["internal-test-series"] });
                  qc.invalidateQueries({ queryKey: ["internal-test-series-list"] });
                  qc.invalidateQueries({ queryKey: ["exam-dashboard"] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not update series");
                } finally {
                  setSavingSeries(false);
                }
              }}
            />
          </CardContent>
        </Card>
      )}

      {canManage && showAddSubject && (
        <Card>
          <CardHeader>
            <CardTitle>Add subject paper</CardTitle>
          </CardHeader>
          <CardContent>
            <SeriesSubjectForm
              series={series}
              saving={adding}
              onSubmit={async (values) => {
                setAdding(true);
                try {
                  await createSeriesSubjectTest(
                    { series_id: series.id, ...values },
                    user?.id ?? null,
                  );
                  toast.success("Subject added to series");
                  setShowAddSubject(false);
                  refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not add subject");
                } finally {
                  setAdding(false);
                }
              }}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Subjects &amp; marks</CardTitle>
        </CardHeader>
        <CardContent>
          {testsLoading ? (
            <p className="text-sm text-muted-foreground">Loading subjects…</p>
          ) : !tests.length ? (
            <p className="text-sm text-muted-foreground">
              No catalog subjects are assigned to these sections yet. Assign subjects in the
              Intermediate catalog, then reopen this series — papers will be announced automatically.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Paper</TableHead>
                  <TableHead>Max</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tests.map((test) => {
                  const meta = sectionMeta.filter((row) => row.internal_test_id === test.id);
                  return (
                  <TableRow key={test.id}>
                    <TableCell className="font-medium">{test.subject_name}</TableCell>
                    <TableCell>{test.test_date}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {meta.length ? (
                          meta.map((row) => (
                            <p key={row.id} className="text-xs">
                              {formatSeriesSectionLabel({
                                id: row.section_id,
                                name: row.sections?.name ?? "Section",
                                gender: (row.sections?.gender ?? "boys") as "boys" | "girls",
                              })}
                              {" · "}
                              <span className="font-medium">{row.teacher_name_snapshot}</span>
                            </p>
                          ))
                        ) : (
                          <span className="text-muted-foreground">Legacy test</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {test.status === "published" ? (
                        <Badge variant="outline">Received</Badge>
                      ) : (
                        <div className="space-y-1">
                          {meta.map((row) => (
                            <Button
                              key={row.id}
                              type="button"
                              size="sm"
                              variant={row.paper_received ? "secondary" : "outline"}
                              className="h-7 w-full justify-start text-xs"
                              disabled={!canManage || togglingId === row.id}
                              onClick={async () => {
                                setTogglingId(row.id);
                                try {
                                  await setInternalTestSectionPaperReceived(
                                    row.id,
                                    !row.paper_received,
                                  );
                                  await qc.invalidateQueries({
                                    queryKey: ["internal-test-series-section-meta", id],
                                  });
                                } catch (e) {
                                  toast.error(
                                    e instanceof Error ? e.message : "Could not update paper",
                                  );
                                } finally {
                                  setTogglingId(null);
                                }
                              }}
                            >
                              {row.sections?.name ?? "Section"}:{" "}
                              {row.paper_received ? "Received" : "Pending"}
                            </Button>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{test.max_marks}</TableCell>
                    <TableCell>
                      {test.status === "published" ? (
                        <Badge>Published</Badge>
                      ) : testHasSeriesActivity(test, meta) ? (
                        <Badge variant="secondary">In progress</Badge>
                      ) : (
                        <Badge variant="outline">Not included</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/exams/tests/$id" params={{ id: test.id }}>
                          {test.status === "draft" ? "Upload marks" : "View"}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {series.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the series, its subjects, section papers, and entered marks. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={async (event) => {
                event.preventDefault();
                setDeleting(true);
                try {
                  await deleteInternalTestSeries(series.id);
                  toast.success("Test series deleted");
                  qc.invalidateQueries({ queryKey: ["internal-test-series"] });
                  qc.invalidateQueries({ queryKey: ["exam-dashboard"] });
                  navigate({ to: "/exams" });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not delete series");
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete series"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
