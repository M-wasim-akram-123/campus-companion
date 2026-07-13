import { supabase } from "@/integrations/supabase/client";
import type {
  AdmissionPaymentLine,
  AnnualFeeScheduleType,
  FeeComponentType,
  FeePolicy,
  FeePolicyComponent,
  FeePolicyInstallmentTemplate,
  FutureFeeProjection,
  InstallmentPreview,
  ScholarshipSlab,
} from "@/lib/fees-types";
import { FEE_COMPONENTS } from "@/lib/fees-types";
import {
  generateCollectionPlanDueDates,
  type FeeCollectionPlan,
} from "@/lib/fee-collection-plans";

export { FEE_COMPONENTS };

function installmentStatusForAmount(amount: number, paid: number): string {
  if (paid <= 0) return "pending";
  if (paid >= amount) return "paid";
  return "partial";
}

export function matricPercentage(obtained: number | null, total: number | null): number | null {
  if (obtained == null || total == null || total <= 0) return null;
  return (obtained / total) * 100;
}

export function componentMap(
  components: FeePolicyComponent[] | undefined,
): Record<FeeComponentType, number> {
  const map = Object.fromEntries(FEE_COMPONENTS.map((c) => [c.key, 0])) as Record<
    FeeComponentType,
    number
  >;
  for (const row of components ?? []) {
    map[row.component_type] = Number(row.amount) || 0;
  }
  return map;
}

export function componentLabel(type: FeeComponentType | null): string {
  if (!type) return "Other";
  return FEE_COMPONENTS.find((c) => c.key === type)?.label ?? type;
}

export function findScholarshipSlab(
  slabs: ScholarshipSlab[] | undefined,
  percentage: number | null,
): { discount: number; label: string; applies_to: FeeComponentType } | null {
  if (percentage == null || !slabs?.length) return null;
  const sorted = [...slabs].sort((a, b) => b.min_percentage - a.min_percentage);
  for (const slab of sorted) {
    const min = Number(slab.min_percentage);
    const max = slab.max_percentage != null ? Number(slab.max_percentage) : 100;
    if (percentage >= min && percentage <= max) {
      return {
        label: slab.label || `${slab.discount_percent}% scholarship`,
        discount: Number(slab.discount_percent),
        applies_to: slab.applies_to,
      };
    }
  }
  return null;
}

export function findScholarship(
  slabs: ScholarshipSlab[] | undefined,
  percentage: number | null,
): { discount: number; label: string } | null {
  const slab = findScholarshipSlab(slabs, percentage);
  return slab ? { discount: slab.discount, label: slab.label } : null;
}

export function scholarshipAmount(baseAmount: number, discountPercent: number): number {
  return Math.round((baseAmount * discountPercent) / 100);
}

export function buildAdmissionPaymentLines(
  fees: Record<FeeComponentType, number>,
  defaultComponents?: FeeComponentType[],
): AdmissionPaymentLine[] {
  const defaults = defaultComponents?.length
    ? defaultComponents
    : (["admission_fee", "annual_fund"] as FeeComponentType[]);
  return FEE_COMPONENTS.map((c) => ({
    component_type: c.key,
    enabled: defaults.includes(c.key),
    amount: fees[c.key] ?? 0,
    policy_amount: fees[c.key] ?? 0,
  }));
}

/** Sync admission line amounts when policy fee amounts change */
export function syncAdmissionLinesFromFees(
  lines: AdmissionPaymentLine[],
  fees: Record<FeeComponentType, number>,
): AdmissionPaymentLine[] {
  return lines.map((line) => {
    const policyAmount = fees[line.component_type] ?? 0;
    const amountUnchanged = line.amount === line.policy_amount;
    return {
      ...line,
      policy_amount: policyAmount,
      amount: amountUnchanged ? policyAmount : line.amount,
    };
  });
}

export function admissionLinesTotal(
  lines: AdmissionPaymentLine[],
  scholarship?: { applies_to: FeeComponentType; discount: number } | null,
): number {
  let total = 0;
  for (const line of lines) {
    if (!line.enabled) continue;
    let amount = line.amount;
    if (scholarship && line.component_type === scholarship.applies_to) {
      amount = Math.max(0, amount - scholarshipAmount(amount, scholarship.discount));
    }
    total += amount;
  }
  return total;
}

