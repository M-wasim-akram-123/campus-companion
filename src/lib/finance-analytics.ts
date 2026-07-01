import { supabase } from "@/integrations/supabase/client";
import { installmentBalance } from "@/lib/finance";
import { budgetTargetForComponent, fetchSessionFinanceBudget } from "@/lib/finance-budget";
import { FEE_COMPONENTS, type FeeComponentType } from "@/lib/fees-types";

export type SessionRevenueAnalytics = {
  sessionId: string;
  sessionLabel: string;
  studentCount: number;
  totalPayable: number;
  totalCollected: number;
  totalOutstanding: number;
  collectedThisMonth: number;
  componentEstimates: { key: string; label: string; estimated: number; collected: number }[];
  monthlyCollected: { month: string; label: string; amount: number; count: number }[];
  monthlyExpected: { month: string; label: string; amount: number; count: number }[];
  sectionSummary: {
    sectionId: string;
    sectionName: string;
    className: string;
    programName: string;
    students: number;
    payable: number;
    collected: number;
    outstanding: number;
  }[];
  budget: {
    totalTarget: number;
    totalCollected: number;
    components: {
      key: string;
      label: string;
      target: number;
      collected: number;
      percent: number;
    }[];
  } | null;
  ledgerSummary: {
    fines: number;
    lateFees: number;
    adjustments: number;
    waivers: number;
    badDebt: number;
  };
};

