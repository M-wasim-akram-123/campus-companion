import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCampusInchargeAssignmentsForUser,
  saveCampusInchargeClassIds,
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

type ClassOption = {
  id: string;
  name: string;
  year_level: number;
  programName: string;
};

export function CampusInchargeClassesDialog({ userId, userName, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: classes = [], isLoading } = useQuery({
    queryKey: ["campus-incharge-class-options"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, year_level, programs(name)")
        .order("year_level");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        year_level: row.year_level,
        programName: (row.programs as { name?: string } | null)?.name ?? "Program",
      })) as ClassOption[];
    },
  });

  useEffect(() => {
    if (!open || !userId) {
      setSelected([]);
      return;
    }
    fetchCampusInchargeAssignmentsForUser(userId)
      .then(setSelected)
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Could not load class assignments");
      });
  }, [open, userId]);

  const toggleClass = (classId: string) => {
    setSelected((current) =>
      current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId],
    );
  };

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await saveCampusInchargeClassIds(userId, selected);
      toast.success("Class assignments saved");
      await qc.invalidateQueries({ queryKey: ["campus-incharge-assignments", userId] });
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not save assignments");
    } finally {
      setSaving(false);
    }
  };

  const grouped = classes.reduce<Record<string, ClassOption[]>>((acc, row) => {
    const key = row.programName;
    acc[key] = acc[key] ?? [];
    acc[key].push(row);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign classes — {userName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Campus Incharge can view students, fee ledgers, and download lists only for these classes.
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading classes…</p>
        ) : !classes.length ? (
          <p className="text-sm text-muted-foreground">No classes found. Set up programs in Academic setup first.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([programName, programClasses]) => (
              <div key={programName} className="space-y-2">
                <p className="text-sm font-semibold">{programName}</p>
                <div className="space-y-2 rounded-2xl border p-3">
                  {programClasses.map((row) => (
                    <label key={row.id} className="flex items-center gap-3 text-sm">
                      <Checkbox
                        checked={selected.includes(row.id)}
                        onCheckedChange={() => toggleClass(row.id)}
                      />
                      <span>{row.name}</span>
                    </label>
                  ))}
                </div>
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
