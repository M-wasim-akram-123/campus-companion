import { createFileRoute } from "@tanstack/react-router";
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
import { toast } from "sonner";
import { FEE_COMPONENTS, formatCurrency, policyAutoName } from "@/lib/fees";
import type { AnnualFeeScheduleType, FeeComponentType, ScholarshipSlab } from "@/lib/fees-types";
import { INSTALLMENT_COUNT_OPTIONS, INSTALLMENT_SPACING_OPTIONS } from "@/lib/fees-types";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/fees")({
  component: FeePoliciesPage,
});

const emptyFees = () =>
  Object.fromEntries(FEE_COMPONENTS.map((c) => [c.key, "0"])) as Record<FeeComponentType, string>;

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
  const [showScholarships, setShowScholarships] = useState(false);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [programId, setProgramId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [amounts, setAmounts] = useState(emptyFees);
  const [defaultSchedule, setDefaultSchedule] = useState<AnnualFeeScheduleType>("quarterly");
  const [defaultInstallmentCount, setDefaultInstallmentCount] = useState("4");
  const [defaultStartAfterMonths, setDefaultStartAfterMonths] = useState("2");
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
        .select("*, programs(name), academic_sessions(label), fee_policy_components(*), fee_scholarship_slabs(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (nameTouched || !programId || !sessionId) return;
    const prog = programs?.find((p) => p.id === programId);
    const sess = sessions?.find((s) => s.id === sessionId);
    if (prog && sess) setName(policyAutoName(prog.name, sess.label));
  }, [programId, sessionId, programs, sessions, nameTouched]);

  const resetForm = () => {
    setEditingId(null);
    setShowScholarships(false);
    setName("");
    setNameTouched(false);
    setProgramId("");
    setSessionId("");
    setAmounts(emptyFees());
    setDefaultSchedule("quarterly");
    setDefaultInstallmentCount("4");
    setDefaultStartAfterMonths("2");
    setDefaultAdmissionComponents(["admission_fee", "annual_fund"]);
    setSlabs([]);
  };

  const loadPolicy = (p: (typeof policies)[0]) => {
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
    setDefaultSchedule((p.default_schedule as AnnualFeeScheduleType) ?? "quarterly");
    setDefaultInstallmentCount(String(p.default_installment_count ?? 4));
    setDefaultStartAfterMonths(String(p.default_start_after_months ?? 2));
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
        default_schedule: defaultSchedule,
        default_installment_count: parseInt(defaultInstallmentCount, 10) || 4,
        default_start_after_months: parseInt(defaultStartAfterMonths, 10) || 0,
        default_admission_components: defaultAdmissionComponents,
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Fee policies</h1>
        <p className="text-muted-foreground">
          Set standard fees for each program and session (e.g. ICS 2025–26). Used automatically at admission.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Edit policy" : "New policy"}</CardTitle>
          <CardDescription>
            Step 1: Program + session · Step 2: Fee amounts · Step 3: Defaults for admission
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
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Number of installments</Label>
                <Select value={defaultInstallmentCount} onValueChange={setDefaultInstallmentCount}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INSTALLMENT_COUNT_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n} installment{n > 1 ? "s" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Due date spacing</Label>
                <Select value={defaultSchedule} onValueChange={(v) => setDefaultSchedule(v as AnnualFeeScheduleType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INSTALLMENT_SPACING_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">First due after (months)</Label>
                <Input
                  type="number"
                  min={0}
                  value={defaultStartAfterMonths}
                  onChange={(e) => setDefaultStartAfterMonths(e.target.value)}
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
    </div>
  );
}
