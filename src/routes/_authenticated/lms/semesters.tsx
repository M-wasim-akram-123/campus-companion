import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canManageLmsAcademics } from "@/lib/lms/permissions";
import {
  closeAndPromoteSemester,
  createSemester,
  listAcademicSessions,
  listDepartments,
  listSemesters,
  setSemesterStatus,
} from "@/lib/lms/api";
import { semesterSchema } from "@/lib/lms/schemas";
import type { LmsSemester, LmsSemesterStatus } from "@/lib/lms/types";
import { LmsPageHeader } from "@/components/lms/LmsPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/lms/semesters")({
  component: LmsSemestersPage,
});

const statuses: LmsSemesterStatus[] = [
  "preparing",
  "admission_open",
  "running",
  "closed",
  "archived",
];

function LmsSemestersPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canManage = canManageLmsAcademics(roles);
  const [departmentId, setDepartmentId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [number, setNumber] = useState("1");
  const [name, setName] = useState("Semester 1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: semesters = [], isLoading } = useQuery({
    queryKey: ["lms-semesters"],
    queryFn: listSemesters,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["lms-departments"],
    queryFn: listDepartments,
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions-lookup"],
    queryFn: listAcademicSessions,
  });

  const create = useMutation({
    mutationFn: createSemester,
    onSuccess: () => {
      toast.success("Semester prepared");
      qc.invalidateQueries({ queryKey: ["lms-semesters"] });
      qc.invalidateQueries({ queryKey: ["lms-dashboard"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LmsSemesterStatus }) =>
      setSemesterStatus(id, status),
    onSuccess: () => {
      toast.success("Semester status updated");
      qc.invalidateQueries({ queryKey: ["lms-semesters"] });
      qc.invalidateQueries({ queryKey: ["lms-dashboard"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const promote = useMutation({
    mutationFn: ({ fromId, toId }: { fromId: string; toId: string | null }) =>
      closeAndPromoteSemester(fromId, toId),
    onSuccess: (result) => {
      if (result.final_semester) {
        toast.success(`Final semester closed. Graduated ${result.graduated} student(s).`);
      } else {
        toast.success(
          `Promoted ${result.promoted} student(s). Skipped ${result.skipped} (failed/frozen/withdrawn).`,
        );
      }
      qc.invalidateQueries({ queryKey: ["lms-semesters"] });
      qc.invalidateQueries({ queryKey: ["lms-dashboard"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = semesterSchema.safeParse({
      department_id: departmentId,
      academic_session_id: sessionId,
      semester_number: number,
      name,
      start_date: startDate,
      end_date: endDate,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message);
    create.mutate(parsed.data);
  };

  const setSemesterNumber = (value: string) => {
    setNumber(value);
    setName(`Semester ${value}`);
  };

  const nextPrepared = (semester: LmsSemester) =>
    semesters.find(
      (row) =>
        row.department_id === semester.department_id &&
        row.program_id === semester.program_id &&
        row.academic_session_id === semester.academic_session_id &&
        row.semester_number === semester.semester_number + 1 &&
        row.status === "preparing",
    );

  const deptSemesterCount = (departmentIdValue: string) =>
    departments.find((d) => d.id === departmentIdValue)?.semester_count ?? 8;

  return (
    <div className="space-y-6">
      <LmsPageHeader
        title="Semester Management"
        description="BS programs use semesters (not annual classes). Prepare the next semester, then close the current one to promote active students."
      />

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prepare semester</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="BS program (department)">
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select BS program" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="BS cohort session">
                <Select value={sessionId} onValueChange={setSessionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select session" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Semester number">
                <Input
                  type="number"
                  min={1}
                  max={16}
                  value={number}
                  onChange={(e) => setSemesterNumber(e.target.value)}
                />
              </Field>
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Start date">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="End date">
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={create.isPending}>
                  {create.isPending ? "Preparing…" : "Prepare semester"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Semester lifecycle</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading semesters…</p>
          ) : !semesters.length ? (
            <div className="rounded-2xl border border-dashed py-12 text-center">
              <CalendarRange className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No semesters prepared</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Semester</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-48">Promotion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {semesters.map((semester) => {
                  const next = nextPrepared(semester);
                  const isFinal =
                    semester.semester_number >= deptSemesterCount(semester.department_id);
                  return (
                    <TableRow key={semester.id}>
                      <TableCell>
                        <p className="font-medium">{semester.name}</p>
                        <p className="text-xs text-muted-foreground">
                          No. {semester.semester_number}
                        </p>
                      </TableCell>
                      <TableCell>
                        {departments.find((d) => d.id === semester.department_id)?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {sessions.find((s) => s.id === semester.academic_session_id)?.label ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {semester.start_date || "—"} → {semester.end_date || "—"}
                      </TableCell>
                      <TableCell>
                        {canManage && semester.status !== "archived" ? (
                          <Select
                            value={semester.status}
                            onValueChange={(status) =>
                              changeStatus.mutate({
                                id: semester.id,
                                status: status as LmsSemesterStatus,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-[150px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {statuses.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status.replaceAll("_", " ")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge>{semester.status.replaceAll("_", " ")}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {canManage && semester.status === "running" ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={promote.isPending || (!isFinal && !next)}
                              >
                                {isFinal ? "Close & graduate" : "Close & promote"}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {isFinal ? "Close final semester?" : "Close and promote?"}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {isFinal
                                    ? "Active students who completed this final semester will be marked graduated."
                                    : next
                                      ? `Close ${semester.name} and promote active students into prepared ${next.name}. Failed/frozen/withdrawn enrollments stay behind.`
                                      : "Prepare the next semester first, then promote."}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  disabled={!isFinal && !next}
                                  onClick={() =>
                                    promote.mutate({
                                      fromId: semester.id,
                                      toId: isFinal ? null : next?.id ?? null,
                                    })
                                  }
                                >
                                  Confirm
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
