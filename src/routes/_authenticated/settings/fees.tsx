import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FEE_COMPONENTS, formatCurrency, policyAutoName } from "@/lib/fees";
import type { FeeComponentType, ScholarshipSlab } from "@/lib/fees-types";
import {
  INSTALLMENT_COUNT_OPTIONS,
  monthNameForOffset,
  scheduleForInstallmentCount,
} from "@/lib/fees-types";
import { Eye, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/fees")({
  component: FeePoliciesPage,
});

const emptyFees = () =>
  Object.fromEntries(FEE_COMPONENTS.map((c) => [c.key, "0"])) as Record<FeeComponentType, string>;

type PolicyRow = {
  id: string;
  name: string;
  program_id: string;
  academic_session_id: string | null;
  default_installment_count?: number | null;
  default_start_after_months?: number | null;
  default_admission_components?: unknown;
  projection_cycle_type?: string | null;
  projection_cycle_count?: number | null;
  increment_type?: string | null;
  increment_value?: number | string | null;
  annual_fund_frequency?: string | null;
  programs?: { name?: string } | null;
  academic_sessions?: { label?: string } | null;
  fee_policy_components?: Array<{ component_type: string; amount: number | string | null }> | null;
  fee_scholarship_slabs?: Array<{
    min_percentage: number | string;
    max_percentage: number | string | null;
    discount_percent: number | string;
    applies_to: FeeComponentType;
    label?: string | null;
  }> | null;
};

async function upsertPolicy(
  editingId: string | null,
  base: { name: string; program_id: string; academic_session_id: string },
  extended: Record<string, unknown>,
) {
  if (editingId) {
    const { error } = await supabase
      .from("admission_fee_policies")
      .update({ ...base, ...extended })
      .eq("id", editingId);
    if (!error) return editingId;
    if (!String(error.message).includes("column")) throw error;
    const { error: e2 } = await supabase.from("admission_fee_policies").update(base).eq("id", editingId);
    if (e2) throw e2;
    return editingId;
  }

  const { data, error } = await supabase
    .from("admission_fee_policies")
    .insert({ ...base, ...extended })
    .select()
    .single();
  if (!error) return data.id;

  if (!String(error.message).includes("column")) throw error;
  const { data: basic, error: e2 } = await supabase.from("admission_fee_policies").insert(base).select().single();
  if (e2) throw e2;
  return basic.id;
}

function FeePoliciesPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewPolicy, setViewPolicy] = useState<PolicyRow | null>(null);
  const [showScholarships, setShowScholarships] = useState(false);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [programId, setProgramId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [amounts, setAmounts] = useState(emptyFees);
  const [defaultInstallmentCount, setDefaultInstallmentCount] = useState("4");
  const [defaultStartAfterMonths, setDefaultStartAfterMonths] = useState("2");
  const [projectionCycleType, setProjectionCycleType] = useState("annual");
  const [projectionCycleCount, setProjectionCycleCount] = useState("2");
  const [incrementType, setIncrementType] = useState("percentage");
  const [incrementValue, setIncrementValue] = useState("0");
  const [annualFundFrequency, setAnnualFundFrequency] = useState("every_cycle");
  const [defaultAdmissionComponents, setDefaultAdmissionComponents] = useState<FeeComponentType[]>([
    "admission_fee",
    "annual_fund",
  ]);
  const [slabs, setSlabs] = useState<
    { min: string; max: string; discount: string; applies_to: FeeComponentType; label: string }[]
  >([]);
  const [saving, setSaving] = useState(false);

  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await supabase.from("programs").select("*").order("name")).data ?? [],
  });

  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () =>
      (await supabase.from("academic_sessions").select("*").order("start_year", { ascending: false })).data ?? [],
  });

  const { data: policies, isLoading } = useQuery({
    queryKey: ["fee-policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admission_fee_policies")
        .select("*, programs(name, duration_years), academic_sessions(label), fee_policy_components(*), fee_scholarship_slabs(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PolicyRow[];
    },
  });

  useEffect(() => {
    if (nameTouched || !programId || !sessionId) return;
    const prog = programs?.find((p) => p.id === programId);
    const sess = sessions?.find((s) => s.id === sessionId);
    if (prog && sess) setName(policyAutoName(prog.name, sess.label));
  }, [programId, sessionId, programs, sessions, nameTouched]);

  useEffect(() => {
    const prog = programs?.find((p) => p.id === programId);
    if (!prog || editingId) return;
    const durationYears = Math.max(1, Number(prog.duration_years ?? 1));
    setProjectionCycleCount(String(projectionCycleType === "semester" ? durationYears * 2 : durationYears));
  }, [programId, projectionCycleType, programs, editingId]);

  const resetForm = () => {
    setEditingId(null);
    setShowScholarships(false);
    setName("");
    setNameTouched(false);
    setProgramId("");
    setSessionId("");
    setAmounts(emptyFees());
    setDefaultInstallmentCount("4");
    setDefaultStartAfterMonths("2");
    setProjectionCycleType("annual");
    setProjectionCycleCount("2");
    setIncrementType("percentage");
    setIncrementValue("0");
    setAnnualFundFrequency("every_cycle");
    setDefaultAdmissionComponents(["admission_fee", "annual_fund"]);
    setSlabs([]);
  };

  const loadPolicy = (p: PolicyRow) => {
    setEditingId(p.id);
    setName(p.name);
    setNameTouched(true);
    setProgramId(p.program_id);
    setSessionId(p.academic_session_id ?? "");
    const map = emptyFees();
    for (const c of p.fee_policy_components ?? []) {
      map[c.component_type as FeeComponentType] = String(c.amount);
    }
    setAmounts(map);
    setDefaultInstallmentCount(String(p.default_installment_count ?? 4));
    setDefaultStartAfterMonths(String(Math.min(Number(p.default_start_after_months ?? 1), 2)));
    setProjectionCycleType(p.projection_cycle_type ?? "annual");
    setProjectionCycleCount(String(p.projection_cycle_count ?? 2));
    setIncrementType(p.increment_type ?? "percentage");
    setIncrementValue(String(p.increment_value ?? 0));
    setAnnualFundFrequency(p.annual_fund_frequency ?? "every_cycle");
    const adm = p.default_admission_components as FeeComponentType[] | undefined;
    setDefaultAdmissionComponents(adm?.length ? adm : ["admission_fee", "annual_fund"]);
    setSlabs(
      (p.fee_scholarship_slabs ?? []).map((s: ScholarshipSlab) => ({
        min: String(s.min_percentage),
        max: s.max_percentage != null ? String(s.max_percentage) : "",
        discount: String(s.discount_percent),
        applies_to: s.applies_to,
        label: s.label ?? "",
      })),
    );
    setShowScholarships((p.fee_scholarship_slabs?.length ?? 0) > 0);
  };

  const toggleAdmissionComponent = (key: FeeComponentType, checked: boolean) => {
    setDefaultAdmissionComponents((prev) =>
      checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key),
    );
  };

  const save = async () => {
    if (!programId || !sessionId) return toast.error("Select program and session");
    if (!name.trim()) return toast.error("Policy name is required");
    setSaving(true);
    try {
      const base = {
        name: name.trim(),
        program_id: programId,
        academic_session_id: sessionId,
      };
      const extended = {
        default_schedule: scheduleForInstallmentCount(parseInt(defaultInstallmentCount, 10) || 4),
        default_installment_count: parseInt(defaultInstallmentCount, 10) || 4,
        default_start_after_months: parseInt(defaultStartAfterMonths, 10) || 0,
        default_admission_components: defaultAdmissionComponents,
        projection_cycle_type: projectionCycleType,
        projection_cycle_count: Math.max(1, parseInt(projectionCycleCount, 10) || 1),
        increment_type: incrementType,
        increment_value: parseFloat(incrementValue) || 0,
        annual_fund_frequency: annualFundFrequency,
      };

      const policyId = await upsertPolicy(editingId, base, extended);

      await supabase.from("fee_policy_components").delete().eq("policy_id", policyId);
      await supabase.from("fee_scholarship_slabs").delete().eq("policy_id", policyId);

      const { error: compErr } = await supabase.from("fee_policy_components").insert(
        FEE_COMPONENTS.map((c) => ({
          policy_id: policyId,
          component_type: c.key,
          amount: parseFloat(amounts[c.key]) || 0,
        })),
      );
      if (compErr) throw compErr;

      if (slabs.length) {
        const { error: slabErr } = await supabase.from("fee_scholarship_slabs").insert(
          slabs.map((s, i) => ({
            policy_id: policyId,
            min_percentage: parseFloat(s.min) || 0,
            max_percentage: s.max ? parseFloat(s.max) : null,
            discount_percent: parseFloat(s.discount) || 0,
            applies_to: s.applies_to,
            label: s.label.trim() || null,
            sort_order: i,
          })),
        );
        if (slabErr) throw slabErr;
      }

      toast.success(editingId ? "Policy updated" : "Policy created");
      resetForm();
      qc.invalidateQueries({ queryKey: ["fee-policies"] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.error("A policy already exists for this program and session. Edit the existing one.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("admission_fee_policies").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Policy deleted");
    if (editingId === id) resetForm();
    qc.invalidateQueries({ queryKey: ["fee-policies"] });
  };

  const programOptions = useMemo(() => programs ?? [], [programs]);
  const selectedInstallmentCount = parseInt(defaultInstallmentCount, 10) || 4;
  const firstDueOptions = [0, 1, 2].map((offset) => ({
    value: String(offset),
    label: offset === 0 ? monthNameForOffset(0) : monthNameForOffset(offset),
  }));

  const setInstallmentCount = (value: string) => {
    setDefaultInstallmentCount(value);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Fee policies</h1>
        <p className="text-muted-foreground">
          Set standard fees for each program and session (e.g. ICS 2025–26). Used automatically at admission.
        </p>
        <p className="mt-2 text-sm">
          <Link to="/settings/collection-plans" className="text-primary underline">
            Manage fee collection plans
          </Link>{" "}
          (month-based installment schedules for annual fee).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit policy" : "New policy"}</CardTitle>
          <CardDescription>
            Step 1: Program + session · Step 2: Fee amounts · Step 3: Default installment suggestion
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Program *</Label>
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger><SelectValue placeholder="e.g. FSc Pre-Medical" /></SelectTrigger>
                <SelectContent>
                  {programOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Session *</Label>
              <Select value={sessionId} onValueChange={setSessionId}>
                <SelectTrigger><SelectValue placeholder="e.g. 2025–26" /></SelectTrigger>
                <SelectContent>
                  {sessions?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}{s.is_active ? " (active)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Policy name *</Label>
              <Input
                value={name}
                placeholder="Filled automatically when you pick program + session"
                onChange={(e) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
              />
            </div>
          </div>

          <div>
            <Label className="mb-3 block">Fee amounts (PKR)</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {FEE_COMPONENTS.map((c) => (
                <div key={c.key} className="flex items-center gap-3">
                  <Label className="w-36 shrink-0 text-sm">{c.label}</Label>
                  <Input
                    type="number"
                    min={0}
                    className="flex-1"
                    value={amounts[c.key]}
                    onChange={(e) => setAmounts((a) => ({ ...a, [c.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <Label className="mb-2 block">Usually paid at admission</Label>
              <div className="flex flex-wrap gap-4">
                {FEE_COMPONENTS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={defaultAdmissionComponents.includes(c.key)}
                      onCheckedChange={(v) => toggleAdmissionComponent(c.key, v === true)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Annual fee split into</Label>
                <Select value={defaultInstallmentCount} onValueChange={setInstallmentCount}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INSTALLMENT_COUNT_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} installment{n > 1 ? "s" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">First installment month</Label>
                <Select value={defaultStartAfterMonths} onValueChange={setDefaultStartAfterMonths}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {firstDueOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  The remaining installments continue month by month.
                </p>
              </div>
            </div>
            <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
              {selectedInstallmentCount <= 1
                ? `The annual fee will be due in ${firstDueOptions.find((o) => o.value === defaultStartAfterMonths)?.label ?? "the selected month"}.`
                : `The annual fee will be divided into ${selectedInstallmentCount} monthly parts starting from ${firstDueOptions.find((o) => o.value === defaultStartAfterMonths)?.label ?? "the selected month"}.`}
              {" "}Exact student due dates can still be adjusted during admission.
            </p>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <h3 className="font-medium">Full-session projection</h3>
              <p className="text-xs text-muted-foreground">
                These future dues are saved as projections during admission. Vouchers can be generated later.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Fee cycle</Label>
                <Select value={projectionCycleType} onValueChange={setProjectionCycleType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="semester">Semester</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Total cycles in session</Label>
                <Input
                  type="number"
                  min={1}
                  value={projectionCycleCount}
                  onChange={(e) => setProjectionCycleCount(e.target.value)}
                  placeholder="e.g. 2 years or 4 semesters"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Annual fund</Label>
                <Select value={annualFundFrequency} onValueChange={setAnnualFundFrequency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="every_cycle">Every annual cycle</SelectItem>
                    <SelectItem value="admission_only">Admission only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Increment type</Label>
                <Select value={incrementType} onValueChange={setIncrementType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No increment</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Increment value</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={incrementValue}
                  onChange={(e) => setIncrementValue(e.target.value)}
                  disabled={incrementType === "none"}
                  placeholder={incrementType === "fixed" ? "e.g. 5000" : "e.g. 10"}
                />
              </div>
            </div>
          </div>

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-2"
              onClick={() => setShowScholarships((v) => !v)}
            >
              {showScholarships ? "Hide" : "Add"} scholarship rules (optional)
            </Button>
            {showScholarships && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSlabs((s) => [
                        ...s,
                        { min: "80", max: "100", discount: "10", applies_to: "admission_fee", label: "Merit" },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add rule
                  </Button>
                </div>
                {slabs.length === 0 && (
                  <p className="text-sm text-muted-foreground">No rules — matric % discounts are optional.</p>
                )}
                {slabs.map((s, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-5">
                    <Input placeholder="Min %" value={s.min} onChange={(e) => {
                      const n = [...slabs]; n[i].min = e.target.value; setSlabs(n);
                    }} />
                    <Input placeholder="Max %" value={s.max} onChange={(e) => {
                      const n = [...slabs]; n[i].max = e.target.value; setSlabs(n);
                    }} />
                    <Input placeholder="Off %" value={s.discount} onChange={(e) => {
                      const n = [...slabs]; n[i].discount = e.target.value; setSlabs(n);
                    }} />
                    <Select
                      value={s.applies_to}
                      onValueChange={(v) => {
                        const n = [...slabs]; n[i].applies_to = v as FeeComponentType; setSlabs(n);
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FEE_COMPONENTS.map((c) => (
                          <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setSlabs(slabs.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Update policy" : "Create policy"}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Policies</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !policies?.length ? (
            <p className="text-muted-foreground">No policies yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Program</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Admission</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => {
                  const adm = p.fee_policy_components?.find((c) => c.component_type === "admission_fee");
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{(p.programs as { name?: string })?.name}</TableCell>
                      <TableCell>{(p.academic_sessions as { label?: string })?.label ?? "—"}</TableCell>
                      <TableCell>{formatCurrency(Number(adm?.amount ?? 0))}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => setViewPolicy(p)}>
                          <Eye className="mr-1 h-4 w-4" />
                          View
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => loadPolicy(p)}>Edit</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => remove(p.id)}>Delete</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <PolicyDetailsDialog policy={viewPolicy} onOpenChange={(open) => !open && setViewPolicy(null)} />
    </div>
  );
}

function PolicyDetailsDialog({
  policy,
  onOpenChange,
}: {
  policy: PolicyRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const admissionComponents = (policy?.default_admission_components as FeeComponentType[] | undefined) ?? [];
  const firstMonth = monthNameForOffset(Math.min(Number(policy?.default_start_after_months ?? 0), 2));
  const installmentCount = Number(policy?.default_installment_count ?? 1);
  const totalFee = (policy?.fee_policy_components ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return (
    <Dialog open={!!policy} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{policy?.name ?? "Fee policy details"}</DialogTitle>
        </DialogHeader>
        {policy && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Program</p>
                <p className="font-semibold">{policy.programs?.name ?? "—"}</p>
              </div>
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Session</p>
                <p className="font-semibold">{policy.academic_sessions?.label ?? "—"}</p>
              </div>
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Total policy fee</p>
                <p className="font-semibold">{formatCurrency(totalFee)}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Installments</p>
                <p className="font-semibold">
                  {installmentCount} monthly installment{installmentCount === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-muted-foreground">Starting from {firstMonth}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Usually paid at admission</p>
                <p className="font-semibold">
                  {admissionComponents.length
                    ? admissionComponents.map((key) => FEE_COMPONENTS.find((c) => c.key === key)?.label ?? key).join(", ")
                    : "None selected"}
                </p>
              </div>
            </div>

            <div>
              <h4 className="mb-2 font-medium">Fee amounts</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FEE_COMPONENTS.map((component) => {
                    const row = policy.fee_policy_components?.find((c) => c.component_type === component.key);
                    return (
                      <TableRow key={component.key}>
                        <TableCell>{component.label}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(row?.amount ?? 0))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div>
              <h4 className="mb-2 font-medium">Scholarship rules</h4>
              {!policy.fee_scholarship_slabs?.length ? (
                <p className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">No scholarship rules.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Matric %</TableHead>
                      <TableHead>Applies to</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policy.fee_scholarship_slabs.map((rule, index) => (
                      <TableRow key={`${rule.applies_to}-${index}`}>
                        <TableCell>{rule.label || "Scholarship"}</TableCell>
                        <TableCell>
                          {rule.min_percentage}
                          {rule.max_percentage != null ? ` - ${rule.max_percentage}` : "+"}
                        </TableCell>
                        <TableCell>{FEE_COMPONENTS.find((c) => c.key === rule.applies_to)?.label ?? rule.applies_to}</TableCell>
                        <TableCell className="text-right">{rule.discount_percent}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
