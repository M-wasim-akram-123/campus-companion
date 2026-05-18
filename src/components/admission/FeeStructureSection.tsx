import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FEE_COMPONENTS,
  admissionLinesTotal,
  buildAdmissionPaymentLines,
  buildFutureInstallmentSchedule,
  buildSavedInstallmentSchedule,
  componentMap,
  defaultFirstInstallmentDate,
  fetchFeePolicy,
  findScholarshipSlab,
  formatCurrency,
  matricPercentage,
  scholarshipAmount,
  syncAdmissionLinesFromFees,
} from "@/lib/fees";
import type {
  AdmissionPaymentLine,
  AnnualFeeScheduleType,
  FeeComponentType,
  FeeStructurePayload,
  InstallmentPreview,
} from "@/lib/fees-types";
import { INSTALLMENT_COUNT_OPTIONS, INSTALLMENT_SPACING_OPTIONS } from "@/lib/fees-types";

type Props = {
  programId: string;
  academicSessionId: string;
  matricObtained: string;
  matricTotal: string;
  onChange: (payload: FeeStructurePayload) => void;
};

function mergePreservingDueDates(prev: InstallmentPreview[], built: InstallmentPreview[]): InstallmentPreview[] {
  if (prev.length !== built.length) return built;
  return built.map((row, i) => ({
    ...row,
    due_date: prev[i]?.due_date || row.due_date,
    amount: prev[i]?.amount ?? row.amount,
    label: prev[i]?.label || row.label,
  }));
}

