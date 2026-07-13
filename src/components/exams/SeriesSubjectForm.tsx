import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { CreateSeriesSubjectInput, InternalTestSeries } from "@/lib/internal-exams";

type Props = {
  series: InternalTestSeries;
  onSubmit: (values: Omit<CreateSeriesSubjectInput, "series_id">) => Promise<void>;
  saving?: boolean;
};

export function SeriesSubjectForm({ series, onSubmit, saving }: Props) {
  const [subjectName, setSubjectName] = useState("");
  const [testDate, setTestDate] = useState(new Date().toISOString().slice(0, 10));
  const [teacherName, setTeacherName] = useState("");
  const [paperReceived, setPaperReceived] = useState(false);
  const [maxMarks, setMaxMarks] = useState("50");
  const [passingMarks, setPassingMarks] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      subject_name: subjectName,
      test_date: testDate,
      max_marks: Number(maxMarks),
      passing_marks: passingMarks.trim() ? Number(passingMarks) : null,
      teacher_name: teacherName.trim() || null,
      paper_received: paperReceived,
    });
    setSubjectName("");
    setTeacherName("");
    setPaperReceived(false);
    setPassingMarks("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        One entry per subject for {series.name}. The same teacher may cover multiple sections — choose the section when uploading marks.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Subject</Label>
          <Input
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            placeholder="Physics, Urdu, English"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Test date</Label>
          <Input type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Teacher name</Label>
          <Input
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
            placeholder="Mr. Ahmed"
          />
        </div>
        <div className="space-y-2">
          <Label>Max marks</Label>
          <Input type="number" min={1} value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} required />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Passing marks (optional)</Label>
          <Input type="number" min={0} value={passingMarks} onChange={(e) => setPassingMarks(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 md:col-span-2">
          <Checkbox
            id="paper-received"
            checked={paperReceived}
            onCheckedChange={(v) => setPaperReceived(v === true)}
          />
          <Label htmlFor="paper-received" className="font-normal">
            Test paper received from teacher
          </Label>
        </div>
      </div>
      <Button type="submit" disabled={saving || !subjectName.trim() || !maxMarks}>
        {saving ? "Adding…" : "Add subject to series"}
      </Button>
    </form>
  );
}
