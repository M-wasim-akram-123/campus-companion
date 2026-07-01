import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/fees";
import type {
  CashierSession,
  FeeInstallment,
  FinanceLedgerEntryType,
  FeeVoucher,
  PaymentMethod,
  StudentFinanceLedgerEntry,
  VoucherQrPayload,
  VoucherSource,
} from "@/lib/finance-types";

export { formatCurrency };

export function installmentBalance(inst: { amount: number; paid_amount: number }): number {
  return Math.max(0, Number(inst.amount) - Number(inst.paid_amount));
}

/** Apply a payment starting at one installment; surplus rolls forward to later installments. */
export function allocatePaymentAcrossInstallments(
  installments: Pick<FeeInstallment, "id" | "amount" | "paid_amount" | "sort_order" | "label">[],
  startInstallmentId: string,
  totalAmount: number,
): { installmentId: string; amount: number; label: string }[] {
  if (totalAmount <= 0) return [];

  const ordered = [...installments].sort((a, b) => a.sort_order - b.sort_order);
  const startIndex = ordered.findIndex((row) => row.id === startInstallmentId);
  if (startIndex < 0) throw new Error("Installment not found.");

  let remaining = totalAmount;
  const allocations: { installmentId: string; amount: number; label: string }[] = [];

  for (let i = startIndex; i < ordered.length && remaining > 0.001; i += 1) {
    const balance = installmentBalance(ordered[i]);
    if (balance <= 0) continue;
    const applied = Math.min(balance, remaining);
    allocations.push({
      installmentId: ordered[i].id,
      amount: applied,
      label: ordered[i].label,
    });
    remaining -= applied;
  }

  if (remaining > 0.01) {
    throw new Error(
      `Payment exceeds total outstanding balance by ${formatCurrency(remaining)}.`,
    );
  }

  return allocations;
}

export function computeInstallmentStatus(amount: number, paid: number): string {
  if (paid <= 0) return "pending";
  if (paid >= amount) return "paid";
  return "partial";
}

export function computeVoucherStatus(total: number, paid: number): FeeVoucher["status"] {
  if (paid <= 0) return "issued";
  if (paid >= total) return "paid";
  return "partial";
}

async function nextNumber(key: "receipt" | "voucher"): Promise<string> {
  const { data, error } = await supabase.rpc("next_finance_number", { p_key: key });
  if (error) throw error;
  return data as string;
}

async function createFeeVoucherRpc(params: {
  studentId: string;
  dueDate: string;
  notes?: string;
  source?: VoucherSource;
  lines: { installmentId?: string; label: string; amount: number }[];
}) {
  const { data: voucherId, error } = await supabase.rpc("create_fee_voucher", {
    p_student_id: params.studentId,
    p_due_date: params.dueDate,
    p_notes: params.notes ?? null,
    p_source: params.source ?? "manual",
    p_lines: params.lines.map((line) => ({
      installmentId: line.installmentId ?? null,
      label: line.label,
      amount: line.amount,
    })),
  });
  if (error) {
    if (error.message.includes("Could not find the function public.create_fee_voucher")) {
      throw new Error(
        "Voucher creation is not set up in the database. Run supabase/patch-finance-hardening.sql in Supabase SQL Editor.",
      );
    }
    throw new Error(error.message);
  }
  return fetchVoucherById(voucherId as string);
}

export function buildVoucherQrPayload(v: {
  voucher_number: string;
  qr_token: string;
  total_amount: number;
  paid_amount: number;
  due_date: string;
  student?: { roll_number?: string };
}): VoucherQrPayload {
  return {
    v: 1,
    voucher_number: v.voucher_number,
    qr_token: v.qr_token,
    student_roll: v.student?.roll_number ?? "",
    amount: Math.max(0, Number(v.total_amount) - Number(v.paid_amount)),
    due_date: v.due_date,
  };
}

