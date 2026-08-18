import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canManageLmsAcademics } from "@/lib/lms/permissions";
import {
  createOffering,
  dropOffering,
  listCourses,
  listDepartments,
  listOfferings,
  listPrimaryTeachersByOffering,
  listSemesters,
  listTeacherCandidates,
  listTeacherProfiles,
  updateOffering,
} from "@/lib/lms/api";
import { offeringSchema, updateOfferingSchema } from "@/lib/lms/schemas";
import type { LmsCourseOffering, LmsCourseStatus } from "@/lib/lms/types";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/lms/offerings")({
  component: LmsOfferingsPage,
});

const NO_TEACHER = "__none__";

function LmsOfferingsPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canManage = canManageLmsAcademics(roles);
  const [semesterId, setSemesterId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [teacherId, setTeacherId] = useState(NO_TEACHER);
  const [capacity, setCapacity] = useState("");
  const [editing, setEditing] = useState<LmsCourseOffering | null>(null);
  const [editTeacherId, setEditTeacherId] = useState(NO_TEACHER);
  const [editCapacity, setEditCapacity] = useState("");
  const [editStatus, setEditStatus] = useState<LmsCourseStatus>("active");
  const [dropping, setDropping] = useState<LmsCourseOffering | null>(null);

  const { data: semesters = [] } = useQuery({
    queryKey: ["lms-semesters"],
    queryFn: listSemesters,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["lms-departments"],
    queryFn: listDepartments,
  });
  const { data: courses = [] } = useQuery({ queryKey: ["lms-courses"], queryFn: listCourses });
  const { data: teachers = [] } = useQuery({
    queryKey: ["lms-teachers"],
    queryFn: listTeacherProfiles,
  });
  const { data: candidates = [] } = useQuery({
    queryKey: ["lms-teacher-candidates"],
    queryFn: listTeacherCandidates,
  });
  const { data: offerings = [], isLoading } = useQuery({
    queryKey: ["lms-offerings"],
    queryFn: listOfferings,
  });
  const { data: teacherByOffering = {} } = useQuery({
    queryKey: ["lms-offering-teachers"],
    queryFn: listPrimaryTeachersByOffering,
  });

  const selectedSemester = semesters.find((s) => s.id === semesterId);
  const matchingCourses = useMemo(() => {
    if (!selectedSemester) return courses.filter((c) => c.status === "active");
    return courses.filter(
      (c) => c.status === "active" && c.department_id === selectedSemester.department_id,
    );
  }, [courses, selectedSemester]);

  const teacherLabel = (userId?: string | null) => {
    if (!userId) return "Unassigned";
    return (
      candidates.find((c) => c.id === userId)?.fullName ??
      teachers.find((t) => t.user_id === userId)?.employee_code ??
      "Teacher"
    );
  };

  const invalidateOfferings = () => {
    qc.invalidateQueries({ queryKey: ["lms-offerings"] });
    qc.invalidateQueries({ queryKey: ["lms-offering-teachers"] });
    qc.invalidateQueries({ queryKey: ["lms-dashboard"] });
  };

  const create = useMutation({
    mutationFn: ({
      input,
      teacher,
    }: {
      input: Parameters<typeof createOffering>[0];
      teacher: string | null;
    }) => createOffering(input, teacher),
    onSuccess: () => {
      toast.success("Course offering created");
      setCourseId("");
      setTeacherId(NO_TEACHER);
      invalidateOfferings();
    },
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      capacity: nextCapacity,
      status,
      teacher,
    }: {
      id: string;
      capacity: number | null;
      status: LmsCourseStatus;
      teacher: string | null;
    }) => updateOffering(id, { capacity: nextCapacity, status }, teacher),
    onSuccess: () => {
      toast.success("Offering updated");
      setEditing(null);
      invalidateOfferings();
    },
    onError: (error) => toast.error(error.message),
  });

  const drop = useMutation({
    mutationFn: (id: string) => dropOffering(id),
    onSuccess: () => {
      toast.success("Offering dropped");
      setDropping(null);
      invalidateOfferings();
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = offeringSchema.safeParse({
      semester_instance_id: semesterId,
      course_id: courseId,
      teacher_user_id: teacherId === NO_TEACHER ? "" : teacherId,
      capacity: capacity || null,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message);
    const { teacher_user_id, ...input } = parsed.data;
    create.mutate({
      input: {
        semester_instance_id: input.semester_instance_id,
        course_id: input.course_id,
        capacity: input.capacity ?? null,
      },
      teacher: teacher_user_id,
    });
  };

  const openEdit = (offering: LmsCourseOffering) => {
    setEditing(offering);
    setEditTeacherId(teacherByOffering[offering.id] ?? NO_TEACHER);
    setEditCapacity(offering.capacity != null ? String(offering.capacity) : "");
    setEditStatus(offering.status);
  };

  const submitEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const parsed = updateOfferingSchema.safeParse({
      teacher_user_id: editTeacherId === NO_TEACHER ? "" : editTeacherId,
      capacity: editCapacity || null,
      status: editStatus,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message);
    update.mutate({
      id: editing.id,
      capacity: parsed.data.capacity ?? null,
      status: parsed.data.status,
      teacher: parsed.data.teacher_user_id,
    });
  };

  return (
    <div className="space-y-6">
      <LmsPageHeader
        title="Course offerings"
        description="Each BS semester is one class for that program. Offer a course in the semester and assign its teacher — no sections or class groups."
      />
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create offering</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Semester (program class)">
                <Select
                  value={semesterId}
                  onValueChange={(value) => {
                    setSemesterId(value);
                    setCourseId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="e.g. AI · Semester 1" />
                  </SelectTrigger>
                  <SelectContent>
                    {semesters.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {departments.find((d) => d.id === s.department_id)?.code ?? "BS"} · {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Course">
                <Select value={courseId} onValueChange={setCourseId} disabled={!semesterId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select course" />
                  </SelectTrigger>
                  <SelectContent>
                    {matchingCourses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} · {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Primary teacher">
                <Select value={teacherId} onValueChange={setTeacherId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEACHER}>Assign later</SelectItem>
                    {teachers
                      .filter((t) => t.is_active)
                      .map((t) => (
                        <SelectItem key={t.user_id} value={t.user_id}>
                          {candidates.find((c) => c.id === t.user_id)?.fullName ??
                            t.employee_code ??
                            "Teacher"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Capacity (optional)">
                <Input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g. 50"
                />
              </Field>
              <div className="md:col-span-2 xl:col-span-3">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Creating…" : "Create offering"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Offerings</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading offerings…</p>
          ) : !offerings.length ? (
            <Empty />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Semester / program class</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {offerings.map((offering) => {
                  const semester = semesters.find((s) => s.id === offering.semester_instance_id);
                  const dept = departments.find((d) => d.id === semester?.department_id);
                  return (
                    <TableRow key={offering.id}>
                      <TableCell>
                        <p className="font-medium">
                          {courses.find((c) => c.id === offering.course_id)?.code ?? "Course"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {courses.find((c) => c.id === offering.course_id)?.name}
                        </p>
                      </TableCell>
                      <TableCell>
                        {dept?.code ?? "BS"} · {semester?.name ?? "—"}
                      </TableCell>
                      <TableCell>{teacherLabel(teacherByOffering[offering.id])}</TableCell>
                      <TableCell>{offering.capacity ?? "—"}</TableCell>
                      <TableCell>
                        <Badge>{offering.status}</Badge>
                      </TableCell>
                      {canManage ? (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(offering)}
                            >
                              Change
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => setDropping(offering)}
                            >
                              Drop
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change offering</DialogTitle>
            <DialogDescription>
              Update teacher, capacity, or status. Semester and course stay fixed.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form onSubmit={submitEdit} className="space-y-4">
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium">
                  {courses.find((c) => c.id === editing.course_id)?.code ?? "Course"} ·{" "}
                  {semesters.find((s) => s.id === editing.semester_instance_id)?.name ?? "Semester"}
                </p>
              </div>
              <Field label="Primary teacher">
                <Select value={editTeacherId} onValueChange={setEditTeacherId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEACHER}>Unassigned</SelectItem>
                    {teachers
                      .filter((t) => t.is_active)
                      .map((t) => (
                        <SelectItem key={t.user_id} value={t.user_id}>
                          {candidates.find((c) => c.id === t.user_id)?.fullName ??
                            t.employee_code ??
                            "Teacher"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Capacity (optional)">
                <Input
                  type="number"
                  min={1}
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(e.target.value)}
                  placeholder="e.g. 50"
                />
              </Field>
              <Field label="Status">
                <Select
                  value={editStatus}
                  onValueChange={(value) => setEditStatus(value as LmsCourseStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(dropping)} onOpenChange={(open) => !open && setDropping(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Drop this offering?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the offering
              {dropping
                ? ` (${courses.find((c) => c.id === dropping.course_id)?.code ?? "course"} · ${
                    semesters.find((s) => s.id === dropping.semester_instance_id)?.name ?? "semester"
                  })`
                : ""}{" "}
              and any student course enrollments tied to it. Teacher assignments are removed
              automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={drop.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={drop.isPending || !dropping}
              onClick={(event) => {
                event.preventDefault();
                if (dropping) drop.mutate(dropping.id);
              }}
            >
              {drop.isPending ? "Dropping…" : "Drop offering"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function Empty() {
  return (
    <div className="rounded-2xl border border-dashed py-12 text-center">
      <GraduationCap className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
      <p className="font-medium">No course offerings</p>
    </div>
  );
}
