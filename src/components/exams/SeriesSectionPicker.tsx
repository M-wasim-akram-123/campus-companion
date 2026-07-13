import { useMemo, useState } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatSeriesSectionLabel, type SeriesSectionOption } from "@/lib/internal-exams";
import { cn } from "@/lib/utils";

type Props = {
  sections: SeriesSectionOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function SeriesSectionPicker({ sections, selectedIds, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const boys = useMemo(() => sections.filter((s) => s.gender === "boys"), [sections]);
  const girls = useMemo(() => sections.filter((s) => s.gender === "girls"), [sections]);

  const selectedSections = useMemo(
    () => sections.filter((s) => selectedIds.includes(s.id)),
    [sections, selectedIds],
  );

  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...selectedIds, id] : selectedIds.filter((x) => x !== id));
  };

  const toggleGroup = (group: SeriesSectionOption[], selectAll: boolean) => {
    const ids = group.map((s) => s.id);
    if (selectAll) {
      onChange([...new Set([...selectedIds, ...ids])]);
    } else {
      onChange(selectedIds.filter((id) => !ids.includes(id)));
    }
  };

  const renderGroup = (title: string, group: SeriesSectionOption[]) => {
    if (!group.length) return null;
    const allSelected = group.every((s) => selectedIds.includes(s.id));
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-muted-foreground">{title}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={disabled}
            onClick={() => toggleGroup(group, !allSelected)}
          >
            {allSelected ? "Clear" : "All"}
          </Button>
        </div>
        {group.map((section) => (
          <label
            key={section.id}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <Checkbox
              checked={selectedIds.includes(section.id)}
              disabled={disabled}
              onCheckedChange={(v) => toggle(section.id, v === true)}
            />
            <span>{formatSeriesSectionLabel(section)}</span>
          </label>
        ))}
      </div>
    );
  };

  if (!sections.length) {
    return <p className="text-sm text-muted-foreground">No sections found for this session and class year.</p>;
  }

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">
              {selectedIds.length
                ? `${selectedIds.length} section${selectedIds.length === 1 ? "" : "s"} selected`
                : "Select sections (boys & girls)…"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
          <div className="mb-2 flex items-center justify-between border-b pb-2">
            <Label className="text-xs text-muted-foreground">Multi-select sections</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={disabled}
              onClick={() => onChange(sections.map((s) => s.id))}
            >
              Select all
            </Button>
          </div>
          <div className="max-h-64 space-y-3 overflow-y-auto">
            {renderGroup("Boys", boys)}
            {renderGroup("Girls", girls)}
          </div>
        </PopoverContent>
      </Popover>

      {selectedSections.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedSections.map((section) => (
            <Badge key={section.id} variant="secondary" className="gap-1 pr-1">
              {formatSeriesSectionLabel(section)}
              {!disabled && (
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-muted"
                  onClick={() => toggle(section.id, false)}
                  aria-label={`Remove ${formatSeriesSectionLabel(section)}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Marks are uploaded per section when results are entered.
      </p>
    </div>
  );
}
