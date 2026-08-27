import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentAcademicYearStart } from "@/lib/academic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeriesSectionPicker } from "@/components/exams/SeriesSectionPicker";
import { fetchSectionsForClassYear, type CreateInternalTestSeriesInput, type SeriesSectionOption } from "@/lib/internal-exams";
import { ordinalYearLabel } from "@/lib/academic";

const EMPTY_SECTIONS: SeriesSectionOption[] = [];

type Props = {
  onSubmit: (values: CreateInternalTestSeriesInput) => Promise<void>;
  saving?: boolean;
  initial?: {
    academic_session_id: string;
    academic_year_start: number;
    class_year_level: number;
    name: string;
    section_ids: string[];
  };
  submitLabel?: string;
};

export function InternalTestSeriesForm({ onSubmit, saving, initial, submitLabel }: Props) {
  const [sessionId, setSessionId] = useState(initial?.academic_session_id ?? "");
  const [academicYearStart, setAcademicYearStart] = useState(
    String(initial?.academic_year_start ?? currentAcademicYearStart()),
  );
  const [classYearLevel, setClassYearLevel] = useState(String(initial?.class_year_level ?? 1));
  const [name, setName] = useState(initial?.name ?? "");
  const [sectionIds, setSectionIds] = useState<string[]>(initial?.section_ids ?? []);
  const isEdit = Boolean(initial);

  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () =>
      (await supabase.from("academic_sessions").select("*").order("start_year", { ascending: false })).data ?? [],
  });

  const { data: sectionsData } = useQuery({
    queryKey: ["exam-series-sections", sessionId, classYearLevel],
    enabled: !!sessionId,
    queryFn: () => fetchSectionsForClassYear(sessionId, Number(classYearLevel)),
  });
  const sections = sectionsData ?? EMPTY_SECTIONS;

  useEffect(() => {
    if (!sessionId && !initial && sessions?.length) {
      const active = sessions.find((s) => s.is_active) ?? sessions[0];
      setSessionId(active.id);
    }
  }, [sessionId, sessions, initial]);

  useEffect(() => {
    if (!sections.length) return;
    setSectionIds((prev) => {
      const next = prev.filter((id) => sections.some((s) => s.id === id));
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
    });
  }, [sections]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      academic_session_id: sessionId,
      academic_year_start: Number(academicYearStart),
      class_year_level: Number(classYearLevel),
      name: name.trim(),
      section_ids: sectionIds,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Academic session</Label>
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
            <SelectContent>
              {(sessions ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}{s.is_active ? " (running)" : ""}
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
          />
          <p className="text-xs text-muted-foreground">
            Jul {academicYearStart} – Jun {Number(academicYearStart) + 1}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Class year</Label>
          <Select value={classYearLevel} onValueChange={setClassYearLevel}>
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
          <Label>Series name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Test 1, Test 2, Mid-term"
            required
          />
          <p className="text-xs text-muted-foreground">
            Students will see this series name. Papers are announced for subjects already assigned
            to the selected sections.
          </p>
        </div>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label>Sections</Label>
        <p className="text-xs text-muted-foreground">
          The series is announced for catalog subjects assigned to these sections (1st, 2nd, 3rd,
          or any other assigned subject). Leave a subject without marks and it will not be included.
        </p>
        <SeriesSectionPicker
          sections={sections}
          selectedIds={sectionIds}
          onChange={setSectionIds}
          disabled={saving}
        />
      </div>

      <Button
        type="submit"
        disabled={saving || !sessionId || !name.trim() || !sectionIds.length}
      >
        {saving ? (isEdit ? "Saving…" : "Creating…") : submitLabel ?? (isEdit ? "Save changes" : "Create test series")}
      </Button>
    </form>
  );
}