function applyIncrement(base: number, cycleIndex: number, type?: string, value?: number): number {
  const v = Number(value ?? 0);
  if (type === "fixed") return Math.max(0, base + v * cycleIndex);
  if (type === "percentage")
    return Math.max(0, Math.round(base * Math.pow(1 + v / 100, cycleIndex)));
  return base;
}

export function buildFutureFeeProjections(params: {
  policy: FeePolicy;
  fees: Record<FeeComponentType, number>;
  scholarship?: { applies_to: FeeComponentType; discount: number; label: string } | null;
  firstCycleDate?: Date;
}): FutureFeeProjection[] {
  const cycleType = params.policy.projection_cycle_type ?? "annual";
  const durationYears = Math.max(1, Number(params.policy.programs?.duration_years ?? 1));
  const inferredCycleCount = cycleType === "semester" ? durationYears * 2 : durationYears;
  const configuredCycleCount = Number(params.policy.projection_cycle_count ?? 0);
  const cycleCount = Math.max(
    1,
    configuredCycleCount > 1 ? configuredCycleCount : inferredCycleCount,
  );
  const incrementType = params.policy.increment_type ?? "percentage";
  const incrementValue = Number(params.policy.increment_value ?? 0);
  const annualFundFrequency = params.policy.annual_fund_frequency ?? "every_cycle";
  const baseDate = params.firstCycleDate ?? new Date();
  const projections: FutureFeeProjection[] = [];

  for (let cycleNo = 2; cycleNo <= cycleCount; cycleNo++) {
    const cycleIndex = cycleNo - 1;
    const due = addMonths(
      baseDate,
      cycleType === "semester" ? (cycleNo - 1) * 6 : (cycleNo - 1) * 12,
    );
    const dueDate = toDateString(due);
    const label = cycleType === "semester" ? `Semester ${cycleNo}` : `Year ${cycleNo}`;
    const feeType: FeeComponentType = cycleType === "semester" ? "semester_fee" : "annual_fee";
    const finalizedBase = params.fees[feeType] ?? 0;
    const payableAmount = applyIncrement(finalizedBase, cycleIndex, incrementType, incrementValue);
    const incrementAmount = Math.max(0, payableAmount - finalizedBase);
    const incrementLabel =
      incrementType === "percentage" && incrementValue > 0
        ? `${incrementValue}%`
        : incrementType === "fixed" && incrementValue > 0
          ? formatCurrency(incrementValue * cycleIndex)
          : null;
    if (finalizedBase > 0 || payableAmount > 0) {
      projections.push({
        cycle_no: cycleNo,
        cycle_label: label,
        component_type: feeType,
        policy_amount: finalizedBase,
        scholarship_discount: 0,
        payable_amount: payableAmount,
        increment_amount: incrementAmount,
        increment_label: incrementLabel,
        due_date: dueDate,
        notes: `${label} projected ${componentLabel(feeType)} from finalized fee`,
      });
    }

    if (
      cycleType === "annual" &&
      annualFundFrequency === "every_cycle" &&
      (params.fees.annual_fund ?? 0) > 0
    ) {
      projections.push({
        cycle_no: cycleNo,
        cycle_label: label,
        component_type: "annual_fund",
        policy_amount: params.fees.annual_fund,
        scholarship_discount: 0,
        payable_amount: params.fees.annual_fund,
        due_date: dueDate,
        notes: `${label} annual fund`,
      });
    }
  }

  return projections;
}

