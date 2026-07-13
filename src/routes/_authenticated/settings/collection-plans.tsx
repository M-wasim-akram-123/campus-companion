import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import {
  CALENDAR_MONTHS,
  formatCollectionMonths,
  sortCollectionMonths,
} from "@/lib/fee-collection-plans";

export const Route = createFileRoute("/_authenticated/settings/collection-plans")({
  component: CollectionPlansPage,
});

type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  collection_months: number[];
  due_day: number;
  is_active: boolean;
  sort_order: number;
};

function CollectionPlansPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDay, setDueDay] = useState("10");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["fee-collection-plans-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_collection_plans")
        .select("id, name, description, collection_months, due_day, is_active, sort_order")
        .order("sort_order")
        .order("name");
      if (error) {
        if (error.message.includes("fee_collection_plans")) {
          throw new Error(
            "Collection plans table is missing. Run supabase/patch-fee-collection-plans.sql in Supabase.",
          );
        }
        throw error;
      }
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        collection_months: (row.collection_months ?? []).map(Number),
        due_day: Number(row.due_day ?? 10),
        is_active: row.is_active,
        sort_order: Number(row.sort_order ?? 0),
      })) as PlanRow[];
    },
  });

  const previewMonths = useMemo(
    () => formatCollectionMonths(selectedMonths, false),
    [selectedMonths],
  );

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setDueDay("10");
    setSortOrder("0");
    setIsActive(true);
    setSelectedMonths([]);
  };

  const loadPlan = (plan: PlanRow) => {
    setEditingId(plan.id);
    setName(plan.name);
    setDescription(plan.description ?? "");
    setDueDay(String(plan.due_day));
    setSortOrder(String(plan.sort_order));
    setIsActive(plan.is_active);
    setSelectedMonths([...plan.collection_months]);
  };

  const toggleMonth = (month: number, checked: boolean) => {
    setSelectedMonths((prev) => {
      const next = checked ? [...prev, month] : prev.filter((m) => m !== month);
      return sortCollectionMonths(next);
    });
  };

  const savePlan = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return toast.error("Plan name is required");
    if (!selectedMonths.length) return toast.error("Select at least one collection month");

    const due_day = Math.min(28, Math.max(1, parseInt(dueDay, 10) || 10));
    const sort_order = parseInt(sortOrder, 10) || 0;
    const payload = {
      name: trimmedName,
      description: description.trim() || null,
      collection_months: sortCollectionMonths(selectedMonths),
      due_day,
      is_active: isActive,
      sort_order,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase.from("fee_collection_plans").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Collection plan updated");
      } else {
        const { error } = await supabase.from("fee_collection_plans").insert(payload);
        if (error) throw error;
        toast.success("Collection plan created");
      }
      resetForm();
      await qc.invalidateQueries({ queryKey: ["fee-collection-plans-all"] });
      await qc.invalidateQueries({ queryKey: ["fee-collection-plans"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save collection plan");
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async (id: string) => {
    if (!window.confirm("Delete this collection plan? Students already assigned keep their installments.")) return;
    const { error } = await supabase.from("fee_collection_plans").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Collection plan deleted");
    if (editingId === id) resetForm();
    await qc.invalidateQueries({ queryKey: ["fee-collection-plans-all"] });
    await qc.invalidateQueries({ queryKey: ["fee-collection-plans"] });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings/fees">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Fee policies
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fee collection plans</h1>
          <p className="text-sm text-muted-foreground">
            Define which months annual fee is collected. Admission officers pick a plan at admission; the
            existing custom installment schedule remains available as &quot;Other plan&quot;.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit collection plan" : "New collection plan"}</CardTitle>
          <CardDescription>
            Example: September, November, January, March — four equal splits of annual fee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Plan name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Plan A" />
            </div>
            <div className="space-y-1">
              <Label>Due day of month</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Description (optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Four collections across the academic year"
              />
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Collection months</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {CALENDAR_MONTHS.map((month) => {
                const checked = selectedMonths.includes(month.value);
                return (
                  <label
                    key={month.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => toggleMonth(month.value, value === true)}
                    />
                    {month.label}
                  </label>
                );
              })}
            </div>
            {selectedMonths.length > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Order: {previewMonths} ({selectedMonths.length} installment
                {selectedMonths.length === 1 ? "" : "s"})
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(v === true)} />
              Active (shown at admission)
            </label>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Sort order</Label>
              <Input
                className="w-20"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={savePlan} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              {editingId ? "Update plan" : "Create plan"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={resetForm}>
                Cancel edit
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing plans</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">No collection plans yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Months</TableHead>
                  <TableHead>Due day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <p className="font-medium">{plan.name}</p>
                      {plan.description && (
                        <p className="text-xs text-muted-foreground">{plan.description}</p>
                      )}
                    </TableCell>
                    <TableCell>{formatCollectionMonths(plan.collection_months, false)}</TableCell>
                    <TableCell>{plan.due_day}</TableCell>
                    <TableCell>
                      <Badge variant={plan.is_active ? "default" : "secondary"}>
                        {plan.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => loadPlan(plan)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deletePlan(plan.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
