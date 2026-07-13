import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describeTestStudentScope, type InternalTest, type InternalTestStudentRow } from "@/lib/internal-exams";

type RowState = {
  studentId: string;
  marksObtained: string;
  isAbsent: boolean;
  remarks: string;
};

type Props = {
  test: InternalTest;
  students: InternalTestStudentRow[];
  scopeLabel?: string;
  readOnly?: boolean;
  saving?: boolean;
  onSave: (rows: {
    studentId: string;
    marksObtained: number | null;
    isAbsent: boolean;
    remarks?: string | null;
  }[]) => Promise<void>;
};

export function MarksEntryTable({ test, students, scopeLabel, readOnly, saving, onSave }: Props) {
  const [rows, setRows] = useState<RowState[]>([]);

  useEffect(() => {
    setRows(
      students.map((student) => ({
        studentId: student.studentId,
        marksObtained: student.marksObtained != null ? String(student.marksObtained) : "",
        isAbsent: student.isAbsent,
        remarks: student.remarks ?? "",
      })),
    );
  }, [students]);

  const updateRow = (studentId: string, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((row) => (row.studentId === studentId ? { ...row, ...patch } : row)));
  };

  const handleSave = async () => {
    await onSave(
      rows.map((row) => ({
        studentId: row.studentId,
        marksObtained: row.isAbsent || !row.marksObtained.trim() ? null : Number(row.marksObtained),
        isAbsent: row.isAbsent,
        remarks: row.remarks.trim() || null,
      })),
    );
  };

  if (!students.length) {
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>No active students were found for this test.</p>
        <p>
          Looking for students in:{" "}
          <span className="font-medium text-foreground">
            {scopeLabel
              ? `${test.academic_sessions?.label ?? "Session"} · ${scopeLabel} · active`
              : describeTestStudentScope(test)}
          </span>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Confirm students exist in <strong>Students</strong> with the same session and section.</li>
          <li>Student status must be <strong>active</strong> (not left or inactive).</li>
          <li>If the section is empty or the series class year does not match, add subjects under the correct section.</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Roll no</TableHead>
            <TableHead>Student</TableHead>
            <TableHead>Section</TableHead>
            <TableHead className="w-[120px]">Marks / {test.max_marks}</TableHead>
            <TableHead className="w-[90px]">Absent</TableHead>
            <TableHead>Remarks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student) => {
            const row = rows.find((r) => r.studentId === student.studentId);
            if (!row) return null;
            return (
              <TableRow key={student.studentId}>
                <TableCell className="font-mono text-xs">{student.rollNumber}</TableCell>
                <TableCell>
                  <div className="font-medium">{student.fullName}</div>
                  <div className="text-xs text-muted-foreground">{student.fatherName}</div>
                </TableCell>
                <TableCell className="text-sm">{student.sectionLabel}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    max={test.max_marks}
                    value={row.marksObtained}
                    disabled={readOnly || row.isAbsent}
                    onChange={(e) => updateRow(student.studentId, { marksObtained: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={row.isAbsent}
                    disabled={readOnly}
                    onCheckedChange={(checked) =>
                      updateRow(student.studentId, {
                        isAbsent: checked === true,
                        marksObtained: checked === true ? "" : row.marksObtained,
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.remarks}
                    disabled={readOnly}
                    onChange={(e) => updateRow(student.studentId, { remarks: e.target.value })}
                    placeholder="Optional"
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {!readOnly && (
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving marks…" : "Save marks"}
        </Button>
      )}
    </div>
  );
}