function parseDateString(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d || 1);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthName(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function withDayOfMonth(base: Date, day: number | null): Date {
  if (!day || day < 1) return base;
  const d = new Date(base);
  d.setDate(Math.min(day, 28));
  return d;
}

/** How many annual-fee installments to generate (respects user input) */
export function resolveInstallmentCount(
  schedule: AnnualFeeScheduleType,
  userCount: number,
): number {
  const n = Math.max(1, Math.floor(userCount) || 1);
  if (schedule === "monthly") return n;
  if (schedule === "quarterly") return n;
  return n;
}

export function monthsBetweenInstallments(
  _schedule: AnnualFeeScheduleType,
  _count: number,
): number {
  return 1;
}

function roundUpToNearest(value: number, nearest = 10): number {
  if (value <= 0) return 0;
  return Math.ceil(value / nearest) * nearest;
}

function roundedInstallmentAmounts(total: number, count: number): number[] {
  const safeTotal = Math.max(0, Math.round(total));
  if (safeTotal <= 0 || count <= 0) return [];
  if (count === 1) return [safeTotal];

  const base = safeTotal / count;
  const amounts: number[] = [];
  let allocated = 0;

  for (let i = 0; i < count - 1; i += 1) {
    const remainingRows = count - i;
    const remainingTotal = safeTotal - allocated;
    const rounded = roundUpToNearest(remainingTotal / remainingRows, 10);
    const amount = Math.min(rounded, remainingTotal);
    amounts.push(amount);
    allocated += amount;
  }

  amounts.push(Math.max(0, safeTotal - allocated));
  return amounts;
}

export type BalanceAnnualInstallmentsResult = {
  rows: InstallmentPreview[];
  ok: boolean;
  error?: string;
};

/** Ensure annual-fee installment rows sum to the payable annual fee total. */
export function balanceAnnualInstallmentAmounts(
  rows: InstallmentPreview[],
  targetTotal: number,
  options?: {
    paidByInstallmentId?: Record<string, number>;
    fixedRowIndexes?: Set<number>;
  },
): BalanceAnnualInstallmentsResult {
  const entries = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.component_type === "annual_fee");

  const next = rows.map((row) => ({ ...row }));
  const paidById = options?.paidByInstallmentId ?? {};
  const fixedIndexes = options?.fixedRowIndexes ?? new Set<number>();
  const safeTarget = Math.max(0, Math.round(targetTotal));

  if (safeTarget <= 0) {
    for (const { index } of entries) next[index] = { ...next[index], amount: 0 };
    return { rows: next, ok: true };
  }

  if (!entries.length) {
    return { rows, ok: false, error: "No annual fee installments to allocate." };
  }

  const fixedEntries = entries.filter(({ index }) => fixedIndexes.has(index));
  const unfixedEntries = entries.filter(({ index }) => !fixedIndexes.has(index));
  const fixedTotal = fixedEntries.reduce((sum, { index }) => sum + next[index].amount, 0);
  let remainingTarget = safeTarget - fixedTotal;

  if (remainingTarget < -0.5) {
    return {
      rows,
      ok: false,
      error: `Installment amounts exceed annual fee payable (${formatCurrency(safeTarget)}).`,
    };
  }

  for (const { row, index } of fixedEntries) {
    const paid = row.id ? paidById[row.id] ?? 0 : 0;
    if (next[index].amount < paid - 0.01) {
      return {
        rows,
        ok: false,
        error: `"${row.label}" cannot be less than already paid (${formatCurrency(paid)}).`,
      };
    }
  }

  if (!unfixedEntries.length) {
    if (Math.abs(fixedTotal - safeTarget) > 0.5) {
      return {
        rows,
        ok: false,
        error: `Installments total ${formatCurrency(fixedTotal)} but annual fee payable is ${formatCurrency(safeTarget)}.`,
      };
    }
    return { rows: next, ok: true };
  }

  const mins = unfixedEntries.map(({ row, index }) => ({
    index,
    min: row.id ? Math.max(0, paidById[row.id] ?? 0) : 0,
  }));
  const minSum = mins.reduce((sum, item) => sum + item.min, 0);
  if (remainingTarget < minSum - 0.5) {
    return {
      rows,
      ok: false,
      error: `Paid installments require at least ${formatCurrency(minSum)} but only ${formatCurrency(remainingTarget)} remains.`,
    };
  }

  let amounts = roundedInstallmentAmounts(remainingTarget, unfixedEntries.length);
  for (let i = 0; i < mins.length; i += 1) {
    if ((amounts[i] ?? 0) < mins[i].min) amounts[i] = Math.ceil(mins[i].min);
  }

  let unfixedTotal = amounts.reduce((sum, amount) => sum + amount, 0);
  if (Math.abs(unfixedTotal - remainingTarget) > 0.5) {
    const delta = remainingTarget - unfixedTotal;
    for (let i = amounts.length - 1; i >= 0 && Math.abs(delta) > 0.5; i -= 1) {
      const proposed = (amounts[i] ?? 0) + delta;
      if (proposed >= mins[i].min - 0.01) {
        amounts[i] = Math.round(proposed);
        break;
      }
    }
    unfixedTotal = amounts.reduce((sum, amount) => sum + amount, 0);
  }

  if (Math.abs(fixedTotal + unfixedTotal - safeTarget) > 0.5) {
    return {
      rows,
      ok: false,
      error: `Could not auto-adjust installments to ${formatCurrency(safeTarget)} because of paid amounts.`,
    };
  }

  unfixedEntries.forEach(({ index }, position) => {
    next[index] = { ...next[index], amount: amounts[position] ?? 0 };
  });

  return { rows: next, ok: true };
}

