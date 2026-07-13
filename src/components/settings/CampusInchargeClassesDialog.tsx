import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCampusInchargeAssignmentsForUser,
  saveCampusInchargeSectionIds,
  sectionDisplayLabel,
} from "@/lib/campus-incharge";
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
};

export function CampusInchargeClassesDialog({ userId, userName, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["campus-incharge-section-options"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sections")
        .select("id, name, gender, classes(id, name, year_level, programs(name))")
        .order("name");
      if (error) throw error;

      return (data ?? [])
        .map((row) => {
          const cls = row.classes as {
            name?: string;
            year_level?: number;
            programs?: { name?: string } | null;
          } | null;
          return {
            id: row.id,
            label: sectionDisplayLabel({ name: row.name, gender: row.gender }),
            className: cls?.name ?? "Class",
            yearLevel: cls?.year_level ?? 0,
            programName: cls?.programs?.name ?? "Program",
          };
        })
        .sort((a, b) => {
          const program = a.programName.localeCompare(b.programName);
          if (program !== 0) return program;
          const year = a.yearLevel - b.yearLevel;
          if (year !== 0) return year;
          return a.label.localeCompare(b.label);
        }) as SectionOption[];
    },
  });

  const grouped = useMemo(() => {
    const byProgram = new Map<string, Map<string, SectionOption[]>>();
    for (const section of sections) {
      const classKey = `${section.yearLevel}|${section.className}`;
      if (!byProgram.has(section.programName)) {
        byProgram.set(section.programName, new Map());
      }
      const byClass = byProgram.get(section.programName)!;
      if (!byClass.has(classKey)) byClass.set(classKey, []);
      byClass.get(classKey)!.push(section);
    }
    return byProgram;
  }, [sections]);

  useEffect(() => {
    if (!open || !userId) {
      setSelected([]);
      return;
    }
    fetchCampusInchargeAssignmentsForUser(userId)
      .then(setSelected)
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load section assignments");
      });
  }, [open, userId]);

  const toggleSection = (sectionId: string) => {
    setSelected((current) =>
      current.includes(sectionId) ? current.filter((id) => id !== sectionId) : [...current, sectionId],
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
      await saveCampusInchargeSectionIds(userId, selected);
      toast.success("Section assignments saved");
      await qc.invalidateQueries({ queryKey: ["campus-incharge-assignments", userId] });
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
          <DialogTitle>Assign sections — {userName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Pick individual sections (e.g. First Year Boys A). Campus Incharge sees only students in
          those sections.
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading sections…</p>
        ) : !sections.length ? (
          <p className="text-sm text-muted-foreground">
            No sections found. Set up programs, classes, and sections in Academic setup first.
          </p>
        ) : (
          <div className="space-y-5">
            {[...grouped.entries()].map(([programName, classesMap]) => (
              <div key={programName} className="space-y-3">
                <p className="text-base font-semibold">{programName}</p>
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
            {saving ? "Saving…" : "Save assignments"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
