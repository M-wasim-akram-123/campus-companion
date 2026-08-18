import { useState } from "react";
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
import type { CreateSeriesSubjectInput, InternalTestSeries } from "@/lib/internal-exams";
import { listIntermediateSubjects } from "@/lib/intermediate-catalog";

type Props = {
  series: InternalTestSeries;
  onSubmit: (values: Omit<CreateSeriesSubjectInput, "series_id">) => Promise<void>;
  saving?: boolean;
};

export function SeriesSubjectForm({ series, onSubmit, saving }: Props) {
  const [subjectId, setSubjectId] = useState("");
  const [testDate, setTestDate] = useState(new Date().toISOString().slice(0, 10));
  const [maxMarks, setMaxMarks] = useState("50");
  const [passingMarks, setPassingMarks] = useState("");
  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ["intermediate-subjects", "active"],
    queryFn: () => listIntermediateSubjects(),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      subject_id: subjectId,
      test_date: testDate,
      max_marks: Number(maxMarks),
      passing_marks: passingMarks.trim() ? Number(passingMarks) : null,
    });
    setSubjectId("");
    setPassingMarks("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose from the Intermediate catalog. Every section in {series.name} must already have a
        teacher assigned for this subject.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Subject</Label>
          <Select value={subjectId} onValueChange={setSubjectId} disabled={isLoading}>
            <SelectTrigger>
              <SelectValue placeholder={isLoading ? "Loading subjects…" : "Select subject"} />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.code} · {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Test date</Label>
          <Input type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Max marks</Label>
          <Input type="number" min={1} value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} required />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Passing marks (optional)</Label>
          <Input type="number" min={0} value={passingMarks} onChange={(e) => setPassingMarks(e.target.value)} />
        </div>
      </div>
      <Button type="submit" disabled={saving || !subjectId || !maxMarks}>
        {saving ? "Adding…" : "Add subject to series"}
      </Button>
    </form>
  );
}
