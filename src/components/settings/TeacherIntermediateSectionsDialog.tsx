import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sectionDisplayLabel } from "@/lib/campus-incharge";
import {
  fetchIntermediateTeacherSectionIds,
  saveIntermediateTeacherSectionIds,
} from "@/lib/teacher-scope";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Props = {
  userId: string | null;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type SectionOption = {
  id: string;
  label: string;
  className: string;
  yearLevel: number;
  programName: string;
  sessionLabel: string;
};

export function TeacherIntermediateSectionsDialog({
  userId,
  userName,
  open,
  onOpenChange,
}: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["teacher-intermediate-section-options"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sections")
        .select(
          "id, name, gender, academic_sessions(label), classes(id, name, year_level, programs(name, type))",
        )
        .order("name");
      if (error) throw error;

      return (data ?? [])
        .map((row) => {
          const cls = row.classes as {
            name?: string;
            year_level?: number;
            programs?: { name?: string; type?: string } | null;
          } | null;
          if (cls?.programs?.type !== "intermediate") return null;
          const session = row.academic_sessions as { label?: string } | null;
          return {
            id: row.id,
            label: sectionDisplayLabel({ name: row.name, gender: row.gender }),
            className: cls?.name ?? "Class",
            yearLevel: cls?.year_level ?? 0,
            programName: cls?.programs?.name ?? "Intermediate",
            sessionLabel: session?.label ?? "No session",
          } satisfies SectionOption;
        })
        .filter((row): row is SectionOption => Boolean(row))
        .sort((a, b) => {
          const session = a.sessionLabel.localeCompare(b.sessionLabel);
          if (session !== 0) return session;
          const year = a.yearLevel - b.yearLevel;
          if (year !== 0) return year;
          return a.label.localeCompare(b.label);
        });
    },
  });

  const grouped = useMemo(() => {
    const bySession = new Map<string, Map<string, SectionOption[]>>();
    for (const section of sections) {
      const classKey = `${section.yearLevel}|${section.className}`;
      if (!bySession.has(section.sessionLabel)) {
        bySession.set(section.sessionLabel, new Map());
      }
      const byClass = bySession.get(section.sessionLabel)!;
      if (!byClass.has(classKey)) byClass.set(classKey, []);
      byClass.get(classKey)!.push(section);
    }
    return bySession;
  }, [sections]);

  useEffect(() => {
    if (!open || !userId) {
      setSelected([]);
      return;
    }
    fetchIntermediateTeacherSectionIds(userId)
      .then(setSelected)
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load Inter assignments");
      });
  }, [open, userId]);

  const toggleSection = (sectionId: string) => {
    setSelected((current) =>
      current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId],
    );
  };

  const toggleClassSections = (classSections: SectionOption[], checked: boolean) => {
    const ids = classSections.map((s) => s.id);
    setSelected((current) => {
      if (checked) return [...new Set([...current, ...ids])];
      return current.filter((id) => !ids.includes(id));
    });
  };

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await saveIntermediateTeacherSectionIds(userId, selected);
      toast.success("Intermediate class assignments saved");
      await qc.invalidateQueries({ queryKey: ["teacher-intermediate-assignments", userId] });
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not save assignments");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Intermediate sections — {userName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Assign Intermediate sections by session. This teacher will only see students in these
          Intermediate classes. BS classes are assigned separately under LMS Offerings.
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading Intermediate sections…</p>
        ) : !sections.length ? (
          <p className="text-sm text-muted-foreground">
            No Intermediate sections found. Create them in Academic setup first.
          </p>
        ) : (
          <div className="space-y-5">
            {[...grouped.entries()].map(([sessionLabel, classesMap]) => (
              <div key={sessionLabel} className="space-y-3">
                <p className="text-base font-semibold">{sessionLabel}</p>
                {[...classesMap.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([classKey, classSections]) => {
                    const className = classSections[0]?.className ?? "Class";
                    const allSelected = classSections.every((s) => selected.includes(s.id));
                    const someSelected = classSections.some((s) => selected.includes(s.id));
                    return (
                      <div key={classKey} className="space-y-2 rounded-2xl border p-3">
                        <label className="flex items-center gap-3 border-b pb-2 text-sm font-medium">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={(value) =>
                              toggleClassSections(classSections, value === true)
                            }
                            className={someSelected && !allSelected ? "opacity-60" : undefined}
                          />
                          <span>{className}</span>
                        </label>
                        <div className="space-y-2 pl-1">
                          {classSections.map((row) => (
                            <label key={row.id} className="flex items-center gap-3 text-sm">
                              <Checkbox
                                checked={selected.includes(row.id)}
                                onCheckedChange={() => toggleSection(row.id)}
                              />
                              <span>{row.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving || !userId}>
            {saving ? "Saving…" : "Save Inter assignments"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
