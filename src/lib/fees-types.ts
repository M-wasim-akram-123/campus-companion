export const FEE_COMPONENTS = [
  { key: "admission_fee", label: "Admission fee" },
  { key: "annual_fund", label: "Annual fund" },
  { key: "annual_fee", label: "Annual fee" },
  { key: "semester_fee", label: "Semester fee" },
  { key: "board_registration_fee", label: "Board Registration Fees" },
  { key: "board_examination_fee", label: "Board Examination Fees" },
] as const;

export const INTERMEDIATE_TRACK_HINTS = [
  "FSc Pre-Engineering",
  "FSc Pre-Medical",
  "ICS",
  "FA (IT)",
  "FA IT (ICON)",
  "ICOM",
  "FA (Arts)",
] as const;

export type FeeComponentType = (typeof FEE_COMPONENTS)[number]["key"];

export type AnnualFeeScheduleType = "monthly" | "quarterly" | "biannual" | "spread" | "custom";
export type ProjectionCycleType = "annual" | "semester";
export type FeeIncrementType = "none" | "percentage" | "fixed";
export type AnnualFundFrequency = "admission_only" | "every_cycle";

/** Pick one — how many times annual fee is split */
export const INSTALLMENT_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Gap between installment due dates. This repeats between each installment. */
export const INSTALLMENT_SPACING_OPTIONS = [
  { value: "monthly" as const, label: "Monthly (1 month gap)" },
  { value: "quarterly" as const, label: "Quarterly (3 month gap)" },
  { value: "biannual" as const, label: "Twice a year (6 month gap)" },
  { value: "spread" as const, label: "Auto spread within 12 months" },
] as const;

export function installmentSpacingOptionsForCount(count: number) {
  if (count >= 8) return INSTALLMENT_SPACING_OPTIONS.filter((o) => o.value === "monthly" || o.value === "spread");
  if (count >= 5) return INSTALLMENT_SPACING_OPTIONS.filter((o) => o.value !== "biannual");
  return INSTALLMENT_SPACING_OPTIONS;
}

export function scheduleForInstallmentCount(_count: number): AnnualFeeScheduleType {
  return "monthly";
}

export function installmentGapMonthsForCount(count: number): number {
  if (count <= 1) return 0;
  return 1;
}

export function installmentPlanLabel(count: number) {
  if (count <= 1) return "One annual fee payment";
  return `${count} monthly installments`;
}

export function monthNameForOffset(offset: number, from = new Date()) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export type FeePolicyComponent = {
  component_type: FeeComponentType;
  amount: number;
};

export type ScholarshipSlab = {
  id?: string;
  min_percentage: number;
  max_percentage: number | null;
  discount_percent: number;
  applies_to: FeeComponentType;
  label: string | null;
  sort_order: number;
};

export type FeePolicyInstallmentTemplate = {
  id?: string;
  label: string;
  component_type: FeeComponentType | null;
  amount: number;
  due_months_after_admission: number;
  due_day: number | null;
  sort_order: number;
};

export type FeePolicy = {
  id: string;
  program_id: string;
  academic_session_id: string | null;
  name: string;
  is_active: boolean;
  default_schedule?: AnnualFeeScheduleType;
  default_installment_count?: number;
  default_start_after_months?: number;
  default_admission_components?: FeeComponentType[];
  projection_cycle_type?: ProjectionCycleType;
  projection_cycle_count?: number;
  increment_type?: FeeIncrementType;
  increment_value?: number;
  annual_fund_frequency?: AnnualFundFrequency;
  fee_policy_components?: FeePolicyComponent[];
  fee_scholarship_slabs?: ScholarshipSlab[];
  fee_policy_installment_templates?: FeePolicyInstallmentTemplate[];
  programs?: { name?: string; type?: string; duration_years?: number };
  academic_sessions?: { label?: string };
};

export type FutureFeeProjection = {
  cycle_no: number;
  cycle_label: string;
  component_type: FeeComponentType;
  policy_amount: number;
  scholarship_discount: number;
  payable_amount: number;
  increment_amount?: number;
  increment_label?: string | null;
  due_date: string | null;
  notes?: string | null;
};

export type InstallmentPreview = {
  id?: string;
  label: string;
  component_type: FeeComponentType | null;
  amount: number;
  due_date: string;
  sort_order: number;
};

export type AdmissionPaymentLine = {
  component_type: FeeComponentType;
  enabled: boolean;
  amount: number;
  policy_amount: number;
};

export type FeeStructurePayload = {
  enrollmentType: "regular" | "classes_only";
  feeClearanceMonths: 2 | 3 | null;
  classesFeeTotal: number;
  fees: Record<FeeComponentType, number>;
  scholarshipDiscount: number;
  scholarshipLabel: string | null;
  payAtAdmission: number;
  receivedAtAdmission: number;
  receiptNumber: string;
  paymentMethod: "cash" | "bank" | "online" | "other";
  paymentNotes: string | null;
  admissionPayments: AdmissionPaymentLine[];
  schedule: AnnualFeeScheduleType;
  installmentCount: number;
  startAfterMonths: number;
  firstInstallmentDate: string;
  policyId: string | null;
  installments: InstallmentPreview[];
  projections: FutureFeeProjection[];
  isValid: boolean;
  validationError: string | null;
};
