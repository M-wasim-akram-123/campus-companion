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
};

export function InternalTestSeriesForm({ onSubmit, saving }: Props) {
  const [sessionId, setSessionId] = useState("");
  const [academicYearStart, setAcademicYearStart] = useState(String(currentAcademicYearStart()));
  const [classYearLevel, setClassYearLevel] = useState("1");
  const [name, setName] = useState("");
  const [sectionIds, setSectionIds] = useState<string[]>([]);

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
    if (!sessionId && sessions?.length) {
      const active = sessions.find((s) => s.is_active) ?? sessions[0];
      setSessionId(active.id);
    }
  }, [sessionId, sessions]);

  useEffect(() => {
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
            Students will see all subjects grouped under this name.
          </p>
        </div>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label>Sections</Label>
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
        {saving ? "Creating…" : "Create test series"}
      </Button>
    </form>
  );
}
