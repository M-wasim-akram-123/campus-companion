import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listMyIntermediateSubjectAssignments,
  type MyIntermediateSubjectAssignment,
} from "@/lib/intermediate-catalog";
import { currentAcademicYearStart, ordinalYearLabel } from "@/lib/academic";
import type { CreateInternalTestInput } from "@/lib/internal-exams";

type Props = {
  teacherUserId: string;
  saving?: boolean;
  onSubmit: (values: CreateInternalTestInput) => Promise<void>;
};

function assignmentLabel(assignment: MyIntermediateSubjectAssignment) {
  const gender = assignment.sectionGender === "girls" ? "Girls" : "Boys";
  return `${assignment.sessionLabel} · ${ordinalYearLabel(assignment.yearLevel)} · ${gender} — ${assignment.sectionName} · ${assignment.subjectCode} ${assignment.subjectName}`;
}

export function TeacherClassTestForm({
  teacherUserId,
  saving = false,
  onSubmit,
}: Props) {
  const [assignmentId, setAssignmentId] = useState("");
  const [testType, setTestType] = useState("Weekly Test");
  const [testLabel, setTestLabel] = useState("");
  const [testDate, setTestDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [maxMarks, setMaxMarks] = useState("20");
  const [passingMarks, setPassingMarks] = useState("");

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["my-intermediate-subject-assignments", teacherUserId],
    queryFn: () => listMyIntermediateSubjectAssignments(teacherUserId),
  });

  useEffect(() => {
    if (!assignmentId && assignments.length) {
      setAssignmentId(assignments[0].id);
    }
  }, [assignmentId, assignments]);

  const assignment = useMemo(
    () => assignments.find((row) => row.id === assignmentId),
    [assignmentId, assignments],
  );

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading your assigned subjects…
      </p>
    );
  }

  if (!assignments.length) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        No Intermediate subject is assigned to you. Ask the exam officer or
        administrator to assign your section and subject first.
      </p>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!assignment) return;
        const suffix = testLabel.trim();
        await onSubmit({
          academic_session_id: assignment.sessionId,
          academic_year_start: currentAcademicYearStart(),
          class_year_level: assignment.yearLevel,
          section_id: assignment.sectionId,
          subject_id: assignment.subjectId,
          subject_name: assignment.subjectName,
          test_name: suffix ? `${testType} — ${suffix}` : testType,
          test_date: testDate,
          max_marks: Number(maxMarks),
          passing_marks: passingMarks.trim()
            ? Number(passingMarks)
            : null,
        });
      }}
    >
      <div className="space-y-2">
        <Label>Assigned section and subject</Label>
        <Select value={assignmentId} onValueChange={setAssignmentId}>
          <SelectTrigger>
            <SelectValue placeholder="Select your assigned subject" />
          </SelectTrigger>
          <SelectContent>
            {assignments.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {assignmentLabel(row)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Test type</Label>
          <Select value={testType} onValueChange={setTestType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Weekly Test">Weekly Test</SelectItem>
              <SelectItem value="Class Test">Class Test</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Test number or topic (optional)</Label>
          <Input
            value={testLabel}
            onChange={(event) => setTestLabel(event.target.value)}
            placeholder="Test 1 or Chapter 3"
          />
        </div>
        <div className="space-y-2">
          <Label>Test date</Label>
          <Input
            type="date"
            value={testDate}
            onChange={(event) => setTestDate(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Maximum marks</Label>
          <Input
            type="number"
            min={1}
            step="0.01"
            value={maxMarks}
            onChange={(event) => setMaxMarks(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Passing marks (optional)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={passingMarks}
            onChange={(event) => setPassingMarks(event.target.value)}
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={saving || !assignment || !testDate || Number(maxMarks) <= 0}
      >
        {saving ? "Creating…" : "Create test and enter marks"}
      </Button>
    </form>
  );
}