export function buildVoucherVerifyUrl(qrToken: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/finance/vouchers/lookup?token=${encodeURIComponent(qrToken)}`;
  }
  return `/finance/vouchers/lookup?token=${encodeURIComponent(qrToken)}`;
}

export async function generateVoucherQrDataUrl(
  payload: VoucherQrPayload | string,
): Promise<string> {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return QRCode.toDataURL(text, { width: 200, margin: 2, errorCorrectionLevel: "M" });
}

export async function fetchStudentInstallments(studentId: string): Promise<FeeInstallment[]> {
  const { data, error } = await supabase
    .from("student_fee_installments")
    .select("*")
    .eq("student_id", studentId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as FeeInstallment[];
}

export async function fetchVoucherByToken(qrToken: string) {
  const { data, error } = await supabase
    .from("fee_vouchers")
    .select("*, fee_voucher_lines(*), students(full_name, roll_number, programs(name))")
    .eq("qr_token", qrToken)
    .maybeSingle();
  if (error) throw error;
  return data as FeeVoucher | null;
}

export async function fetchVoucherById(id: string) {
  const { data, error } = await supabase
    .from("fee_vouchers")
    .select("*, fee_voucher_lines(*), students(full_name, roll_number, programs(name))")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as FeeVoucher;
}

export async function getOpenVoucherForInstallment(
  installmentId: string,
): Promise<FeeVoucher | null> {
  const { data, error } = await supabase
    .from("fee_voucher_lines")
    .select("fee_vouchers(*)")
    .eq("installment_id", installmentId);
  if (error) throw error;
  for (const row of data ?? []) {
    const v = (row as { fee_vouchers: FeeVoucher | null }).fee_vouchers;
    if (v && (v.status === "issued" || v.status === "partial")) return v;
  }
  return null;
}

export async function getOpenVoucherForStudent(studentId: string): Promise<FeeVoucher | null> {
  const { data, error } = await supabase
    .from("fee_vouchers")
    .select("*")
    .eq("student_id", studentId)
    .in("status", ["issued", "partial"])
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as FeeVoucher | null;
}

export async function createVoucherFromInstallment(installmentId: string, notes?: string) {
  const existing = await getOpenVoucherForInstallment(installmentId);
  if (existing) return fetchVoucherById(existing.id);

  const { data: inst, error: iErr } = await supabase
    .from("student_fee_installments")
    .select("*")
    .eq("id", installmentId)
    .single();
  if (iErr) throw iErr;

  const balance = installmentBalance(inst);
  if (balance <= 0) throw new Error("This installment is already fully paid.");

  return createFeeVoucherRpc({
    studentId: inst.student_id,
    dueDate: inst.due_date,
    notes,
    source: "installment",
    lines: [{ installmentId, label: inst.label, amount: balance }],
  });
}

export async function createVoucherFromInstallmentWithLateFee(params: {
  installmentId: string;
  lateFeeAmount?: number;
  lateFeeLabel?: string;
  notes?: string;
}) {
  const existing = await getOpenVoucherForInstallment(params.installmentId);
  if (existing) return fetchVoucherById(existing.id);

  const { data: inst, error: iErr } = await supabase
    .from("student_fee_installments")
    .select("*")
    .eq("id", params.installmentId)
    .single();
  if (iErr) throw iErr;

  const balance = installmentBalance(inst);
  if (balance <= 0) throw new Error("This installment is already fully paid.");

  const lateFeeAmount = Math.max(0, Number(params.lateFeeAmount ?? 0));
  const lateFeeInstallmentId =
    lateFeeAmount > 0
      ? await addStudentFinanceCharge({
          studentId: inst.student_id,
          entryType: "late_fee",
          label: params.lateFeeLabel?.trim() || `Late fee - ${inst.label}`,
          amount: lateFeeAmount,
          effectiveDate: new Date().toISOString().slice(0, 10),
          notes: params.notes,
        })
      : null;
  const lines = [
    {
      installmentId: params.installmentId,
      label: inst.label,
      amount: balance,
    },
  ];
  if (lateFeeInstallmentId && lateFeeAmount > 0) {
    lines.push({
      installmentId: lateFeeInstallmentId,
      label: params.lateFeeLabel?.trim() || `Late fee - ${inst.label}`,
      amount: lateFeeAmount,
    });
  }

  return createFeeVoucherRpc({
    studentId: inst.student_id,
    dueDate: inst.due_date,
    notes: params.notes,
    source: "installment",
    lines,
  });
}

export async function createManualVoucher(params: {
  studentId: string;
  dueDate: string;
  notes?: string;
  lines: {
    label: string;
    amount: number;
    installmentId?: string;
    entryType?: Extract<FinanceLedgerEntryType, "fine" | "late_fee" | "adjustment">;
  }[];
}) {
  if (!params.dueDate) throw new Error("Voucher due date is required.");
  const total = params.lines.reduce((s, l) => s + l.amount, 0);
  if (total <= 0) throw new Error("Voucher total must be greater than zero.");
  const today = new Date().toISOString().slice(0, 10);

  const linesWithInstallments = [];
  for (const line of params.lines) {
    let installmentId = line.installmentId;
    if (installmentId) {
      const open = await getOpenVoucherForInstallment(installmentId);
      if (open) throw new Error(`${line.label} already has an open voucher.`);
    } else {
      if (line.entryType === "late_fee" && params.dueDate >= today) {
        throw new Error("Late fee can only be added after the voucher due date has passed.");
      }
      installmentId = await addStudentFinanceCharge({
        studentId: params.studentId,
        entryType: line.entryType ?? "adjustment",
        label: line.label,
        amount: line.amount,
        effectiveDate: params.dueDate,
        notes: params.notes,
      });
    }
    linesWithInstallments.push({ ...line, installmentId });
  }

  return createFeeVoucherRpc({
    studentId: params.studentId,
    dueDate: params.dueDate,
    notes: params.notes,
    source: "manual",
    lines: linesWithInstallments.map((line) => ({
      installmentId: line.installmentId,
      label: line.label,
      amount: line.amount,
    })),
  });
}

/** Auto-issue vouchers for all installments with balance */
export async function autoIssueVouchersForStudent(studentId: string) {
  const installments = await fetchStudentInstallments(studentId);
  const created: FeeVoucher[] = [];
  for (const inst of installments) {
    if (installmentBalance(inst) <= 0) continue;
    const v = await createVoucherFromInstallment(inst.id);
    created.push(v);
  }
  return created;
}

export type BulkVoucherMode = "next_due" | "all_unpaid" | "overdue_only";
export type BulkVoucherPaidFilter =
  | "all"
  | "unpaid_only"
  | "under_20"
  | "under_50"
  | "partial_only";

export type BulkVoucherResult = {
  created: FeeVoucher[];
  skipped: number;
  errors: { studentId: string; message: string }[];
};

export type VoucherPaidFilter = "all" | "unpaid_only" | "partial_only" | "under_20" | "under_50";

export type VoucherGeneratorParams = {
  sessionId: string;
  voucherDueDate: string;
  sectionId?: string;
  feeHeads: string[];
  installmentMonth?: string;
  paidFilter?: VoucherPaidFilter;
  overdueOnly?: boolean;
  excludeOpenVouchers?: boolean;
  lateFeeAmount?: number;
  lateFeeLabel?: string;
};

export type VoucherPreviewRow = {
  studentId: string;
  studentName: string;
  rollNumber: string;
  sectionLabel: string;
  lines: {
    installmentId: string;
    label: string;
    amount: number;
    dueDate: string;
    componentType: string | null;
  }[];
  lateFeeAmount: number;
  total: number;
  skippedReason?: string;
};

export type VoucherGeneratorResult = {
  preview: VoucherPreviewRow[];
  created: FeeVoucher[];
  skipped: VoucherPreviewRow[];
  errors: { studentId: string; message: string }[];
};

function passesPaidFilter(installments: FeeInstallment[], paidFilter: VoucherPaidFilter = "all") {
  const total = installments.reduce((sum, inst) => sum + Number(inst.amount ?? 0), 0);
  const paid = installments.reduce((sum, inst) => sum + Number(inst.paid_amount ?? 0), 0);
  const paidPercent = total > 0 ? Math.round((paid / total) * 100) : 0;
  if (paidFilter === "unpaid_only") return paid <= 0;
  if (paidFilter === "partial_only") return paid > 0 && paidPercent < 100;
  if (paidFilter === "under_20") return paidPercent < 20;
  if (paidFilter === "under_50") return paidPercent < 50;
  return true;
}

function lateFeeAmountForVoucher(
  params: VoucherGeneratorParams,
  today = new Date().toISOString().slice(0, 10),
) {
  if (params.voucherDueDate >= today) return 0;
  return Math.max(0, Number(params.lateFeeAmount ?? 0));
}

async function fetchVoucherGeneratorStudents(
  params: Pick<VoucherGeneratorParams, "sessionId" | "sectionId">,
) {
  let query = supabase
    .from("students")
    .select("id, full_name, roll_number, section_id, sections(name, gender)")
    .eq("academic_session_id", params.sessionId)
    .eq("status", "active")
    .order("roll_number");
  if (params.sectionId) query = query.eq("section_id", params.sectionId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function previewBulkVouchers(
  params: VoucherGeneratorParams,
): Promise<VoucherPreviewRow[]> {
  if (!params.sessionId) throw new Error("Select a session.");
  if (!params.voucherDueDate) throw new Error("Voucher due date is required.");
  if (!params.feeHeads.length) throw new Error("Select at least one fee head.");

  const students = await fetchVoucherGeneratorStudents(params);
  const rows: VoucherPreviewRow[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const lateFeeAmount = lateFeeAmountForVoucher(params, today);
  const seenStudentIds = new Set<string>();

  for (const student of students) {
    if (seenStudentIds.has(student.id)) continue;
    seenStudentIds.add(student.id);

    const section = student.sections as { name?: string; gender?: string } | null;
    const sectionLabel = section
      ? `${section.gender === "girls" ? "Girls" : "Boys"} - ${section.name}`
      : "Unassigned";
    const baseRow = {
      studentId: student.id,
      studentName: student.full_name,
      rollNumber: student.roll_number,
      sectionLabel,
      lines: [],
      lateFeeAmount: 0,
      total: 0,
    } satisfies VoucherPreviewRow;

    const installments = await fetchStudentInstallments(student.id);
    if (!passesPaidFilter(installments, params.paidFilter)) {
      rows.push({ ...baseRow, skippedReason: "Skipped by paid percentage filter" });
      continue;
    }

    const selectedLines: VoucherPreviewRow["lines"] = [];
    for (const inst of installments) {
      const balance = installmentBalance(inst);
      if (balance <= 0) continue;
      if (!inst.component_type || !params.feeHeads.includes(inst.component_type)) continue;
      if (params.installmentMonth && !inst.due_date.startsWith(params.installmentMonth)) continue;
      if (params.overdueOnly && inst.due_date >= today) continue;
      if (params.excludeOpenVouchers !== false) {
        const open = await getOpenVoucherForInstallment(inst.id);
        if (open) continue;
      }
      selectedLines.push({
        installmentId: inst.id,
        label: inst.label,
        amount: balance,
        dueDate: inst.due_date,
        componentType: inst.component_type,
      });
    }

    const subtotal = selectedLines.reduce((sum, line) => sum + line.amount, 0);
    if (subtotal <= 0) {
      rows.push({ ...baseRow, skippedReason: "No unpaid selected fee heads" });
      continue;
    }

    rows.push({
      ...baseRow,
      lines: selectedLines,
      lateFeeAmount,
      total: subtotal + lateFeeAmount,
    });
  }

  return rows;
}

export async function generateBulkVouchers(
  params: VoucherGeneratorParams,
  approvedPreview?: VoucherPreviewRow[],
): Promise<VoucherGeneratorResult> {
  const preview = approvedPreview ?? (await previewBulkVouchers(params));
  const created: FeeVoucher[] = [];
  const skipped = preview.filter((row) => row.skippedReason);
  const errors: { studentId: string; message: string }[] = [];
  const lateFeeAmount = lateFeeAmountForVoucher(params);

  for (const row of preview.filter((item) => !item.skippedReason)) {
    try {
      const lines: VoucherPreviewRow["lines"] = [];
      for (const line of row.lines) {
        const open = await getOpenVoucherForInstallment(line.installmentId);
        if (!open) lines.push(line);
      }

      if (!lines.length) {
        skipped.push({
          ...row,
          lines: [],
          lateFeeAmount: 0,
          total: 0,
          skippedReason: "Already has an open voucher",
        });
        continue;
      }

      if (lateFeeAmount > 0) {
        const lateFeeInstallmentId = await addStudentFinanceCharge({
          studentId: row.studentId,
          entryType: "late_fee",
          label: params.lateFeeLabel?.trim() || "Late fee",
          amount: lateFeeAmount,
          effectiveDate: params.voucherDueDate,
          notes: "Added during bulk voucher generation",
        });
        lines.push({
          installmentId: lateFeeInstallmentId,
          label: params.lateFeeLabel?.trim() || "Late fee",
          amount: lateFeeAmount,
          dueDate: params.voucherDueDate,
          componentType: null,
        });
      }

      const voucher = await createFeeVoucherRpc({
        studentId: row.studentId,
        dueDate: params.voucherDueDate,
        notes: params.installmentMonth
          ? `Bulk voucher for ${params.installmentMonth}`
          : "Bulk voucher",
        source: "installment",
        lines: lines.map((line) => ({
          installmentId: line.installmentId,
          label: line.label,
          amount: line.amount,
        })),
      });
      created.push(voucher);
    } catch (error) {
      errors.push({
        studentId: row.studentId,
        message: error instanceof Error ? error.message : "Failed",
      });
    }
  }

  return { preview, created, skipped, errors };
}

function pickInstallmentsForBulk(
  installments: FeeInstallment[],
  mode: BulkVoucherMode,
  filters?: {
    dueMonth?: string;
    componentType?: string;
  },
): FeeInstallment[] {
  const today = new Date().toISOString().slice(0, 10);
  const unpaid = installments.filter((i) => {
    if (installmentBalance(i) <= 0) return false;
    if (filters?.dueMonth && !i.due_date.startsWith(filters.dueMonth)) return false;
    if (filters?.componentType && i.component_type !== filters.componentType) return false;
    return true;
  });

  if (mode === "all_unpaid") return unpaid;

  if (mode === "overdue_only") {
    return unpaid.filter((i) => i.due_date < today);
  }

  // next_due: earliest due per student (here list is per-student when called)
  if (!unpaid.length) return [];
  const sorted = [...unpaid].sort((a, b) => a.due_date.localeCompare(b.due_date));
  return [sorted[0]];
}

/** Issue vouchers for every active student in a section */
export async function bulkIssueVouchersForSection(params: {
  sectionId?: string;
  sessionId: string;
  mode: BulkVoucherMode;
  dueMonth?: string;
  componentType?: string;
  paidFilter?: BulkVoucherPaidFilter;
  lateFeeAmount?: number;
  lateFeeLabel?: string;
}): Promise<BulkVoucherResult> {
  let studentQuery = supabase
    .from("students")
    .select("id")
    .eq("academic_session_id", params.sessionId)
    .eq("status", "active");
  if (params.sectionId) studentQuery = studentQuery.eq("section_id", params.sectionId);

  const { data: students, error: stErr } = await studentQuery;
  if (stErr) throw stErr;

  const created: FeeVoucher[] = [];
  let skipped = 0;
  const errors: { studentId: string; message: string }[] = [];

  for (const st of students ?? []) {
    try {
      const installments = await fetchStudentInstallments(st.id);
      const total = installments.reduce((sum, inst) => sum + Number(inst.amount ?? 0), 0);
      const paid = installments.reduce((sum, inst) => sum + Number(inst.paid_amount ?? 0), 0);
      const paidPercent = total > 0 ? Math.round((paid / total) * 100) : 0;
      if (params.paidFilter === "unpaid_only" && paid > 0) {
        skipped += 1;
        continue;
      }
      if (params.paidFilter === "under_20" && paidPercent >= 20) {
        skipped += 1;
        continue;
      }
      if (params.paidFilter === "under_50" && paidPercent >= 50) {
        skipped += 1;
        continue;
      }
      if (params.paidFilter === "partial_only" && (paid <= 0 || paidPercent >= 100)) {
        skipped += 1;
        continue;
      }
      const targets = pickInstallmentsForBulk(installments, params.mode, {
        dueMonth: params.dueMonth,
        componentType: params.componentType,
      });
      if (!targets.length) {
        skipped += 1;
        continue;
      }
      for (const inst of targets) {
        const open = await getOpenVoucherForInstallment(inst.id);
        if (open) {
          skipped += 1;
          continue;
        }
        const v = await createVoucherFromInstallmentWithLateFee({
          installmentId: inst.id,
          lateFeeAmount: params.lateFeeAmount,
          lateFeeLabel: params.lateFeeLabel,
        });
        created.push(v);
      }
    } catch (e: unknown) {
      errors.push({
        studentId: st.id,
        message: e instanceof Error ? e.message : "Failed",
      });
    }
  }

  return { created, skipped, errors };
}

export async function recordPayment(params: {
  studentId: string;
  amount: number;
  receiptNumber: string;
  paymentMethod: PaymentMethod;
  paidAt?: string;
  notes?: string;
  voucherId?: string;
  cashierSessionId?: string;
  allocations: { installmentId: string; amount: number }[];
}) {
  if (params.amount <= 0) throw new Error("Payment amount must be greater than zero.");
  const receiptNumber = params.receiptNumber.trim();
  if (!receiptNumber) throw new Error("Receipt number is required.");
  if (!params.allocations.length) throw new Error("Select at least one installment to pay.");
  const allocSum = params.allocations.reduce((s, a) => s + a.amount, 0);
  if (Math.abs(allocSum - params.amount) > 0.01) {
    throw new Error("Allocation total must match payment amount.");
  }
  if (params.paymentMethod === "cash" && !params.cashierSessionId) {
    throw new Error("Open a cashier session before recording cash payments.");
  }

  let voucherId = params.voucherId ?? null;
  if (!voucherId) {
    const relatedVoucherIds = new Set<string>();
    for (const allocation of params.allocations) {
      const openVoucher = await getOpenVoucherForInstallment(allocation.installmentId);
      if (openVoucher) relatedVoucherIds.add(openVoucher.id);
    }
    if (relatedVoucherIds.size === 1) {
      voucherId = [...relatedVoucherIds][0];
    }
  }

  const { data: paymentId, error: pErr } = await supabase.rpc("record_fee_payment", {
    p_student_id: params.studentId,
    p_amount: params.amount,
    p_receipt_number: receiptNumber,
    p_payment_method: params.paymentMethod,
    p_paid_at: params.paidAt ?? new Date().toISOString(),
    p_notes: params.notes ?? null,
    p_voucher_id: voucherId,
    p_cashier_session_id: params.cashierSessionId ?? null,
    p_allocations: params.allocations,
  });
  if (pErr) {
    if (pErr.message.includes("duplicate") || pErr.message.includes("unique")) {
      throw new Error("This receipt number is already used.");
    }
    throw new Error(pErr.message);
  }

  const { data: payment, error } = await supabase
    .from("fee_payments")
    .select("*")
    .eq("id", paymentId)
    .single();
  if (error) throw new Error(error.message);
  return payment;
}

export async function recordAdmissionOfficePayment(params: {
  studentId: string;
  amount: number;
  receiptNumber: string;
  paymentMethod: PaymentMethod;
  paidAt?: string;
  notes?: string;
  allocations: { installmentId: string; amount: number }[];
}) {
  if (params.amount <= 0) throw new Error("Payment amount must be greater than zero.");
  const receiptNumber = params.receiptNumber.trim();
  if (!receiptNumber) throw new Error("Receipt number is required.");
  if (!params.allocations.length) {
    throw new Error("Admission payment must be allocated to fee heads.");
  }
  const allocSum = params.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (Math.abs(allocSum - params.amount) > 0.01) {
    throw new Error("Allocation total must match payment amount.");
  }

  const { data: paymentId, error: rpcError } = await supabase.rpc("record_admission_fee_payment", {
    p_student_id: params.studentId,
    p_amount: params.amount,
    p_receipt_number: receiptNumber,
    p_payment_method: params.paymentMethod,
    p_paid_at: params.paidAt ?? new Date().toISOString(),
    p_notes: params.notes ?? "Received by admission office.",
    p_allocations: params.allocations,
  });
  if (rpcError) {
    if (rpcError.message.includes("duplicate") || rpcError.message.includes("unique")) {
      throw new Error("This receipt number is already used.");
    }
    if (rpcError.message.includes("record_admission_fee_payment")) {
      throw new Error(
        "Run supabase/patch-admission-office-payments.sql in Supabase, then retry admission.",
      );
    }
    throw new Error(rpcError.message);
  }

  const { data: payment, error } = await supabase
    .from("fee_payments")
    .select("*")
    .eq("id", paymentId)
    .single();
  if (error) throw new Error(error.message);
  return payment;
}

export async function addStudentFinanceCharge(params: {
  studentId: string;
  entryType: Extract<FinanceLedgerEntryType, "fine" | "late_fee" | "adjustment">;
  label: string;
  amount: number;
  componentType?: FeeInstallment["component_type"];
  effectiveDate?: string;
  notes?: string;
}) {
  if (params.amount <= 0) throw new Error("Charge amount must be greater than zero.");
  const { data, error } = await supabase.rpc("add_student_finance_charge", {
    p_student_id: params.studentId,
    p_entry_type: params.entryType,
    p_label: params.label,
    p_amount: params.amount,
    p_component_type: params.componentType ?? null,
    p_effective_date: params.effectiveDate ?? new Date().toISOString().slice(0, 10),
    p_notes: params.notes ?? null,
  });
  if (error) throw error;
  return data;
}

export async function fetchStudentFinanceLedger(
  studentId: string,
): Promise<StudentFinanceLedgerEntry[]> {
  const { data, error } = await supabase
    .from("student_finance_ledger")
    .select("*")
    .eq("student_id", studentId)
    .order("effective_date")
    .order("created_at");
  if (error) {
    console.warn(
      "Student finance ledger unavailable. Apply the finance ledger migration to enable it.",
      error,
    );
    return [];
  }
  return (data ?? []) as StudentFinanceLedgerEntry[];
}

export async function fetchOpenCashierSession(): Promise<CashierSession | null> {
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("cashier_sessions")
    .select("*")
    .eq("cashier_id", userId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn(
      "Cashier sessions unavailable. Apply the finance ledger migration to enable it.",
      error,
    );
    return null;
  }
  return data as CashierSession | null;
}

export async function openCashierSession(
  openingCash: number,
  notes?: string,
): Promise<CashierSession> {
  const { data: sessionId, error: openError } = await supabase.rpc("open_cashier_session", {
    p_opening_cash: openingCash,
    p_notes: notes ?? null,
  });
  if (openError) {
    if (openError.message.includes("open_cashier_session")) {
      throw new Error(
        "Apply supabase/patch-finance-cashier-controls.sql, then reload the Supabase schema cache.",
      );
    }
    throw new Error(openError.message);
  }
  const { data, error } = await supabase
    .from("cashier_sessions")
    .select("*")
    .eq("id", sessionId as string)
    .single();
  if (error) throw error;
  return data as CashierSession;
}

export async function closeCashierSession(sessionId: string, countedCash: number, notes?: string) {
  const { data, error } = await supabase.rpc("close_cashier_session", {
    p_session_id: sessionId,
    p_counted_cash: countedCash,
    p_notes: notes ?? null,
  });
  if (error) throw error;
  return data;
}

export async function approveCashierSession(sessionId: string, notes?: string) {
  const { data, error } = await supabase.rpc("approve_cashier_session", {
    p_session_id: sessionId,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelFeeVoucher(voucherId: string, reason: string) {
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("Cancellation reason is required.");
  const { data, error } = await supabase.rpc("cancel_fee_voucher", {
    p_voucher_id: voucherId,
    p_reason: cleanReason,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchRecentCashierSessions(limit = 20): Promise<CashierSession[]> {
  const { data, error } = await supabase
    .from("cashier_sessions")
    .select("*")
    .order("opened_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("Cashier sessions unavailable. Apply cashier controls patch.", error);
    return [];
  }
  return (data ?? []) as CashierSession[];
}

/** Pay a voucher — allocates to linked installment lines */
export async function recordVoucherPayment(params: {
  voucherId: string;
  amount: number;
  receiptNumber: string;
  paymentMethod: PaymentMethod;
  cashierSessionId?: string;
  notes?: string;
}) {
  const voucher = await fetchVoucherById(params.voucherId);
  const balance = Math.max(0, Number(voucher.total_amount) - Number(voucher.paid_amount));
  if (params.amount <= 0 || params.amount > balance + 0.01) {
    throw new Error(`Payment must be between 1 and ${balance}.`);
  }

  const lines = voucher.fee_voucher_lines ?? [];
  const withInst = lines.filter((l) => l.installment_id);
  if (!withInst.length) {
    throw new Error("Voucher has no linked installments.");
  }

  let remaining = params.amount;
  const allocations: { installmentId: string; amount: number }[] = [];
  for (const line of withInst) {
    if (remaining <= 0) break;
    const { data: inst } = await supabase
      .from("student_fee_installments")
      .select("amount, paid_amount")
      .eq("id", line.installment_id!)
      .single();
    if (!inst) continue;
    const instBal = installmentBalance(inst);
    const pay = Math.min(remaining, instBal, Number(line.amount));
    if (pay > 0) {
      allocations.push({ installmentId: line.installment_id!, amount: pay });
      remaining -= pay;
    }
  }

  const paid = params.amount - remaining;
  if (remaining > 0.01 || Math.abs(paid - params.amount) > 0.01) {
    throw new Error(
      "Voucher payment could not be fully allocated to linked fee heads. Please review voucher lines before recording payment.",
    );
  }
  return recordPayment({
    studentId: voucher.student_id,
    amount: paid,
    receiptNumber: params.receiptNumber,
    paymentMethod: params.paymentMethod,
    notes: params.notes,
    voucherId: voucher.id,
    cashierSessionId: params.cashierSessionId,
    allocations,
  });
}

export async function fetchFinanceStats() {
  const today = new Date().toISOString().slice(0, 10);

  const [paymentsToday, installments, vouchersOpen] = await Promise.all([
    supabase
      .from("fee_payments")
      .select("amount")
      .gte("paid_at", `${today}T00:00:00`)
      .lte("paid_at", `${today}T23:59:59`),
    supabase.from("student_fee_installments").select("amount, paid_amount, due_date, status"),
    supabase
      .from("fee_vouchers")
      .select("id", { count: "exact", head: true })
      .in("status", ["issued", "partial"]),
  ]);

  const collectedToday = paymentsToday.data?.reduce((s, p) => s + Number(p.amount), 0) ?? 0;

  let outstanding = 0;
  let overdue = 0;
  for (const row of installments.data ?? []) {
    const bal = installmentBalance(row);
    outstanding += bal;
    if (bal > 0 && row.due_date < today) overdue++;
  }

  return {
    collectedToday,
    outstanding,
    overdueCount: overdue,
    openVouchers: vouchersOpen.count ?? 0,
  };
}

export async function fetchOverdueInstallments() {
  const { data, error } = await supabase
    .from("student_fee_installments")
    .select(
      "*, students(id, full_name, roll_number, father_name, phone, guardian_phone, guardian_name, academic_session_id, section_id, programs(name), sections(name, gender))",
    )
    .neq("status", "paid")
    .order("due_date");
  if (error) throw error;
  return (data ?? []).filter((r) => installmentBalance(r) > 0);
}

export function exportOverdueCsv(
  rows: Awaited<ReturnType<typeof fetchOverdueInstallments>>,
): string {
  const header = [
    "Student",
    "Father",
    "Admission no",
    "Program",
    "Section",
    "Fees / dues",
    "Total balance",
    "Phone",
    "Guardian phone",
  ];
  const lines = [header.join(",")];
  const grouped = new Map<
    string,
    {
      student: {
        full_name?: string;
        roll_number?: string;
        father_name?: string;
        phone?: string;
        guardian_phone?: string;
        programs?: { name?: string };
        sections?: { name?: string; gender?: string };
      };
      section: string;
      dues: string[];
      balance: number;
    }
  >();

  for (const r of rows) {
    const st = r.students as {
      id?: string;
      full_name?: string;
      roll_number?: string;
      father_name?: string;
      phone?: string;
      guardian_phone?: string;
      programs?: { name?: string };
      sections?: { name?: string; gender?: string };
    };
    const sec = st?.sections
      ? `${st.sections.gender === "girls" ? "Girls" : "Boys"} ${st.sections.name}`
      : "";
    const bal = installmentBalance(r);
    const key = st?.id ?? r.student_id;
    const current = grouped.get(key) ?? {
      student: st,
      section: sec,
      dues: [],
      balance: 0,
    };
    current.dues.push(`${r.due_date} - ${r.label}: ${bal}`);
    current.balance += bal;
    grouped.set(key, current);
  }

  for (const group of grouped.values()) {
    const st = group.student;
    const row = [
      st?.full_name ?? "",
      st?.father_name ?? "",
      st?.roll_number ?? "",
      st?.programs?.name ?? "",
      group.section,
      group.dues.join(" | "),
      String(group.balance),
      st?.phone ?? "",
      st?.guardian_phone ?? "",
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

function htmlCell(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function exportOverdueExcel(
  rows: Awaited<ReturnType<typeof fetchOverdueInstallments>>,
): string {
  const grouped = new Map<
    string,
    {
      student: {
        id?: string;
        full_name?: string;
        roll_number?: string;
        father_name?: string;
        phone?: string;
        guardian_phone?: string;
        programs?: { name?: string };
        sections?: { name?: string; gender?: string };
      };
      section: string;
      dues: Array<{
        key: string;
        label: string;
        due_date: string;
        amount: number;
        paid: number;
        balance: number;
        sort_order: number;
      }>;
      totalPaid: number;
      totalUnpaid: number;
    }
  >();

  for (const r of rows) {
    const st = r.students as {
      id?: string;
      full_name?: string;
      roll_number?: string;
      father_name?: string;
      phone?: string;
      guardian_phone?: string;
      programs?: { name?: string };
      sections?: { name?: string; gender?: string };
    };
    const key = st?.id ?? r.student_id;
    const section = st?.sections
      ? `${st.sections.gender === "girls" ? "Girls" : "Boys"} ${st.sections.name}`
      : "";
    const current = grouped.get(key) ?? {
      student: st,
      section,
      dues: [],
      totalPaid: 0,
      totalUnpaid: 0,
    };
    const amount = Number(r.amount ?? 0);
    const paid = Number(r.paid_amount ?? 0);
    const balance = installmentBalance(r);
    current.dues.push({
      key: `${Number(r.sort_order ?? 0)}-${r.label}-${r.due_date}`,
      label: r.label,
      due_date: r.due_date,
      amount,
      paid,
      balance,
      sort_order: Number(r.sort_order ?? 0),
    });
    current.totalPaid += paid;
    current.totalUnpaid += balance;
    grouped.set(key, current);
  }

  const groups = [...grouped.values()];
  const dueColumns = [
    ...new Map(groups.flatMap((g) => g.dues).map((due) => [due.key, due])).values(),
  ].sort((a, b) => a.sort_order - b.sort_order || a.due_date.localeCompare(b.due_date));
  const baseHeaders = [
    "Admission No",
    "Name",
    "Father Name",
    "Program",
    "Section",
    "Phone",
    "Guardian Phone",
  ];
  const headerHtml = [...baseHeaders, ...dueColumns.map((due) => `${due.label} (${due.due_date})`)]
    .concat(["Total paid", "Total unpaid remaining"])
    .map((h) => `<th>${htmlCell(h)}</th>`)
    .join("");
  const bodyHtml = groups
    .map((group) => {
      const st = group.student;
      const base = [
        st?.roll_number ?? "",
        st?.full_name ?? "",
        st?.father_name ?? "",
        st?.programs?.name ?? "",
        group.section,
        st?.phone ?? "",
        st?.guardian_phone ?? "",
      ]
        .map((v) => `<td>${htmlCell(v)}</td>`)
        .join("");
      const dueCells = dueColumns
        .map((col) => {
          const due = group.dues.find((d) => d.key === col.key);
          if (!due) return "<td></td>";
          const cls =
            due.paid >= due.amount && due.amount > 0
              ? "paid-cell"
              : due.paid > 0
                ? "partial-cell"
                : "unpaid-cell";
          const text =
            due.paid >= due.amount && due.amount > 0
              ? `Paid ${due.paid}`
              : due.paid > 0
                ? `Paid ${due.paid} / Due ${due.balance}`
                : `Due ${due.amount}`;
          return `<td ss:StyleID="${cls}">${htmlCell(text)}</td>`;
        })
        .join("");
      return `<tr>${base}${dueCells}<td>${htmlCell(group.totalPaid)}</td><td>${htmlCell(group.totalUnpaid)}</td></tr>`;
    })
    .join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1D4ED8" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>
  <Style ss:ID="paid-cell"><Font ss:Bold="1" ss:Color="#166534"/><Interior ss:Color="#BBF7D0" ss:Pattern="Solid"/></Style>
  <Style ss:ID="partial-cell"><Font ss:Bold="1" ss:Color="#92400E"/><Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/></Style>
  <Style ss:ID="unpaid-cell"><Font ss:Bold="1" ss:Color="#991B1B"/><Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="Student Dues">
  <Table>
   <Row>${headerHtml.replaceAll("<th>", '<Cell ss:StyleID="header"><Data ss:Type="String">').replaceAll("</th>", "</Data></Cell>")}</Row>
   ${bodyHtml
     .replaceAll("<tr>", "<Row>")
     .replaceAll("</tr>", "</Row>")
     .replaceAll("<td>", '<Cell><Data ss:Type="String">')
     .replaceAll("</td>", "</Data></Cell>")
     .replaceAll(
       '<td ss:StyleID="paid-cell">',
       '<Cell ss:StyleID="paid-cell"><Data ss:Type="String">',
     )
     .replaceAll(
       '<td ss:StyleID="partial-cell">',
       '<Cell ss:StyleID="partial-cell"><Data ss:Type="String">',
     )
     .replaceAll(
       '<td ss:StyleID="unpaid-cell">',
       '<Cell ss:StyleID="unpaid-cell"><Data ss:Type="String">',
     )}
  </Table>
 </Worksheet>
</Workbook>`;
}
