import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/fees";
import type {
  FeeInstallment,
  FeeVoucher,
  PaymentMethod,
  VoucherQrPayload,
  VoucherSource,
} from "@/lib/finance-types";

export { formatCurrency };

export function installmentBalance(inst: { amount: number; paid_amount: number }): number {
  return Math.max(0, Number(inst.amount) - Number(inst.paid_amount));
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

export async function generateVoucherQrDataUrl(payload: VoucherQrPayload | string): Promise<string> {
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

export async function createVoucherFromInstallment(installmentId: string, notes?: string) {
  const { data: inst, error: iErr } = await supabase
    .from("student_fee_installments")
    .select("*")
    .eq("id", installmentId)
    .single();
  if (iErr) throw iErr;

  const balance = installmentBalance(inst);
  if (balance <= 0) throw new Error("This installment is already fully paid.");

  const voucherNumber = await nextNumber("voucher");
  const { data: voucher, error: vErr } = await supabase
    .from("fee_vouchers")
    .insert({
      voucher_number: voucherNumber,
      student_id: inst.student_id,
      source: "installment" as VoucherSource,
      total_amount: balance,
      due_date: inst.due_date,
      notes: notes ?? null,
      status: "issued",
    })
    .select()
    .single();
  if (vErr) throw vErr;

  const { error: lErr } = await supabase.from("fee_voucher_lines").insert({
    voucher_id: voucher.id,
    installment_id: installmentId,
    label: inst.label,
    amount: balance,
    sort_order: 0,
  });
  if (lErr) throw lErr;

  return fetchVoucherById(voucher.id);
}

export async function createManualVoucher(params: {
  studentId: string;
  dueDate: string;
  notes?: string;
  lines: { label: string; amount: number; installmentId?: string }[];
}) {
  const total = params.lines.reduce((s, l) => s + l.amount, 0);
  if (total <= 0) throw new Error("Voucher total must be greater than zero.");

  const voucherNumber = await nextNumber("voucher");
  const { data: voucher, error: vErr } = await supabase
    .from("fee_vouchers")
    .insert({
      voucher_number: voucherNumber,
      student_id: params.studentId,
      source: "manual",
      total_amount: total,
      due_date: params.dueDate,
      notes: params.notes ?? null,
      status: "issued",
    })
    .select()
    .single();
  if (vErr) throw vErr;

  const { error: lErr } = await supabase.from("fee_voucher_lines").insert(
    params.lines.map((l, i) => ({
      voucher_id: voucher.id,
      installment_id: l.installmentId ?? null,
      label: l.label,
      amount: l.amount,
      sort_order: i,
    })),
  );
  if (lErr) throw lErr;

  return fetchVoucherById(voucher.id);
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

async function applyInstallmentPayment(installmentId: string, payAmount: number) {
  const { data: inst, error } = await supabase
    .from("student_fee_installments")
    .select("*")
    .eq("id", installmentId)
    .single();
  if (error) throw error;

  const newPaid = Math.min(Number(inst.amount), Number(inst.paid_amount) + payAmount);
  const status = computeInstallmentStatus(Number(inst.amount), newPaid);

  const { error: uErr } = await supabase
    .from("student_fee_installments")
    .update({ paid_amount: newPaid, status })
    .eq("id", installmentId);
  if (uErr) throw uErr;
}

async function syncVoucherPayments(voucherId: string) {
  const { data: voucher, error } = await supabase
    .from("fee_vouchers")
    .select("*")
    .eq("id", voucherId)
    .single();
  if (error) throw error;

  const paid = Number(voucher.paid_amount);
  const total = Number(voucher.total_amount);
  const status = computeVoucherStatus(total, paid);

  await supabase.from("fee_vouchers").update({ status }).eq("id", voucherId);
}

export async function recordPayment(params: {
  studentId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paidAt?: string;
  notes?: string;
  voucherId?: string;
  allocations: { installmentId: string; amount: number }[];
}) {
  if (params.amount <= 0) throw new Error("Payment amount must be greater than zero.");
  const allocSum = params.allocations.reduce((s, a) => s + a.amount, 0);
  if (Math.abs(allocSum - params.amount) > 0.01) {
    throw new Error("Allocation total must match payment amount.");
  }

  const receiptNumber = await nextNumber("receipt");
  const { data: user } = await supabase.auth.getUser();

  const { data: payment, error: pErr } = await supabase
    .from("fee_payments")
    .insert({
      receipt_number: receiptNumber,
      student_id: params.studentId,
      voucher_id: params.voucherId ?? null,
      amount: params.amount,
      payment_method: params.paymentMethod,
      paid_at: params.paidAt ?? new Date().toISOString(),
      notes: params.notes ?? null,
      recorded_by: user.user?.id ?? null,
    })
    .select()
    .single();
  if (pErr) throw pErr;

  for (const a of params.allocations) {
    await supabase.from("fee_payment_allocations").insert({
      payment_id: payment.id,
      installment_id: a.installmentId,
      amount: a.amount,
    });
    await applyInstallmentPayment(a.installmentId, a.amount);
  }

  if (params.voucherId) {
    const { data: voucher } = await supabase
      .from("fee_vouchers")
      .select("paid_amount, total_amount")
      .eq("id", params.voucherId)
      .single();
    if (voucher) {
      const newPaid = Number(voucher.paid_amount) + params.amount;
      await supabase
        .from("fee_vouchers")
        .update({
          paid_amount: Math.min(Number(voucher.total_amount), newPaid),
          status: computeVoucherStatus(Number(voucher.total_amount), newPaid),
        })
        .eq("id", params.voucherId);
    }
  }

  return payment;
}

/** Pay a voucher — allocates to linked installment lines */
export async function recordVoucherPayment(params: {
  voucherId: string;
  amount: number;
  paymentMethod: PaymentMethod;
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
  return recordPayment({
    studentId: voucher.student_id,
    amount: paid,
    paymentMethod: params.paymentMethod,
    notes: params.notes,
    voucherId: voucher.id,
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

  const collectedToday =
    paymentsToday.data?.reduce((s, p) => s + Number(p.amount), 0) ?? 0;

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
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("student_fee_installments")
    .select("*, students(full_name, roll_number, programs(name))")
    .lt("due_date", today)
    .neq("status", "paid")
    .order("due_date");
  if (error) throw error;
  return (data ?? []).filter((r) => installmentBalance(r) > 0);
}
