import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Plus, Trash2, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canManageExams } from "@/lib/exam-permissions";
import {
  createIntermediateSubject,
  deleteIntermediateSectionSubject,
  listIntermediateSections,
  listIntermediateSectionSubjectAssignments,
  listIntermediateSubjects,
  listIntermediateTeachers,
  saveIntermediateSectionSubject,
  updateIntermediateSubject,
} from "@/lib/intermediate-catalog";
import { ordinalYearLabel } from "@/lib/academic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export const Route = createFileRoute("/_authenticated/exams/catalog")({
  component: IntermediateCatalogPage,
});

function IntermediateCatalogPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles, loading, user } = useAuth();
  const allowed = canManageExams(roles);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [sessionFilter, setSessionFilter] = useState("__all__");

  useEffect(() => {
    if (!loading && !allowed) navigate({ to: "/dashboard", replace: true });
  }, [allowed, loading, navigate]);

  const { data: subjects = [], isLoading: subjectsLoading } = useQuery({
    queryKey: ["intermediate-subjects", "all"],
    queryFn: () => listIntermediateSubjects(true),
    enabled: allowed,
  });
  const { data: sections = [] } = useQuery({
    queryKey: ["intermediate-section-options"],
    queryFn: listIntermediateSections,
    enabled: allowed,
  });
  const { data: teachers = [] } = useQuery({
    queryKey: ["intermediate-teacher-options"],
    queryFn: listIntermediateTeachers,
    enabled: allowed,
  });
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["intermediate-section-subject-assignments"],
    queryFn: listIntermediateSectionSubjectAssignments,
    enabled: allowed,
  });

  const sessions = useMemo(
    () =>
      [...new Set(sections.map((row) => row.sessionLabel))]
        .sort((a, b) => b.localeCompare(a))
        .map((label) => ({ id: label, label })),
    [sections],
  );
  const filteredSections = useMemo(
    () =>
      sessionFilter === "__all__"
        ? sections
        : sections.filter((row) => row.sessionLabel === sessionFilter),
    [sections, sessionFilter],
  );

  // Prefer newest running Intermediate session when opening the catalog.
  useEffect(() => {
    if (sessionFilter !== "__all__" || !sections.length) return;
    const running = sections
      .filter((row) => row.sessionIsActive)
      .sort((a, b) => b.sessionLabel.localeCompare(a.sessionLabel));
    if (running[0]) setSessionFilter(running[0].sessionLabel);
  }, [sections, sessionFilter]);

  useEffect(() => {
    if (sectionId && !filteredSections.some((row) => row.id === sectionId)) setSectionId("");
  }, [filteredSections, sectionId]);
  const filteredAssignments = useMemo(
    () =>
      sessionFilter === "__all__"
        ? assignments
        : assignments.filter((row) => row.sessionLabel === sessionFilter),
    [assignments, sessionFilter],
  );

  const createSubject = useMutation({
    mutationFn: () =>
      createIntermediateSubject({
        code,
        name,
        createdBy: user?.id,
      }),
    onSuccess: async () => {
      toast.success("Intermediate subject created");
      setCode("");
      setName("");
      await qc.invalidateQueries({ queryKey: ["intermediate-subjects"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleSubject = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateIntermediateSubject(id, { isActive }),
    onSuccess: async () => {
      toast.success("Subject status updated");
      await qc.invalidateQueries({ queryKey: ["intermediate-subjects"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveAssignment = useMutation({
    mutationFn: () =>
      saveIntermediateSectionSubject({
        sectionId,
        subjectId,
        teacherUserId: teacherId,
        createdBy: user?.id,
      }),
    onSuccess: async () => {
      toast.success("Section subject and teacher saved");
      setSubjectId("");
      setTeacherId("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["intermediate-section-subject-assignments"] }),
        qc.invalidateQueries({ queryKey: ["teacher-intermediate-assignments"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeAssignment = useMutation({
    mutationFn: deleteIntermediateSectionSubject,
    onSuccess: async () => {
      toast.success("Assignment removed");
      await qc.invalidateQueries({ queryKey: ["intermediate-section-subject-assignments"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (loading || !allowed) {
    return <div className="p-8 text-center text-muted-foreground">Loading catalog…</div>;
  }

  const submitSubject = (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || !name.trim()) return toast.error("Code and subject name are required");
    createSubject.mutate();
  };

  const submitAssignment = (event: React.FormEvent) => {
    event.preventDefault();
    if (!sectionId || !subjectId || !teacherId) {
      return toast.error("Section, subject, and teacher are required");
    }
    saveAssignment.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 px-0">
            <Link to="/exams">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to exams
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">Intermediate subject catalog</h1>
          <p className="text-muted-foreground">
            Standard subjects and section-specific teacher assignments. BS courses remain separate.
          </p>
        </div>
        <Select value={sessionFilter} onValueChange={setSessionFilter}>
          <SelectTrigger className="w-[210px]">
            <SelectValue placeholder="All sessions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sessions</SelectItem>
            {sessions.map((session) => (
              <SelectItem key={session.id} value={session.id}>
                {session.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="order-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" />
              Subject catalog
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={submitSubject} className="grid gap-3 sm:grid-cols-[140px_1fr_auto]">
              <div className="space-y-2">
                <Label>Code</Label>
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="PHY"
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label>Subject name</Label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Physics"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={createSubject.isPending}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </form>

            {subjectsLoading ? (
              <p className="text-sm text-muted-foreground">Loading subjects…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjects.map((subject) => (
                    <TableRow key={subject.id}>
                      <TableCell>
                        <Badge variant="outline">{subject.code}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{subject.name}</TableCell>
                      <TableCell>
                        <Badge variant={subject.isActive ? "default" : "secondary"}>
                          {subject.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={toggleSubject.isPending}
                          onClick={() =>
                            toggleSubject.mutate({
                              id: subject.id,
                              isActive: !subject.isActive,
                            })
                          }
                        >
                          {subject.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="order-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRoundCheck className="h-4 w-4 text-primary" />
              Assign subject teacher
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitAssignment} className="grid gap-4">
              <div className="space-y-2">
                <Label>Intermediate section</Label>
                <Select value={sectionId} onValueChange={setSectionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {!filteredSections.length ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">
                        No Intermediate sections for this session
                      </div>
                    ) : (
                      filteredSections.map((section) => (
                        <SelectItem key={section.id} value={section.id}>
                          {section.programName} · {ordinalYearLabel(section.yearLevel)} ·{" "}
                          {section.gender === "girls" ? "Girls" : "Boys"} — {section.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Select value={subjectId} onValueChange={setSubjectId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects
                        .filter((subject) => subject.isActive)
                        .map((subject) => (
                          <SelectItem key={subject.id} value={subject.id}>
                            {subject.code} · {subject.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Teacher</Label>
                  <Select value={teacherId} onValueChange={setTeacherId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select teacher" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {teacher.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" disabled={saveAssignment.isPending}>
                {saveAssignment.isPending ? "Saving…" : "Save assignment"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Saving the same section and subject again replaces its teacher. The teacher
                automatically gains student access for that section.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Section · subject · teacher matrix</CardTitle>
        </CardHeader>
        <CardContent>
          {assignmentsLoading ? (
            <p className="text-sm text-muted-foreground">Loading assignments…</p>
          ) : !filteredAssignments.length ? (
            <p className="text-sm text-muted-foreground">
              No subject teachers assigned for this session.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell>{assignment.sessionLabel}</TableCell>
                    <TableCell>{ordinalYearLabel(assignment.yearLevel)}</TableCell>
                    <TableCell>{assignment.sectionLabel}</TableCell>
                    <TableCell className="font-medium">{assignment.subjectLabel}</TableCell>
                    <TableCell>{assignment.teacherName}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={removeAssignment.isPending}
                        onClick={() => removeAssignment.mutate(assignment.id)}
                        aria-label="Remove assignment"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
