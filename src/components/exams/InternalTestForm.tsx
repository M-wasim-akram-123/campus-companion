import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentAcademicYearStart } from "@/lib/academic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CreateInternalTestInput, InternalTest } from "@/lib/internal-exams";
import { ordinalYearLabel } from "@/lib/academic";

type Props = {
  initial?: InternalTest | null;
  onSubmit: (values: CreateInternalTestInput) => Promise<void>;
  saving?: boolean;
};

export function InternalTestForm({ initial, onSubmit, saving }: Props) {
  const [sessionId, setSessionId] = useState(initial?.academic_session_id ?? "");
  const [academicYearStart, setAcademicYearStart] = useState(
    String(initial?.academic_year_start ?? currentAcademicYearStart()),
  );
  const [classYearLevel, setClassYearLevel] = useState(String(initial?.class_year_level ?? 1));
  const [sectionId, setSectionId] = useState(initial?.section_id ?? "__all__");
  const [subjectName, setSubjectName] = useState(initial?.subject_name ?? "");
  const [testName, setTestName] = useState(initial?.test_name ?? "");
  const [testDate, setTestDate] = useState(initial?.test_date ?? new Date().toISOString().slice(0, 10));
  const [maxMarks, setMaxMarks] = useState(String(initial?.max_marks ?? 100));
  const [passingMarks, setPassingMarks] = useState(
    initial?.passing_marks != null ? String(initial.passing_marks) : "",
  );

  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () =>
      (await supabase.from("academic_sessions").select("*").order("start_year", { ascending: false })).data ?? [],
  });

  const { data: sections } = useQuery({
    queryKey: ["exam-sections", sessionId, classYearLevel],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data: classes } = await supabase
        .from("classes")
        .select("id")
        .eq("year_level", Number(classYearLevel));
      const classIds = (classes ?? []).map((c) => c.id);
      if (!classIds.length) return [];
      const { data, error } = await supabase
        .from("sections")
        .select("id, name, gender")
        .eq("session_id", sessionId)
        .in("class_id", classIds)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!sessionId && sessions?.length) {
      const active = sessions.find((s) => s.is_active) ?? sessions[0];
      setSessionId(active.id);
    }
  }, [sessionId, sessions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      academic_session_id: sessionId,
      academic_year_start: Number(academicYearStart),
      class_year_level: Number(classYearLevel),
      section_id: sectionId === "__all__" ? null : sectionId,
      subject_name: subjectName,
      test_name: testName,
      test_date: testDate,
      max_marks: Number(maxMarks),
      passing_marks: passingMarks.trim() ? Number(passingMarks) : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Academic session</Label>
          <Select value={sessionId} onValueChange={setSessionId} disabled={!!initial}>
            <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
            <SelectContent>
              {(sessions ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}{s.is_active ? " (active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Academic year</Label>
          <Input
            type="number"
            value={academicYearStart}
            onChange={(e) => setAcademicYearStart(e.target.value)}
            disabled={!!initial}
          />
          <p className="text-xs text-muted-foreground">Jul {academicYearStart} – Jun {Number(academicYearStart) + 1}</p>
        </div>
        <div className="space-y-2">
          <Label>Class year</Label>
          <Select value={classYearLevel} onValueChange={setClassYearLevel} disabled={!!initial}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((level) => (
                <SelectItem key={level} value={String(level)}>
                  {ordinalYearLabel(level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Section scope</Label>
          <Select value={sectionId} onValueChange={setSectionId} disabled={!!initial}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All sections in this year</SelectItem>
              {(sections ?? []).map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.gender === "girls" ? "Girls" : "Boys"} — {section.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Subject</Label>
          <Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="Physics" required />
        </div>
        <div className="space-y-2">
          <Label>Test name</Label>
          <Input
            value={testName}
            onChange={(e) => setTestName(e.target.value)}
            placeholder="Test 1, Mid-term, Pre-board"
            required
          />
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
      <Button type="submit" disabled={saving || !sessionId || !subjectName.trim() || !testName.trim()}>
        {saving ? "Saving…" : initial ? "Update test" : "Create test"}
      </Button>
    </form>
  );
}
