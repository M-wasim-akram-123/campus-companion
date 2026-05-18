import { supabase } from "@/integrations/supabase/client";
import type {
  AdmissionPaymentLine,
  AnnualFeeScheduleType,
  FeeComponentType,
  FeePolicy,
  FeePolicyComponent,
  FeePolicyInstallmentTemplate,
  InstallmentPreview,
  ScholarshipSlab,
} from "@/lib/fees-types";
import { FEE_COMPONENTS } from "@/lib/fees-types";

export { FEE_COMPONENTS };

export function matricPercentage(obtained: number | null, total: number | null): number | null {
  if (obtained == null || total == null || total <= 0) return null;
  return (obtained / total) * 100;
}

export function componentMap(components: FeePolicyComponent[] | undefined): Record<FeeComponentType, number> {
  const map = Object.fromEntries(FEE_COMPONENTS.map((c) => [c.key, 0])) as Record<FeeComponentType, number>;
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
  const defaults =
    defaultComponents?.length ?
      defaultComponents
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
  return d.toISOString().slice(0, 10);
}

function withDayOfMonth(base: Date, day: number | null): Date {
  if (!day || day < 1) return base;
  const d = new Date(base);
  d.setDate(Math.min(day, 28));
  return d;
}

/** How many annual-fee installments to generate (respects user input) */
export function resolveInstallmentCount(schedule: AnnualFeeScheduleType, userCount: number): number {
  const n = Math.max(1, Math.floor(userCount) || 1);
  if (schedule === "monthly") return n;
  if (schedule === "quarterly") return n;
  return n;
}

export function monthsBetweenInstallments(schedule: AnnualFeeScheduleType, count: number): number {
  if (schedule === "monthly") return 1;
  if (schedule === "quarterly") return 3;
  if (schedule === "biannual") return 6;
  if (schedule === "spread") return Math.max(1, Math.floor(12 / Math.max(count, 1)));
  return Math.max(1, Math.floor(12 / Math.max(count, 1)));
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

  const each = Math.round((annual / count) * 100) / 100;
  const remainder = Math.round((annual - each * (count - 1)) * 100) / 100;

  let due = parseDateString(params.firstDueDate);
  const rows: InstallmentPreview[] = [];
  let order = params.startOrder;

  for (let i = 0; i < count; i++) {
    const amount = i === count - 1 ? remainder : each;
    const due_date = params.customDueDates?.[i] || toDateString(due);
    rows.push({
      label: `Annual fee ${i + 1} of ${count}`,
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

const DEFERRED_COMPONENTS: FeeComponentType[] = ["board_admission_fee", "semester_fee"];

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
}): InstallmentPreview[] {
  const base = params.admissionDate ?? new Date();
  const paidAtAdmission = new Set(
    params.admissionLines.filter((l) => l.enabled && l.amount > 0).map((l) => l.component_type),
  );

  const rows: InstallmentPreview[] = [];
  let order = 0;

  // Policy templates (board etc.) — skip if already paid at admission
  const templateRows = templateInstallmentRows(
    params.templates,
    base,
    paidAtAdmission,
    order,
  );
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
    })
  ).map((r, i) => ({ ...r, sort_order: order + i }));

  return [...admissionRows, ...future];
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
  const fees = Object.fromEntries(FEE_COMPONENTS.map((c) => [c.key, 0])) as Record<FeeComponentType, number>;
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

export async function fetchFeePolicy(programId: string, sessionId: string): Promise<FeePolicy | null> {
  if (!programId || !sessionId) return null;

  const { data, error } = await supabase
    .from("admission_fee_policies")
    .select(
      "*, programs(name, type), academic_sessions(label), fee_policy_components(*), fee_scholarship_slabs(*), fee_policy_installment_templates(*)",
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
        .select("*, programs(name, type), academic_sessions(label), fee_policy_components(*), fee_scholarship_slabs(*)")
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
    admission_fee: number;
    annual_fund: number;
    annual_fee: number;
    semester_fee: number;
    board_admission_fee: number;
    scholarship_discount: number;
    scholarship_label: string | null;
    pay_at_admission: number;
    annual_fee_schedule: AnnualFeeScheduleType;
    installment_count: number;
    start_after_months: number;
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

  const insertPlan: Record<string, unknown> = {
    student_id: studentId,
    policy_id: plan.policy_id,
    admission_fee: plan.admission_fee,
    annual_fund: plan.annual_fund,
    annual_fee: plan.annual_fee,
    semester_fee: plan.semester_fee,
    board_admission_fee: plan.board_admission_fee,
    scholarship_discount: plan.scholarship_discount,
    scholarship_label: plan.scholarship_label,
    pay_at_admission: plan.pay_at_admission,
    annual_fee_schedule: plan.annual_fee_schedule,
    installment_count: plan.installment_count,
    start_after_months: plan.start_after_months,
    notes: plan.notes ?? null,
  };
  if (breakdown?.length) insertPlan.admission_payment_breakdown = breakdown;

  const { data: feePlan, error: planErr } = await supabase
    .from("student_fee_plans")
    .insert(insertPlan)
    .select()
    .single();
  if (planErr) throw planErr;

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
      })),
    );
    if (instErr) throw instErr;
  }

  return feePlan;
}

export function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(n);
}

export function policyAutoName(programName: string, sessionLabel: string): string {
  return `${programName} — ${sessionLabel}`;
}