export function FeeStructureSection({
  programId,
  academicSessionId,
  matricObtained,
  matricTotal,
  onChange,
}: Props) {
  const [fees, setFees] = useState<Record<FeeComponentType, number>>(
    () => Object.fromEntries(FEE_COMPONENTS.map((c) => [c.key, 0])) as Record<FeeComponentType, number>,
  );
  const [admissionLines, setAdmissionLines] = useState<AdmissionPaymentLine[]>([]);
  const [schedule, setSchedule] = useState<AnnualFeeScheduleType>("quarterly");
  const [installmentCount, setInstallmentCount] = useState<number>(4);
  const [startAfterMonths, setStartAfterMonths] = useState(2);
  const [firstInstallmentDate, setFirstInstallmentDate] = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  const [policyLoaded, setPolicyLoaded] = useState<string | null>(null);
  const [futureInstallments, setFutureInstallments] = useState<InstallmentPreview[]>([]);
  const [datesEdited, setDatesEdited] = useState(false);

  const { data: policy, isLoading } = useQuery({
    queryKey: ["fee-policy", programId, academicSessionId],
    enabled: !!programId && !!academicSessionId,
    queryFn: () => fetchFeePolicy(programId, academicSessionId),
  });

  useEffect(() => {
    setPolicyLoaded(null);
    setDatesEdited(false);
  }, [programId, academicSessionId]);

  const pct = matricPercentage(
    matricObtained ? parseFloat(matricObtained) : null,
    matricTotal ? parseFloat(matricTotal) : null,
  );

  const scholarship = useMemo(() => findScholarshipSlab(policy?.fee_scholarship_slabs, pct), [policy, pct]);

  const scholarshipDiscount = useMemo(() => {
    if (!scholarship) return 0;
    const line = admissionLines.find((l) => l.enabled && l.component_type === scholarship.applies_to);
    const base = line?.amount ?? fees[scholarship.applies_to] ?? 0;
    return scholarshipAmount(base, scholarship.discount);
  }, [scholarship, admissionLines, fees]);

  const payAtAdmission = useMemo(
    () => admissionLinesTotal(admissionLines, scholarship),
    [admissionLines, scholarship],
  );

  const firstDue =
    firstInstallmentDate || defaultFirstInstallmentDate(new Date(), startAfterMonths);

  const rebuildFuture = useCallback(
    (preserveDates: boolean) => {
      const built = buildFutureInstallmentSchedule({
        fees,
        admissionLines,
        templates: policy?.fee_policy_installment_templates,
        schedule,
        installmentCount,
        firstInstallmentDate: firstDue,
        startAfterMonths,
      });
      setFutureInstallments((prev) => (preserveDates ? mergePreservingDueDates(prev, built) : built));
    },
    [fees, admissionLines, policy?.fee_policy_installment_templates, schedule, installmentCount, firstDue, startAfterMonths],
  );

  useEffect(() => {
    if (!policy?.id || policyLoaded === policy.id) return;
    const map = componentMap(policy.fee_policy_components);
    const lines = buildAdmissionPaymentLines(
      map,
      policy.default_admission_components as FeeComponentType[] | undefined,
    );
    const months = policy.default_start_after_months ?? 2;
    const count = policy.default_installment_count ?? 4;
    const sched = (policy.default_schedule as AnnualFeeScheduleType) ?? "quarterly";

    setFees(map);
    setAdmissionLines(lines);
    setSchedule(INSTALLMENT_SPACING_OPTIONS.some((o) => o.value === sched) ? sched : "quarterly");
    setInstallmentCount(
      INSTALLMENT_COUNT_OPTIONS.includes(count as (typeof INSTALLMENT_COUNT_OPTIONS)[number]) ? count : 4,
    );
    setStartAfterMonths(months);
    setFirstInstallmentDate(defaultFirstInstallmentDate(new Date(), months));
    setDateTouched(false);
    setDatesEdited(false);
    setPolicyLoaded(policy.id);

    setFutureInstallments(
      buildFutureInstallmentSchedule({
        fees: map,
        admissionLines: lines,
        templates: policy.fee_policy_installment_templates,
        schedule: sched,
        installmentCount: count,
        firstInstallmentDate: defaultFirstInstallmentDate(new Date(), months),
        startAfterMonths: months,
      }),
    );
  }, [policy, policyLoaded]);

  useEffect(() => {
    if (!policyLoaded) return;
    setAdmissionLines((lines) => syncAdmissionLinesFromFees(lines, fees));
  }, [fees, policyLoaded]);

  useEffect(() => {
    if (dateTouched) return;
    setFirstInstallmentDate(defaultFirstInstallmentDate(new Date(), startAfterMonths));
  }, [startAfterMonths, dateTouched]);

  useEffect(() => {
    if (!policyLoaded) return;
    rebuildFuture(datesEdited);
  }, [
    policyLoaded,
    fees,
    admissionLines,
    schedule,
    installmentCount,
    firstDue,
    startAfterMonths,
    policy?.fee_policy_installment_templates,
    rebuildFuture,
    datesEdited,
  ]);

  const savedInstallments = useMemo(
    () =>
      buildSavedInstallmentSchedule({
        admissionLines,
        fees,
        templates: policy?.fee_policy_installment_templates,
        schedule,
        installmentCount,
        firstInstallmentDate: firstDue,
        startAfterMonths,
        scholarship,
        futureInstallments,
      }),
    [
      admissionLines,
      fees,
      policy?.fee_policy_installment_templates,
      schedule,
      installmentCount,
      firstDue,
      startAfterMonths,
      scholarship,
      futureInstallments,
    ],
  );

  const futureTotal = futureInstallments.reduce((s, r) => s + r.amount, 0);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    onChangeRef.current({
      fees,
      scholarshipDiscount,
      scholarshipLabel: scholarship?.label ?? null,
      payAtAdmission,
      admissionPayments: admissionLines,
      schedule,
      installmentCount,
      startAfterMonths,
      firstInstallmentDate: firstDue,
      policyId: policy?.id ?? null,
      installments: savedInstallments,
    });
  }, [
    fees,
    scholarshipDiscount,
    scholarship,
    payAtAdmission,
    admissionLines,
    schedule,
    installmentCount,
    startAfterMonths,
    firstDue,
    policy,
    savedInstallments,
  ]);

  const updateAdmissionLine = (index: number, patch: Partial<AdmissionPaymentLine>) => {
    setAdmissionLines((lines) => lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const updateFutureRow = (index: number, patch: Partial<InstallmentPreview>) => {
    setDatesEdited(true);
    setFutureInstallments((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const setFee = (key: FeeComponentType, value: number) => {
    setFees((prev) => ({ ...prev, [key]: value }));
  };

  const onCountChange = (value: string) => {
    setDatesEdited(false);
    setInstallmentCount(parseInt(value, 10));
  };

  const onSpacingChange = (value: AnnualFeeScheduleType) => {
    setSchedule(value);
    setDatesEdited(false);
  };

  if (!programId || !academicSessionId) {
    return (
      <Card>
        <CardHeader><CardTitle>Fee structure</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Select program and academic session to load fees.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <Card><CardContent className="p-6 text-muted-foreground">Loading fee policy…</CardContent></Card>;
  }

  if (!policy) {
    return (
      <Card className="border-amber-500/50">
        <CardHeader><CardTitle>Fee structure</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>No fee policy for this program and session.</p>
          <Link to="/settings/fees" className="text-primary underline">Create a fee policy</Link>
        </CardContent>
      </Card>
    );
  }

  const programLabel = (policy.programs as { name?: string })?.name;
  const sessionLabel = (policy.academic_sessions as { label?: string })?.label;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fee structure — {policy.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {programLabel} · {sessionLabel}
          {pct != null && (
            <>
              {" "}
              · Matric {pct.toFixed(1)}%
              {scholarship ? ` · ${scholarship.label}` : ""}
            </>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="mb-3 font-medium">Fee amounts (from policy)</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEE_COMPONENTS.map((c) => (
              <div key={c.key} className="space-y-1">
                <Label className="text-xs">{c.label}</Label>
                <Input
                  type="number"
                  min={0}
                  value={fees[c.key] ?? 0}
                  onChange={(e) => setFee(c.key, parseFloat(e.target.value) || 0)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-medium">Due at admission</h4>
              <p className="text-xs text-muted-foreground">
                Checked items are collected now and are not repeated in installments below.
              </p>
            </div>
            <p className="text-xl font-semibold">{formatCurrency(payAtAdmission)}</p>
          </div>
          <div className="space-y-2">
            {admissionLines.map((line, i) => (
              <div
                key={line.component_type}
                className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-2"
              >
                <Checkbox
                  checked={line.enabled}
                  onCheckedChange={(v) => updateAdmissionLine(i, { enabled: v === true })}
                />
                <span className="min-w-[120px] flex-1 text-sm">
                  {FEE_COMPONENTS.find((c) => c.key === line.component_type)?.label}
                </span>
                <Input
                  type="number"
                  min={0}
                  className="w-28"
                  disabled={!line.enabled}
                  value={line.amount}
                  onChange={(e) => updateAdmissionLine(i, { amount: parseFloat(e.target.value) || 0 })}
                />
                {scholarship?.applies_to === line.component_type && line.enabled && scholarshipDiscount > 0 && (
                  <span className="text-xs text-primary">−{formatCurrency(scholarshipDiscount)}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="mb-3 font-medium">Annual fee installments</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Number of installments</Label>
              <Select value={String(installmentCount)} onValueChange={onCountChange}>
                <SelectTrigger><SelectValue placeholder="Select count" /></SelectTrigger>
                <SelectContent>
                  {INSTALLMENT_COUNT_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} installment{n > 1 ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Due date spacing</Label>
              <Select value={schedule} onValueChange={(v) => onSpacingChange(v as AnnualFeeScheduleType)}>
                <SelectTrigger><SelectValue placeholder="Select spacing" /></SelectTrigger>
                <SelectContent>
                  {INSTALLMENT_SPACING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">First installment after (months)</Label>
              <Input
                type="number"
                min={0}
                value={startAfterMonths}
                onChange={(e) => {
                  setStartAfterMonths(Math.max(0, parseInt(e.target.value, 10) || 0));
                  setDateTouched(false);
                  setDatesEdited(false);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">First installment date (default)</Label>
              <Input
                type="date"
                value={firstInstallmentDate}
                onChange={(e) => {
                  setFirstInstallmentDate(e.target.value);
                  setDateTouched(true);
                  setDatesEdited(false);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Splits {formatCurrency(fees.annual_fee)} into {installmentCount} payments — edit dates per row below
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="font-medium">Installment schedule</h4>
            <p className="text-sm text-muted-foreground">
              Future: {formatCurrency(futureTotal)}
              {payAtAdmission > 0 && ` · At admission: ${formatCurrency(payAtAdmission)}`}
            </p>
          </div>
          {futureInstallments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No future installments — everything is collected at admission or amounts are zero.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Due date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount (PKR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {futureInstallments.map((row, i) => (
                  <TableRow key={`${row.component_type}-${i}`}>
                    <TableCell>
                      <Input
                        type="date"
                        className="min-w-[140px]"
                        value={row.due_date}
                        onChange={(e) => updateFutureRow(i, { due_date: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.label}
                        onChange={(e) => updateFutureRow(i, { label: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className="ml-auto max-w-[120px] text-right"
                        value={row.amount}
                        onChange={(e) => updateFutureRow(i, { amount: parseFloat(e.target.value) || 0 })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {savedInstallments.length} line(s) saved (including admission).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
