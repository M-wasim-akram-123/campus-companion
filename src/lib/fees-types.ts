export const FEE_COMPONENTS = [
  { key: "admission_fee", label: "Admission fee" },
  { key: "annual_fund", label: "Annual fund" },
  { key: "annual_fee", label: "Annual fee" },
  { key: "semester_fee", label: "Semester fee" },
  { key: "board_admission_fee", label: "Board admission fee" },
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

/** Pick one — how many times annual fee is split */
export const INSTALLMENT_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12] as const;

/** Pick one — gap between installment due dates */
export const INSTALLMENT_SPACING_OPTIONS = [
  { value: "monthly" as const, label: "Every 1 month" },
  { value: "quarterly" as const, label: "Every 3 months" },
  { value: "biannual" as const, label: "Every 6 months" },
  { value: "spread" as const, label: "Evenly over 12 months" },
] as const;

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
  fee_policy_components?: FeePolicyComponent[];
  fee_scholarship_slabs?: ScholarshipSlab[];
  fee_policy_installment_templates?: FeePolicyInstallmentTemplate[];
  programs?: { name?: string; type?: string };
  academic_sessions?: { label?: string };
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
  fees: Record<FeeComponentType, number>;
  scholarshipDiscount: number;
  scholarshipLabel: string | null;
  payAtAdmission: number;
  admissionPayments: AdmissionPaymentLine[];
  schedule: AnnualFeeScheduleType;
  installmentCount: number;
  startAfterMonths: number;
  firstInstallmentDate: string;
  policyId: string | null;
  installments: InstallmentPreview[];
};