export function generateAnnualInstallmentRowsFromCollectionPlan(params: {
  annualFee: number;
  collectionPlan: Pick<FeeCollectionPlan, "collection_months" | "due_day">;
  sessionStartYear: number;
  startOrder: number;
}): InstallmentPreview[] {
  const annual = params.annualFee;
  if (annual <= 0) return [];

  const dueDates = generateCollectionPlanDueDates(params.collectionPlan, params.sessionStartYear);
  const count = dueDates.length;
  if (!count) return [];

  const amounts = roundedInstallmentAmounts(annual, count);
  const rows: InstallmentPreview[] = [];

  for (let i = 0; i < count; i++) {
    const due_date = dueDates[i];
    const dueDateForLabel = parseDateString(due_date);
    rows.push({
      label: `Annual fee - ${monthName(dueDateForLabel)}`,
      component_type: "annual_fee",
      amount: amounts[i] ?? 0,
      due_date,
      sort_order: params.startOrder + i,
    });
  }

  return rows;
}

export function generateAnnualInstallmentRows(params: {
  annualFee: number;
  schedule: AnnualFeeScheduleType;
  installmentCount: number;
  firstDueDate: string;
  startOrder: number;
  customDueDates?: string[];
}): InstallmentPreview[] {
  const annual = params.annualFee;
  if (annual <= 0) return [];

  const count = resolveInstallmentCount(params.schedule, params.installmentCount);
  const monthsGap = monthsBetweenInstallments(params.schedule, count);

  const amounts = roundedInstallmentAmounts(annual, count);

  let due = parseDateString(params.firstDueDate);
  const rows: InstallmentPreview[] = [];
  let order = params.startOrder;

  for (let i = 0; i < count; i++) {
    const amount = amounts[i] ?? 0;
    const due_date = params.customDueDates?.[i] || toDateString(due);
    const dueDateForLabel = parseDateString(due_date);
    rows.push({
      label: `Annual fee - ${monthName(dueDateForLabel)}`,
      component_type: "annual_fee",
      amount,
      due_date,
      sort_order: order++,
    });
    if (!params.customDueDates?.[i]) due = addMonths(due, monthsGap);
    else due = addMonths(parseDateString(due_date), monthsGap);
  }
  return rows;
}