function monthKey(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function throwSupabaseError(error: { message?: string; code?: string; details?: string; hint?: string }) {
  const parts = [error.message, error.details, error.hint].filter(Boolean);
  throw new Error(parts.join(" ") || error.code || "Supabase query failed");
}

/** All finance numbers for a session — single source: installments + payments per student */
export async function fetchSessionRevenueAnalytics(sessionId: string): Promise<SessionRevenueAnalytics> {
  const { data: session } = await supabase
    .from("academic_sessions")
    .select("label")
    .eq("id", sessionId)
    .single();

  const { data: students, error: stErr } = await supabase
    .from("students")
    .select("id, section_id, sections(name, gender), classes(name), programs(name)")
    .eq("academic_session_id", sessionId)
    .eq("status", "active");
  if (stErr) throwSupabaseError(stErr);

  const studentIds = (students ?? []).map((s) => s.id);
  const budgetRow = await fetchSessionFinanceBudget(sessionId);

  if (!studentIds.length) {
    return {
      sessionId,
      sessionLabel: session?.label ?? "",
      studentCount: 0,
      totalPayable: 0,
      totalCollected: 0,
      totalOutstanding: 0,
      collectedThisMonth: 0,
      componentEstimates: FEE_COMPONENTS.map((c) => ({ key: c.key, label: c.label, estimated: 0, collected: 0 })),
      monthlyCollected: [],
      monthlyExpected: [],
      sectionSummary: [],
      budget: buildBudgetSummary(budgetRow, [], 0),
      ledgerSummary: { fines: 0, lateFees: 0, adjustments: 0, waivers: 0, badDebt: 0 },
    };
  }

  const [installmentsRes, paymentsRes, plansRes, ledgerRes] = await Promise.all([
    supabase
      .from("student_fee_installments")
      .select("id, student_id, amount, paid_amount, due_date, status, component_type")
      .in("student_id", studentIds),
    supabase
      .from("fee_payments")
      .select("id, student_id, amount, paid_at, payment_method")
      .in("student_id", studentIds)
      .order("paid_at", { ascending: false }),
    supabase
      .from("student_fee_plans")
      .select("student_id, admission_fee, annual_fund, annual_fee, semester_fee, scholarship_discount")
      .in("student_id", studentIds),
    supabase
      .from("student_finance_ledger")
      .select("entry_type, debit, credit")
      .in("student_id", studentIds),
  ]);

  if (installmentsRes.error) throwSupabaseError(installmentsRes.error);
  if (paymentsRes.error) throwSupabaseError(paymentsRes.error);
  if (plansRes.error) throwSupabaseError(plansRes.error);
  if (ledgerRes.error) {
    console.warn("Finance ledger summary unavailable. Apply the finance ledger migration to enable it.", ledgerRes.error);
  }

  const installments = installmentsRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const plans = plansRes.data ?? [];
  const ledgerRows = ledgerRes.error ? [] : ledgerRes.data ?? [];
  const ledgerSummary = ledgerRows.reduce(
    (acc, row) => {
      const net = Number(row.debit ?? 0) - Number(row.credit ?? 0);
      if (row.entry_type === "fine") acc.fines += net;
      if (row.entry_type === "late_fee") acc.lateFees += net;
      if (row.entry_type === "adjustment") acc.adjustments += net;
      if (row.entry_type === "waiver") acc.waivers += Number(row.credit ?? 0);
      if (row.entry_type === "bad_debt") acc.badDebt += net;
      return acc;
    },
    { fines: 0, lateFees: 0, adjustments: 0, waivers: 0, badDebt: 0 },
  );

  let totalPayable = 0;
  let totalCollected = 0;
  const componentEst = Object.fromEntries(FEE_COMPONENTS.map((c) => [c.key, { estimated: 0, collected: 0 }]));

  for (const inst of installments) {
    const amt = Number(inst.amount);
    const paid = Number(inst.paid_amount);
    totalPayable += amt;
    totalCollected += paid;
    const key = inst.component_type as string;
    if (key && componentEst[key]) {
      componentEst[key].estimated += amt;
      componentEst[key].collected += paid;
    }
  }

  // Plan-level estimates (policy totals) for "estimated revenue by component" headline
  for (const plan of plans) {
    for (const c of FEE_COMPONENTS) {
      const v = Number((plan as Record<string, number>)[c.key] ?? 0);
      if (v > 0 && componentEst[c.key].estimated === 0) {
        componentEst[c.key].estimated += v;
      }
    }
    const disc = Number(plan.scholarship_discount ?? 0);
    if (disc > 0) componentEst.admission_fee.collected += 0; // discount already in installments
  }

  const thisMonthKey = monthKey(new Date());
  const collectedThisMonth = payments
    .filter((p) => monthKey(p.paid_at) === thisMonthKey)
    .reduce((s, p) => s + Number(p.amount), 0);

  const monthlyCollectedMap = new Map<string, { amount: number; count: number }>();
  for (const p of payments) {
    const k = monthKey(p.paid_at);
    const cur = monthlyCollectedMap.get(k) ?? { amount: 0, count: 0 };
    cur.amount += Number(p.amount);
    cur.count += 1;
    monthlyCollectedMap.set(k, cur);
  }

  const monthlyExpectedMap = new Map<string, { amount: number; count: number }>();
  const today = new Date().toISOString().slice(0, 10);
  for (const inst of installments) {
    const bal = installmentBalance(inst);
    if (bal <= 0) continue;
    const k = monthKey(inst.due_date);
    const cur = monthlyExpectedMap.get(k) ?? { amount: 0, count: 0 };
    cur.amount += bal;
    cur.count += 1;
    monthlyExpectedMap.set(k, cur);
  }

  const sortMonths = (a: string, b: string) => a.localeCompare(b);
  const monthlyCollected = [...monthlyCollectedMap.entries()]
    .sort(([a], [b]) => sortMonths(a, b))
    .slice(-12)
    .map(([month, v]) => ({ month, label: monthLabel(month), ...v }));

  const monthlyExpected = [...monthlyExpectedMap.entries()]
    .filter(([m]) => m >= thisMonthKey)
    .sort(([a], [b]) => sortMonths(a, b))
    .slice(0, 12)
    .map(([month, v]) => ({ month, label: monthLabel(month), ...v }));

  const sectionMap = new Map<
    string,
    { sectionName: string; className: string; programName: string; students: Set<string>; payable: number; collected: number }
  >();

  for (const st of students ?? []) {
    const sec = st.sections as { name?: string; gender?: string } | null;
    const sid = st.section_id ?? "none";
    const label = sec ? `${sec.gender === "girls" ? "Girls" : "Boys"} — ${sec.name}` : "Unassigned";
    if (!sectionMap.has(sid)) {
      sectionMap.set(sid, {
        sectionName: label,
        className: (st.classes as { name?: string })?.name ?? "—",
        programName: (st.programs as { name?: string })?.name ?? "—",
        students: new Set(),
        payable: 0,
        collected: 0,
      });
    }
    sectionMap.get(sid)!.students.add(st.id);
  }

  for (const inst of installments) {
    const sid = students!.find((s) => s.id === inst.student_id)?.section_id ?? "none";
    const row = sectionMap.get(sid);
    if (!row) continue;
    row.payable += Number(inst.amount);
    row.collected += Number(inst.paid_amount);
  }

  const sectionSummary = [...sectionMap.entries()].map(([sectionId, r]) => ({
    sectionId,
    sectionName: r.sectionName,
    className: r.className,
    programName: r.programName,
    students: r.students.size,
    payable: r.payable,
    collected: r.collected,
    outstanding: r.payable - r.collected,
  }));

  const componentEstimates = FEE_COMPONENTS.map((c) => ({
    key: c.key,
    label: c.label,
    estimated: componentEst[c.key]?.estimated ?? 0,
    collected: componentEst[c.key]?.collected ?? 0,
  })).filter((c) => c.estimated > 0 || c.collected > 0);

  return {
    sessionId,
    sessionLabel: session?.label ?? "",
    studentCount: studentIds.length,
    totalPayable,
    totalCollected,
    totalOutstanding: totalPayable - totalCollected,
    collectedThisMonth,
    componentEstimates,
    monthlyCollected,
    monthlyExpected,
    sectionSummary,
    budget: buildBudgetSummary(budgetRow, componentEstimates, totalCollected),
    ledgerSummary,
  };
}

function buildBudgetSummary(
  budgetRow: Awaited<ReturnType<typeof fetchSessionFinanceBudget>>,
  componentEstimates: { key: string; label: string; collected: number }[],
  sessionTotalCollected: number,
) {
  if (!budgetRow || Number(budgetRow.total_target) <= 0) return null;

  const components = FEE_COMPONENTS.map((c) => {
    const target = budgetTargetForComponent(budgetRow, c.key as FeeComponentType);
    const collected =
      componentEstimates.find((e) => e.key === c.key)?.collected ??
      0;
    return {
      key: c.key,
      label: c.label,
      target,
      collected,
      percent: target > 0 ? Math.round((collected / target) * 100) : 0,
    };
  }).filter((c) => c.target > 0);

  return {
    totalTarget: Number(budgetRow.total_target),
    totalCollected: sessionTotalCollected,
    components,
  };
}

export type StudentFeeLedger = {
  totalPayable: number;
  totalPaid: number;
  balance: number;
  paidPercent: number;
  installments: {
    id: string;
    label: string;
    due_date: string;
    amount: number;
    paid_amount: number;
    balance: number;
    status: string;
    component_type: string | null;
  }[];
  payments: {
    id: string;
    receipt_number: string;
    amount: number;
    payment_method: string;
    paid_at: string;
    notes: string | null;
  }[];
};

export async function fetchStudentFeeLedger(studentId: string): Promise<StudentFeeLedger | null> {
  const { data: installments, error: iErr } = await supabase
    .from("student_fee_installments")
    .select("*")
    .eq("student_id", studentId)
    .order("sort_order");
  if (iErr) throw iErr;
  if (!installments?.length) return null;

  const { data: payments, error: pErr } = await supabase
    .from("fee_payments")
    .select("id, receipt_number, amount, payment_method, paid_at, notes")
    .eq("student_id", studentId)
    .order("paid_at", { ascending: false });
  if (pErr) throw pErr;

  let totalPayable = 0;
  let totalPaid = 0;
  const rows = installments.map((inst) => {
    const amount = Number(inst.amount);
    const paid_amount = Number(inst.paid_amount);
    const balance = installmentBalance(inst);
    totalPayable += amount;
    totalPaid += paid_amount;
    return {
      id: inst.id,
      label: inst.label,
      due_date: inst.due_date,
      amount,
      paid_amount,
      balance,
      status: inst.status,
      component_type: inst.component_type,
    };
  });

  return {
    totalPayable,
    totalPaid,
    balance: totalPayable - totalPaid,
    paidPercent: totalPayable > 0 ? Math.round((totalPaid / totalPayable) * 100) : 0,
    installments: rows,
    payments: (payments ?? []).map((p) => ({
      id: p.id,
      receipt_number: p.receipt_number,
      amount: Number(p.amount),
      payment_method: p.payment_method,
      paid_at: p.paid_at,
      notes: p.notes,
    })),
  };
}
