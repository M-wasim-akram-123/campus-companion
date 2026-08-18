import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canManageLmsAcademics, isBsCoordinator } from "@/lib/lms/permissions";
import {
  listAssignmentsForSemester,
  listBsCoordinatorCandidates,
  listCampusDayOffs,
  listDepartments,
  listLectureDeliveries,
  listSemesters,
  listTeacherCandidates,
  listTeacherLeaves,
  listTeacherProfiles,
  setLectureDelivery,
  updateSemesterCoordinator,
} from "@/lib/lms/api";
import type { LmsLectureSessionType } from "@/lib/lms/types";
import { LmsPageHeader } from "@/components/lms/LmsPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute("/_authenticated/lms/deliveries")({
  component: LmsDeliveriesPage,
});

const NO_COORDINATOR = "__none__";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function LmsDeliveriesPage() {
  const qc = useQueryClient();
  const { roles, loading, user } = useAuth();
  const canManage = canManageLmsAcademics(roles);
  const [semesterId, setSemesterId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(todayIso);
  const [coordinatorId, setCoordinatorId] = useState(NO_COORDINATOR);

  const { data: semesters = [] } = useQuery({
    queryKey: ["lms-semesters"],
    queryFn: listSemesters,
  });

  useEffect(() => {
    if (!semesterId && semesters.length === 1) {
      setSemesterId(semesters[0].id);
    }
  }, [semesterId, semesters]);
  const { data: departments = [] } = useQuery({
    queryKey: ["lms-departments"],
    queryFn: listDepartments,
  });
  const { data: teachers = [] } = useQuery({
    queryKey: ["lms-teachers"],
    queryFn: listTeacherProfiles,
  });
  const { data: candidates = [] } = useQuery({
    queryKey: ["lms-teacher-candidates"],
    queryFn: listTeacherCandidates,
  });
  const { data: coordinatorCandidates = [] } = useQuery({
    queryKey: ["lms-bs-coordinator-candidates"],
    queryFn: listBsCoordinatorCandidates,
  });

  const selectedSemester = semesters.find((s) => s.id === semesterId);
  const isAssignedCoordinator =
    Boolean(user?.id) && selectedSemester?.coordinator_user_id === user?.id;
  // Academic managers can mark any semester; BS coordinators only their assigned ones.
  const canMark = canManage || isAssignedCoordinator;

  useEffect(() => {
    if (selectedSemester) {
      setCoordinatorId(selectedSemester.coordinator_user_id ?? NO_COORDINATOR);
    }
  }, [selectedSemester]);

  const { data: dayOffs = [] } = useQuery({
    queryKey: ["lms-day-offs"],
    queryFn: listCampusDayOffs,
  });
  const { data: leaves = [] } = useQuery({
    queryKey: ["lms-teacher-leaves", deliveryDate],
    queryFn: () => listTeacherLeaves(deliveryDate, deliveryDate),
    enabled: Boolean(deliveryDate),
  });
  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ["lms-semester-assignments", semesterId],
    queryFn: () => listAssignmentsForSemester(semesterId),
    enabled: Boolean(semesterId),
  });
  const { data: deliveries = [] } = useQuery({
    queryKey: ["lms-lecture-deliveries", semesterId, deliveryDate],
    queryFn: () =>
      listLectureDeliveries({
        semesterId,
        from: deliveryDate,
        to: deliveryDate,
      }),
    enabled: Boolean(semesterId && deliveryDate),
  });

  const isDayOff = dayOffs.some((d) => d.off_date === deliveryDate);
  const leaveTeacherIds = useMemo(
    () => new Set(leaves.map((l) => l.teacher_user_id)),
    [leaves],
  );

  const deliverySet = useMemo(() => {
    const set = new Set<string>();
    for (const d of deliveries) {
      set.add(`${d.offering_id}:${d.teacher_user_id}:${d.session_type}`);
    }
    return set;
  }, [deliveries]);

  const teacherLabel = (userId: string) =>
    candidates.find((c) => c.id === userId)?.fullName ??
    teachers.find((t) => t.user_id === userId)?.employee_code ??
    "Teacher";

  const saveCoordinator = useMutation({
    mutationFn: () =>
      updateSemesterCoordinator(
        semesterId,
        coordinatorId === NO_COORDINATOR ? null : coordinatorId,
      ),
    onSuccess: () => {
      toast.success("Semester coordinator updated");
      qc.invalidateQueries({ queryKey: ["lms-semesters"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: setLectureDelivery,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lms-lecture-deliveries", semesterId, deliveryDate] });
      qc.invalidateQueries({ queryKey: ["lms-salary-deliveries"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const onToggle = (
    offeringId: string,
    teacherUserId: string,
    sessionType: LmsLectureSessionType,
    next: boolean,
  ) => {
    if (!canMark) return toast.error("Not allowed to mark deliveries");
    if (isDayOff) return toast.error("Campus day off — cannot mark lectures");
    if (leaveTeacherIds.has(teacherUserId)) {
      return toast.error("Teacher is on leave this day");
    }
    toggle.mutate({
      offeringId,
      teacherUserId,
      deliveryDate,
      sessionType,
      delivered: next,
    });
  };

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading lecture deliveries…</p>;
  }

  return (
    <div className="space-y-6">
      <LmsPageHeader
        title="Lecture delivery"
        description="Semester coordinator confirms that theory and lab lectures actually happened. Marks feed visiting / lecture-wise salary."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select semester & date</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2 xl:col-span-2">
            <Label>Semester</Label>
            <Select value={semesterId} onValueChange={setSemesterId}>
              <SelectTrigger>
                <SelectValue placeholder="Select semester" />
              </SelectTrigger>
              <SelectContent>
                {semesters.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {departments.find((d) => d.id === s.department_id)?.code ?? "BS"} · {s.name} (
                    {s.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            {isDayOff ? (
              <Badge variant="destructive">Campus day off</Badge>
            ) : (
              <Badge variant="secondary">Working day</Badge>
            )}
          </div>

          {canManage && semesterId ? (
            <>
              <div className="space-y-2 xl:col-span-2">
                <Label>Semester coordinator</Label>
                <Select value={coordinatorId} onValueChange={setCoordinatorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Assign coordinator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_COORDINATOR}>Unassigned</SelectItem>
                    {coordinatorCandidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saveCoordinator.isPending}
                  onClick={() => saveCoordinator.mutate()}
                >
                  Save coordinator
                </Button>
              </div>
              {!coordinatorCandidates.length ? (
                <p className="text-xs text-muted-foreground xl:col-span-4">
                  No BS Coordinator users yet. Assign the role under Settings → Users, then pick them
                  here for this semester.
                </p>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Subjects to mark — {deliveryDate || "—"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!semesterId ? (
            <p className="text-sm text-muted-foreground">
              Select a semester and date to see subjects scheduled for lecture marks.
            </p>
          ) : loadingAssignments ? (
            <p className="text-sm text-muted-foreground">Loading subjects…</p>
          ) : !assignments.length ? (
            <Empty />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Theory</TableHead>
                  <TableHead>Lab</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((row) => {
                  const hasTeacher = Boolean(row.teacherUserId);
                  const onLeave = hasTeacher && leaveTeacherIds.has(row.teacherUserId!);
                  const blocked = isDayOff || onLeave || !canMark || !hasTeacher;
                  const theoryKey = hasTeacher
                    ? `${row.offeringId}:${row.teacherUserId}:theory`
                    : "";
                  const labKey = hasTeacher
                    ? `${row.offeringId}:${row.teacherUserId}:lab`
                    : "";
                  return (
                    <TableRow key={row.offeringId}>
                      <TableCell>
                        <p className="font-medium">{row.courseCode}</p>
                        <p className="text-xs text-muted-foreground">{row.courseName}</p>
                      </TableCell>
                      <TableCell>
                        {hasTeacher ? (
                          teacherLabel(row.teacherUserId!)
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.hasTheory ? (
                          <Checkbox
                            checked={hasTeacher && deliverySet.has(theoryKey)}
                            disabled={blocked || toggle.isPending}
                            onCheckedChange={(checked) => {
                              if (!row.teacherUserId) return;
                              onToggle(
                                row.offeringId,
                                row.teacherUserId,
                                "theory",
                                checked === true,
                              );
                            }}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.hasLab ? (
                          <Checkbox
                            checked={hasTeacher && deliverySet.has(labKey)}
                            disabled={blocked || toggle.isPending}
                            onCheckedChange={(checked) => {
                              if (!row.teacherUserId) return;
                              onToggle(
                                row.offeringId,
                                row.teacherUserId,
                                "lab",
                                checked === true,
                              );
                            }}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!hasTeacher ? (
                          <Badge variant="outline">Assign teacher on Offerings</Badge>
                        ) : isDayOff ? (
                          <Badge variant="destructive">Day off</Badge>
                        ) : onLeave ? (
                          <Badge variant="destructive">On leave</Badge>
                        ) : (
                          <Badge variant="secondary">Open</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {semesterId && assignments.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {assignments.length} subject{assignments.length === 1 ? "" : "s"} in this semester.
              Mark theory/lab for the selected date after confirming the lecture was delivered.
            </p>
          ) : null}
          {!canMark && semesterId ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {isBsCoordinator(roles)
                ? "You can mark lectures only on semesters where you are the assigned BS Coordinator."
                : "You can view marks, but only the assigned BS Coordinator or LMS academic staff can change them."}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl border border-dashed py-12 text-center">
      <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
      <p className="font-medium">No subjects in this semester</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Add course offerings (subjects) under LMS → Offerings for this semester, then assign
        teachers. They will appear here for theory/lab lecture marks.
      </p>
    </div>
  );
}