function templateInstallmentRows(
  templates: FeePolicyInstallmentTemplate[] | undefined,
  admissionDate: Date,
  paidAtAdmission: Set<FeeComponentType>,
  startOrder: number,
): InstallmentPreview[] {
  const sorted = [...(templates ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  let order = startOrder;
  return sorted
    .filter((t) => t.amount > 0 && (!t.component_type || !paidAtAdmission.has(t.component_type)))
    .map((t) => {
      let due = addMonths(admissionDate, t.due_months_after_admission);
      due = withDayOfMonth(due, t.due_day);
      return {
        label: t.label,
        component_type: t.component_type,
        amount: Number(t.amount),
        due_date: toDateString(due),
        sort_order: order++,
      };
    });
}

const DEFERRED_COMPONENTS: FeeComponentType[] = [
  "board_registration_fee",
  "board_examination_fee",
  "semester_fee",
];

/**
 * Future installments only — excludes everything paid at admission.
 * Annual fee is split into N installments; board/semester appear once if not paid at admission.
 */
export function buildFutureInstallmentSchedule(params: {
  fees: Record<FeeComponentType, number>;
  admissionLines: AdmissionPaymentLine[];
  templates?: FeePolicyInstallmentTemplate[];
  schedule: AnnualFeeScheduleType;
  installmentCount: number;
  firstInstallmentDate: string;
  startAfterMonths: number;
  admissionDate?: Date;
  customAnnualDueDates?: string[];
  collectionPlan?: Pick<FeeCollectionPlan, "collection_months" | "due_day"> | null;
  sessionStartYear?: number;
}): InstallmentPreview[] {
  const base = params.admissionDate ?? new Date();
  const paidAtAdmission = new Set(
    params.admissionLines.filter((l) => l.enabled && l.amount > 0).map((l) => l.component_type),
  );

  const rows: InstallmentPreview[] = [];
  let order = 0;

  // Policy templates (board etc.) — skip if already paid at admission
  const templateRows = templateInstallmentRows(params.templates, base, paidAtAdmission, order);
  rows.push(...templateRows);
  order += templateRows.length;

  const templateTypes = new Set(
    templateRows.map((r) => r.component_type).filter(Boolean) as FeeComponentType[],
  );

  // One-time deferred fees not paid at admission and not covered by templates
  for (const type of DEFERRED_COMPONENTS) {
    if (paidAtAdmission.has(type) || templateTypes.has(type)) continue;
    const amount = params.fees[type] ?? 0;
    if (amount <= 0) continue;
    const due = addMonths(base, type === "semester_fee" ? params.startAfterMonths : 0);
    rows.push({
      label: componentLabel(type),
      component_type: type,
      amount,
      due_date: toDateString(due),
      sort_order: order++,
    });
  }

  // Annual fee — split into installments (only if not fully paid at admission)
  if (!paidAtAdmission.has("annual_fee")) {
    if (params.collectionPlan && params.sessionStartYear) {
      const annualRows = generateAnnualInstallmentRowsFromCollectionPlan({
        annualFee: params.fees.annual_fee ?? 0,
        collectionPlan: params.collectionPlan,
        sessionStartYear: params.sessionStartYear,
        startOrder: order,
      });
      rows.push(...annualRows);
    } else {
      const annualRows = generateAnnualInstallmentRows({
        annualFee: params.fees.annual_fee ?? 0,
        schedule: params.schedule,
        installmentCount: params.installmentCount,
        firstDueDate: params.firstInstallmentDate,
        startOrder: order,
        customDueDates: params.customAnnualDueDates,
      });
      rows.push(...annualRows);
    }
  }

  return rows;
}

/** Full saved schedule = admission dues (today) + future installments */
export function buildSavedInstallmentSchedule(params: {
  admissionLines: AdmissionPaymentLine[];
  fees: Record<FeeComponentType, number>;
  templates?: FeePolicyInstallmentTemplate[];
  schedule: AnnualFeeScheduleType;
  installmentCount: number;
  firstInstallmentDate: string;
  startAfterMonths: number;
  admissionDate?: Date;
  scholarship?: { applies_to: FeeComponentType; discount: number; label: string } | null;
  futureInstallments?: InstallmentPreview[];
  collectionPlan?: Pick<FeeCollectionPlan, "collection_months" | "due_day"> | null;
  sessionStartYear?: number;
}): InstallmentPreview[] {
  const base = params.admissionDate ?? new Date();
  const due = toDateString(base);
  const admissionRows: InstallmentPreview[] = [];
  let order = 0;

  for (const line of params.admissionLines) {
    if (!line.enabled || line.amount <= 0) continue;
    let amount = line.amount;
    if (params.scholarship && line.component_type === params.scholarship.applies_to) {
      amount = Math.max(0, amount - scholarshipAmount(amount, params.scholarship.discount));
    }
    admissionRows.push({
      label: `${componentLabel(line.component_type)} (at admission)`,
      component_type: line.component_type,
      amount,
      due_date: due,
      sort_order: order++,
    });
  }

  const future = (
    params.futureInstallments ??
    buildFutureInstallmentSchedule({
      fees: params.fees,
      admissionLines: params.admissionLines,
      templates: params.templates,
      schedule: params.schedule,
      installmentCount: params.installmentCount,
      firstInstallmentDate: params.firstInstallmentDate,
      startAfterMonths: params.startAfterMonths,
      admissionDate: base,
      collectionPlan: params.collectionPlan,
      sessionStartYear: params.sessionStartYear,
    })
  ).map((r, i) => ({ ...r, sort_order: order + i }));

  const sessionYear = params.sessionStartYear;
  return [...admissionRows, ...future].map((row) => ({
    ...row,
    fee_cycle: 1,
    academic_year_start: sessionYear,
  }));
}

export type StudentFeeStructure = {
  plan: {
    id: string;
    policy_id: string | null;
    enrollment_type?: "regular" | "classes_only";
    fee_clearance_months?: number | null;
    classes_fee_total?: number | null;
    admission_fee: number;
    annual_fund: number;
    annual_fee: number;
    semester_fee: number;
    board_registration_fee: number;
    board_examination_fee: number;
    scholarship_discount: number;
    scholarship_label: string | null;
    pay_at_admission: number;
    annual_fee_schedule: AnnualFeeScheduleType;
    installment_count: number;
    start_after_months: number;
    collection_plan_id?: string | null;
    admission_payment_breakdown?: AdmissionPaymentLine[] | null;
    notes?: string | null;
  };
  installments: (InstallmentPreview & { paid_amount?: number; status?: string })[];
};

export async function fetchStudentFeeStructure(
  studentId: string,
): Promise<StudentFeeStructure | null> {
  const { data: plan, error: planErr } = await supabase
    .from("student_fee_plans")
    .select("*")
    .eq("student_id", studentId)
    .maybeSingle();
  if (planErr) throw planErr;
  if (!plan) return null;

  const { data: installments, error: instErr } = await supabase
    .from("student_fee_installments")
    .select("id, label, component_type, amount, due_date, sort_order, paid_amount, status")
    .eq("student_id", studentId)
    .order("sort_order");
  if (instErr) throw instErr;

  return {
    plan: {
      id: plan.id,
      policy_id: plan.policy_id,
      admission_fee: Number(plan.admission_fee ?? 0),
      annual_fund: Number(plan.annual_fund ?? 0),
      annual_fee: Number(plan.annual_fee ?? 0),
      semester_fee: Number(plan.semester_fee ?? 0),
      board_registration_fee: Number(plan.board_registration_fee ?? 0),
      board_examination_fee: Number(plan.board_examination_fee ?? 0),
      scholarship_discount: Number(plan.scholarship_discount ?? 0),
      scholarship_label: plan.scholarship_label,
      pay_at_admission: Number(plan.pay_at_admission ?? 0),
      annual_fee_schedule: (plan.annual_fee_schedule as AnnualFeeScheduleType) ?? "quarterly",
      installment_count: Number(plan.installment_count ?? 4),
      start_after_months: Number(plan.start_after_months ?? 2),
      collection_plan_id: (plan as { collection_plan_id?: string | null }).collection_plan_id ?? null,
      admission_payment_breakdown: (
        plan as { admission_payment_breakdown?: AdmissionPaymentLine[] | null }
      ).admission_payment_breakdown,
      notes: plan.notes,
      enrollment_type: plan.enrollment_type,
      fee_clearance_months: plan.fee_clearance_months,
      classes_fee_total: plan.classes_fee_total,
    },
    installments: (installments ?? []).map((i) => ({
      id: i.id,
      label: i.label,
      component_type: i.component_type as FeeComponentType | null,
      amount: Number(i.amount ?? 0),
      due_date: i.due_date,
      sort_order: Number(i.sort_order ?? 0),
      paid_amount: Number(i.paid_amount ?? 0),
      status: i.status,
    })),
  };
}

/** @deprecated */
export function buildFullInstallmentSchedule(params: {
  admissionLines: AdmissionPaymentLine[];
  templates?: FeePolicyInstallmentTemplate[];
  annualFee: number;
  schedule: AnnualFeeScheduleType;
  installmentCount: number;
  firstInstallmentDate: string;
  admissionDate?: Date;
  scholarship?: { applies_to: FeeComponentType; discount: number; label: string } | null;
  skipAnnual?: boolean;
}): InstallmentPreview[] {
  const fees = Object.fromEntries(FEE_COMPONENTS.map((c) => [c.key, 0])) as Record<
    FeeComponentType,
    number
  >;
  fees.annual_fee = params.annualFee;
  return buildSavedInstallmentSchedule({
    admissionLines: params.admissionLines,
    fees,
    templates: params.templates,
    schedule: params.schedule,
    installmentCount: params.installmentCount,
    firstInstallmentDate: params.firstInstallmentDate,
    admissionDate: params.admissionDate,
    scholarship: params.scholarship,
    startAfterMonths: 0,
  });
}

export function defaultFirstInstallmentDate(admissionDate: Date, startAfterMonths: number): string {
  return toDateString(addMonths(admissionDate, startAfterMonths));
}

export async function fetchFeePolicy(
  programId: string,
  sessionId: string,
): Promise<FeePolicy | null> {
  if (!programId || !sessionId) return null;

  const { data, error } = await supabase
    .from("admission_fee_policies")
    .select(
      "*, programs(name, type, duration_years), academic_sessions(label), fee_policy_components(*), fee_scholarship_slabs(*), fee_policy_installment_templates(*)",
    )
    .eq("program_id", programId)
    .eq("academic_session_id", sessionId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    // Fallback if optional relation/table missing (migration not run)
    if (error.message.includes("fee_policy_installment_templates")) {
      const { data: basic, error: err2 } = await supabase
        .from("admission_fee_policies")
        .select(
          "*, programs(name, type, duration_years), academic_sessions(label), fee_policy_components(*), fee_scholarship_slabs(*)",
        )
        .eq("program_id", programId)
        .eq("academic_session_id", sessionId)
        .eq("is_active", true)
        .maybeSingle();
      if (err2) throw err2;
      return basic as FeePolicy | null;
    }
    throw error;
  }
  if (!data) return null;

  const policy = data as FeePolicy;
  policy.fee_policy_installment_templates?.sort((a, b) => a.sort_order - b.sort_order);
  return policy;
}

export async function saveStudentFeePlan(
  studentId: string,
  plan: {
    policy_id: string | null;
    enrollment_type?: "regular" | "classes_only";
    fee_clearance_months?: number | null;
    classes_fee_total?: number | null;
    admission_fee: number;
    annual_fund: number;
    annual_fee: number;
    semester_fee: number;
    board_registration_fee: number;
    board_examination_fee: number;
    scholarship_discount: number;
    scholarship_label: string | null;
    pay_at_admission: number;
    annual_fee_schedule: AnnualFeeScheduleType;
    installment_count: number;
    start_after_months: number;
    collection_plan_id?: string | null;
    admission_payment_breakdown?: AdmissionPaymentLine[] | null;
    notes?: string | null;
  },
  installments: InstallmentPreview[],
  projections: FutureFeeProjection[] = [],
) {
  const breakdown = plan.admission_payment_breakdown?.map((l) => ({
    component_type: l.component_type,
    enabled: l.enabled,
    amount: l.amount,
    policy_amount: l.policy_amount,
  }));

  const insertPlan: Record<string, unknown> = {
    student_id: studentId,
    policy_id: plan.policy_id,
    enrollment_type: plan.enrollment_type ?? "regular",
    fee_clearance_months: plan.fee_clearance_months ?? null,
    classes_fee_total: plan.classes_fee_total ?? null,
    admission_fee: plan.admission_fee,
    annual_fund: plan.annual_fund,
    annual_fee: plan.annual_fee,
    semester_fee: plan.semester_fee,
    board_registration_fee: plan.board_registration_fee,
    board_examination_fee: plan.board_examination_fee,
    scholarship_discount: plan.scholarship_discount,
    scholarship_label: plan.scholarship_label,
    pay_at_admission: plan.pay_at_admission,
    annual_fee_schedule: plan.annual_fee_schedule,
    installment_count: plan.installment_count,
    start_after_months: plan.start_after_months,
    collection_plan_id: plan.collection_plan_id ?? null,
    notes: plan.notes ?? null,
  };
  if (breakdown?.length) insertPlan.admission_payment_breakdown = breakdown;

  const { data: feePlan, error: planErr } = await supabase
    .from("student_fee_plans")
    .insert(insertPlan as never)
    .select()
    .single();
  if (planErr) {
    if (
      planErr.message.includes("schema cache") ||
      planErr.message.includes("column") ||
      planErr.message.includes("admission_payment_breakdown") ||
      planErr.message.includes("board_registration_fee") ||
      planErr.message.includes("board_examination_fee")
    ) {
      throw new Error(
        "Student fee plan schema is missing new admission fee columns. Run supabase/patch-admission-fee-plan-columns.sql in Supabase, then retry admission.",
      );
    }
    throw planErr;
  }

  if (installments.length) {
    const { error: instErr } = await supabase.from("student_fee_installments").insert(
      installments.map((i) => ({
        student_id: studentId,
        fee_plan_id: feePlan.id,
        label: i.label,
        component_type: i.component_type,
        amount: i.amount,
        due_date: i.due_date,
        sort_order: i.sort_order,
        status: "pending",
        fee_cycle: i.fee_cycle ?? 1,
        academic_year_start: i.academic_year_start ?? null,
      })),
    );
    if (instErr) throw instErr;
  }

  if (projections.length) {
    const { error: projErr } = await supabase.from("student_fee_projections").insert(
      projections.map((p) => ({
        student_id: studentId,
        fee_plan_id: feePlan.id,
        cycle_no: p.cycle_no,
        cycle_label: p.cycle_label,
        component_type: p.component_type,
        policy_amount: p.policy_amount,
        scholarship_discount: p.scholarship_discount,
        payable_amount: p.payable_amount,
        due_date: p.due_date,
        notes: p.notes ?? null,
      })),
    );
    if (projErr) throw projErr;
  }

  return feePlan;
}

export async function updateStudentFeePlan(
  studentId: string,
  plan: {
    policy_id: string | null;
    admission_fee: number;
    annual_fund: number;
    annual_fee: number;
    semester_fee: number;
    board_registration_fee: number;
    board_examination_fee: number;
    scholarship_discount: number;
    scholarship_label: string | null;
    pay_at_admission: number;
    annual_fee_schedule: AnnualFeeScheduleType;
    installment_count: number;
    start_after_months: number;
    collection_plan_id?: string | null;
    admission_payment_breakdown?: AdmissionPaymentLine[] | null;
    notes?: string | null;
  },
  installments: InstallmentPreview[],
) {
  const breakdown = plan.admission_payment_breakdown?.map((l) => ({
    component_type: l.component_type,
    enabled: l.enabled,
    amount: l.amount,
    policy_amount: l.policy_amount,
  }));

  const planPayload: Record<string, unknown> = {
    student_id: studentId,
    policy_id: plan.policy_id,
    admission_fee: plan.admission_fee,
    annual_fund: plan.annual_fund,
    annual_fee: plan.annual_fee,
    semester_fee: plan.semester_fee,
    board_registration_fee: plan.board_registration_fee,
    board_examination_fee: plan.board_examination_fee,
    scholarship_discount: plan.scholarship_discount,
    scholarship_label: plan.scholarship_label,
    pay_at_admission: plan.pay_at_admission,
    annual_fee_schedule: plan.annual_fee_schedule,
    installment_count: plan.installment_count,
    start_after_months: plan.start_after_months,
    collection_plan_id: plan.collection_plan_id ?? null,
    notes: plan.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  if (breakdown?.length) planPayload.admission_payment_breakdown = breakdown;

  const { data: feePlan, error: planErr } = await supabase
    .from("student_fee_plans")
    .upsert(planPayload as never, { onConflict: "student_id" })
    .select()
    .single();
  if (planErr) {
    if (
      planErr.message.includes("schema cache") ||
      planErr.message.includes("column") ||
      planErr.message.includes("admission_payment_breakdown") ||
      planErr.message.includes("board_registration_fee") ||
      planErr.message.includes("board_examination_fee")
    ) {
      throw new Error(
        "Student fee plan schema is missing new admission fee columns. Run supabase/patch-admission-fee-plan-columns.sql in Supabase, then retry.",
      );
    }
    throw planErr;
  }

  const { data: existing, error: existingErr } = await supabase
    .from("student_fee_installments")
    .select("id, label, component_type, paid_amount")
    .eq("student_id", studentId);
  if (existingErr) throw existingErr;

  const existingRows = existing ?? [];
  const usedIds = new Set<string>();

  for (const row of installments) {
    const match = row.id
      ? existingRows.find((e) => e.id === row.id)
      : existingRows.find(
          (e) =>
            !usedIds.has(e.id) && e.component_type === row.component_type && e.label === row.label,
        );

    if (match) {
      usedIds.add(match.id);
      const paid = Number(match.paid_amount ?? 0);
      const { error } = await supabase
        .from("student_fee_installments")
        .update({
          fee_plan_id: feePlan.id,
          label: row.label,
          component_type: row.component_type,
          amount: row.amount,
          due_date: row.due_date,
          sort_order: row.sort_order,
          status: installmentStatusForAmount(row.amount, paid),
        })
        .eq("id", match.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("student_fee_installments").insert({
        student_id: studentId,
        fee_plan_id: feePlan.id,
        label: row.label,
        component_type: row.component_type,
        amount: row.amount,
        due_date: row.due_date,
        sort_order: row.sort_order,
        status: "pending",
      });
      if (error) throw error;
    }
  }

  const desiredIds = new Set([...usedIds]);
  for (const row of existingRows) {
    if (desiredIds.has(row.id)) continue;
    if (Number(row.paid_amount ?? 0) > 0) continue;
    const { error } = await supabase.from("student_fee_installments").delete().eq("id", row.id);
    if (error) throw error;
  }

  return feePlan;
}

export function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function policyAutoName(programName: string, sessionLabel: string): string {
  return `${programName} — ${sessionLabel}`;
}
