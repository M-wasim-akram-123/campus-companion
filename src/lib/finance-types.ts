export type VoucherStatus = "draft" | "issued" | "partial" | "paid" | "cancelled";
export type PaymentMethod = "cash" | "bank" | "online" | "other";
export type VoucherSource = "manual" | "installment";
export type FinanceLedgerEntryType =
  | "fee_charge"
  | "fine"
  | "late_fee"
  | "payment"
  | "waiver"
  | "adjustment"
  | "reversal"
  | "bad_debt";
export type CashierSessionStatus = "open" | "closed" | "cancelled";

export type FeeInstallment = {
  id: string;
  student_id: string;
  fee_plan_id: string;
  label: string;
  component_type: string | null;
  amount: number;
  paid_amount: number;
  due_date: string;
  status: string;
  sort_order: number;
  fee_cycle?: number;
  academic_year_start?: number | null;
};

export type FeeVoucher = {
  id: string;
  voucher_number: string;
  student_id: string;
  status: VoucherStatus;
  source: VoucherSource;
  total_amount: number;
  paid_amount: number;
  due_date: string;
  issued_at: string;
  notes: string | null;
  qr_token: string;
  fee_voucher_lines?: FeeVoucherLine[];
  students?: { full_name?: string; roll_number?: string };
};

export type FeeVoucherLine = {
  id: string;
  voucher_id: string;
  installment_id: string | null;
  label: string;
  amount: number;
  sort_order: number;
};

export type FeePayment = {
  id: string;
  receipt_number: string;
  student_id: string;
  voucher_id: string | null;
  cashier_session_id?: string | null;
  amount: number;
  payment_method: PaymentMethod;
  paid_at: string;
  notes: string | null;
};

export type StudentFinanceLedgerEntry = {
  id: string;
  student_id: string;
  installment_id: string | null;
  voucher_id: string | null;
  payment_id: string | null;
  entry_type: FinanceLedgerEntryType;
  component_type: string | null;
  label: string;
  debit: number;
  credit: number;
  effective_date: string;
  status: string;
  notes: string | null;
  created_at: string;
};

export type CashierSession = {
  id: string;
  cashier_id: string;
  status: CashierSessionStatus;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  expected_cash: number;
  counted_cash: number | null;
  variance: number | null;
  notes: string | null;
  closed_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  signoff_notes?: string | null;
};

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank transfer" },
  { value: "online", label: "Online" },
  { value: "other", label: "Other" },
];

export type VoucherQrPayload = {
  v: 1;
  voucher_number: string;
  qr_token: string;
  student_roll: string;
  amount: number;
  due_date: string;
};
