import { supabase } from "@/integrations/supabase/client";
import { currentAcademicYearStart } from "@/lib/academic";
import { academicYearLabel } from "@/lib/academic-year-close";
import { installmentBalance, fetchBadDebtByInstallment } from "@/lib/finance";
import { budgetTargetForComponent, fetchSessionFinanceBudget } from "@/lib/finance-budget";
import { FEE_COMPONENTS, type FeeComponentType } from "@/lib/fees-types";

export type AcademicYearFinanceSummary = {
  academicYearStart: number;
  label: string;
  feeCycle: number;
  isClosed: boolean;
  closedAt?: string;
  totalPayable: number;
  totalCollected: number;
  totalOutstanding: number;
  arrears?: number;
};

export type SessionRevenueAnalytics = {
  sessionId: string;
  sessionLabel: string;
  studentCount: number;
  totalPayable: number;
  totalCollected: number;
  totalOutstanding: number;
  currentAcademicYearStart: number;
  years: AcademicYearFinanceSummary[];
  sessionTotal: { payable: number; collected: number; outstanding: number };
  yearEndCloses: {
    academicYearStart: number;
    closedAt: string;
    feeCycle: number;
    totalPayable: number;
    totalCollected: number;
    totalOutstanding: number;
    totalBadDebt: number;
  }[];
  collectedThisMonth: number;  componentEstimates: { key: string; label: string; estimated: number; collected: number }[];
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

const EMPTY_LEDGER_SUMMARY = { fines: 0, lateFees: 0, adjustments: 0, waivers: 0, badDebt: 0 };

function summarizeFinanceLedger(
  rows: { entry_type: string; debit: number | null; credit: number | null; student_id?: string }[],
) {
  return rows.reduce(
    (acc, row) => {
      const net = Number(row.debit ?? 0) - Number(row.credit ?? 0);
      if (row.entry_type === "fine") acc.fines += net;
      if (row.entry_type === "late_fee") acc.lateFees += net;
      if (row.entry_type === "adjustment") acc.adjustments += net;
      if (row.entry_type === "waiver") acc.waivers += Number(row.credit ?? 0);
      if (row.entry_type === "bad_debt") acc.badDebt += Number(row.credit ?? 0);
      return acc;
    },
    { ...EMPTY_LEDGER_SUMMARY },
  );
}

function ledgerCreditsByStudent(
  rows: { entry_type: string; credit: number | null; student_id?: string }[],
) {
  const badDebt = new Map<string, number>();
  const waivers = new Map<string, number>();
  for (const row of rows) {
    if (!row.student_id) continue;
    const credit = Number(row.credit ?? 0);
    if (credit <= 0) continue;
    if (row.entry_type === "bad_debt") {
      badDebt.set(row.student_id, (badDebt.get(row.student_id) ?? 0) + credit);
    }
    if (row.entry_type === "waiver") {
      waivers.set(row.student_id, (waivers.get(row.student_id) ?? 0) + credit);
    }
  }
  return { badDebt, waivers };
}

/** Collectible outstanding: estimated − received − bad debt − waivers */
function collectibleOutstanding(
  payable: number,
  collected: number,
  badDebt: number,
  waivers: number,
): number {
  return Math.max(0, payable - collected - badDebt - waivers);
}

/** All finance numbers for a session — single source: installments + payments per student */
export async function fetchSessionRevenueAnalytics(sessionId: string): Promise<SessionRevenueAnalytics> {
  const { data: session } = await supabase
    .from("academic_sessions")
    .select("label, start_year, end_year")
    .eq("id", sessionId)
    .single();

  const sessionStartYear = session?.start_year ?? currentAcademicYearStart();
  const currentYearStart = currentAcademicYearStart();
  const [{ data: sessionStudents, error: sessionStErr }, { data: activeStudents, error: activeStErr }] =
    await Promise.all([
      supabase
        .from("students")
        .select("id, status, section_id, sections(name, gender), classes(name), programs(name)")
        .eq("academic_session_id", sessionId),
      supabase
        .from("students")
        .select("id")
        .eq("academic_session_id", sessionId)
        .eq("status", "active"),
    ]);
  if (sessionStErr) throwSupabaseError(sessionStErr);
  if (activeStErr) throwSupabaseError(activeStErr);

  const students = sessionStudents ?? [];
  const sessionStudentIds = students.map((s) => s.id);
  const activeStudentIds = (activeStudents ?? []).map((s) => s.id);
  const activeStudentCount = activeStudentIds.length;
  const budgetRow = await fetchSessionFinanceBudget(sessionId);

  if (!sessionStudentIds.length) {
    return {
      sessionId,
      sessionLabel: session?.label ?? "",
      studentCount: 0,
      totalPayable: 0,
      totalCollected: 0,
      totalOutstanding: 0,
      currentAcademicYearStart: currentYearStart,
      years: [],
      sessionTotal: { payable: 0, collected: 0, outstanding: 0 },
      yearEndCloses: [],
      collectedThisMonth: 0,      componentEstimates: FEE_COMPONENTS.map((c) => ({ key: c.key, label: c.label, estimated: 0, collected: 0 })),
      monthlyCollected: [],
      monthlyExpected: [],
      sectionSummary: [],
      budget: buildBudgetSummary(budgetRow, [], 0),
      ledgerSummary: { ...EMPTY_LEDGER_SUMMARY },
    };
  }

  const [installmentsRes, paymentsRes, plansRes, ledgerRes, badDebtByInstallment, yearClosesRes] =
    await Promise.all([
    supabase
      .from("student_fee_installments")
      .select("id, student_id, amount, paid_amount, due_date, status, component_type, fee_cycle, academic_year_start")
      .in("student_id", sessionStudentIds),
    supabase
      .from("fee_payments")
      .select("id, student_id, amount, paid_at, payment_method")
      .in("student_id", sessionStudentIds)
      .order("paid_at", { ascending: false }),
    supabase
      .from("student_fee_plans")
      .select("student_id, admission_fee, annual_fund, annual_fee, semester_fee, scholarship_discount")
      .in("student_id", sessionStudentIds),
    supabase
      .from("student_finance_ledger")
      .select("entry_type, debit, credit, student_id")
      .in("student_id", sessionStudentIds),
    fetchBadDebtByInstallment(sessionStudentIds),
    supabase
      .from("session_academic_year_closes")
      .select("*")
      .eq("academic_session_id", sessionId)
      .order("academic_year_start"),
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
  const ledgerSummary = summarizeFinanceLedger(ledgerRows);
  const { badDebt: badDebtByStudent, waivers: waiversByStudent } = ledgerCreditsByStudent(ledgerRows);

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
    const bal = installmentBalance(inst, badDebtByInstallment.get(inst.id) ?? 0);
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
    {
      sectionName: string;
      className: string;
      programName: string;
      students: Set<string>;
      payable: number;
      collected: number;
    }
  >();

  for (const st of students) {
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
    if (st.status === "active") {
      sectionMap.get(sid)!.students.add(st.id);
    }
  }

  for (const inst of installments) {
    const sid = students.find((s) => s.id === inst.student_id)?.section_id ?? "none";
    const row = sectionMap.get(sid);
    if (!row) continue;
    row.payable += Number(inst.amount);
    row.collected += Number(inst.paid_amount);
  }

  const sectionLedgerCredits = new Map<string, { badDebt: number; waivers: number }>();
  for (const st of students) {
    const studentBadDebt = badDebtByStudent.get(st.id) ?? 0;
    const studentWaivers = waiversByStudent.get(st.id) ?? 0;
    if (studentBadDebt <= 0 && studentWaivers <= 0) continue;
    const sid = st.section_id ?? "none";
    const credits = sectionLedgerCredits.get(sid) ?? { badDebt: 0, waivers: 0 };
    credits.badDebt += studentBadDebt;
    credits.waivers += studentWaivers;
    sectionLedgerCredits.set(sid, credits);
  }

  const sectionSummary = [...sectionMap.entries()].map(([sectionId, r]) => {
    const credits = sectionLedgerCredits.get(sectionId) ?? { badDebt: 0, waivers: 0 };
    return {
      sectionId,
      sectionName: r.sectionName,
      className: r.className,
      programName: r.programName,
      students: r.students.size,
      payable: r.payable,
      collected: r.collected,
      outstanding: collectibleOutstanding(r.payable, r.collected, credits.badDebt, credits.waivers),
    };
  });

  const componentEstimates = FEE_COMPONENTS.map((c) => ({
    key: c.key,
    label: c.label,
    estimated: componentEst[c.key]?.estimated ?? 0,
    collected: componentEst[c.key]?.collected ?? 0,
  })).filter((c) => c.estimated > 0 || c.collected > 0);

  const totalOutstanding = collectibleOutstanding(
    totalPayable,
    totalCollected,
    ledgerSummary.badDebt,
    ledgerSummary.waivers,
  );

  const yearCloses = yearClosesRes.error ? [] : yearClosesRes.data ?? [];
  const closesByYear = new Map(yearCloses.map((row) => [row.academic_year_start, row]));

  const installmentsByCycle = new Map<number, typeof installments>();
  for (const inst of installments) {
    const cycle = Number(inst.fee_cycle ?? 1);
    const list = installmentsByCycle.get(cycle) ?? [];
    list.push(inst);
    installmentsByCycle.set(cycle, list);
  }

  const liveCycleTotals = (cycleInsts: typeof installments) => {
    let payable = 0;
    let collected = 0;
    let outstanding = 0;
    for (const inst of cycleInsts) {
      payable += Number(inst.amount);
      collected += Number(inst.paid_amount);
      outstanding += installmentBalance(inst, badDebtByInstallment.get(inst.id) ?? 0);
    }
    return { payable, collected, outstanding };
  };

  const yearStarts = new Set<number>();
  for (let y = sessionStartYear; y <= Math.min(session?.end_year ?? currentYearStart, currentYearStart); y += 1) {
    yearStarts.add(y);
  }
  for (const inst of installments) {
    if (inst.academic_year_start) yearStarts.add(inst.academic_year_start);
  }
  for (const close of yearCloses) {
    yearStarts.add(close.academic_year_start);
  }

  const years: AcademicYearFinanceSummary[] = [...yearStarts]
    .sort((a, b) => a - b)
    .map((academicYearStart) => {
      const feeCycle = academicYearStart - sessionStartYear + 1;
      const cycleInsts = installmentsByCycle.get(feeCycle) ?? [];
      const live = liveCycleTotals(cycleInsts);
      const close = closesByYear.get(academicYearStart);
      const isClosed = !!close;
      return {
        academicYearStart,
        label: academicYearLabel(academicYearStart),
        feeCycle,
        isClosed,
        closedAt: close?.closed_at,
        totalPayable: isClosed ? Number(close.total_payable) : live.payable,
        totalCollected: isClosed ? Number(close.total_collected) : live.collected,
        totalOutstanding: isClosed ? Number(close.total_outstanding) : live.outstanding,
        arrears: isClosed ? live.outstanding : undefined,
      };
    });

  const yearEndCloses = yearCloses.map((row) => ({
    academicYearStart: row.academic_year_start,
    closedAt: row.closed_at,
    feeCycle: row.fee_cycle,
    totalPayable: Number(row.total_payable),
    totalCollected: Number(row.total_collected),
    totalOutstanding: Number(row.total_outstanding),
    totalBadDebt: Number(row.total_bad_debt),
  }));

  return {
    sessionId,
    sessionLabel: session?.label ?? "",
    studentCount: activeStudentCount,
    totalPayable,
    totalCollected,
    totalOutstanding,
    currentAcademicYearStart: currentYearStart,
    years,
    sessionTotal: {
      payable: totalPayable,
      collected: totalCollected,
      outstanding: totalOutstanding,
    },
    yearEndCloses,
    collectedThisMonth,    componentEstimates,
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

export async function fetchYearEndLedgerRows(sessionId: string, academicYearStart?: number) {
  let query = supabase
    .from("student_academic_year_closes")
    .select(
      `
      academic_year_start,
      fee_cycle,
      payable,
      collected,
      outstanding,
      closed_at,
      class_year_level,
      students(
        full_name,
        roll_number,
        father_name,
        phone,
        guardian_phone,
        programs(name),
        classes(name),
        sections(name, gender)
      )
    `,
    )
    .eq("academic_session_id", sessionId)
    .order("academic_year_start")
    .order("roll_number", { referencedTable: "students" });

  if (academicYearStart != null) {
    query = query.eq("academic_year_start", academicYearStart);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

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

  const badDebtByInstallment = await fetchBadDebtByInstallment([studentId]);

  let totalPayable = 0;
  let totalPaid = 0;
  let balance = 0;
  const rows = installments.map((inst) => {
    const amount = Number(inst.amount);
    const paid_amount = Number(inst.paid_amount);
    const instBalance = installmentBalance(inst, badDebtByInstallment.get(inst.id) ?? 0);
    totalPayable += amount;
    totalPaid += paid_amount;
    balance += instBalance;
    return {
      id: inst.id,
      label: inst.label,
      due_date: inst.due_date,
      amount,
      paid_amount,
      balance: instBalance,
      status: inst.status,
      component_type: inst.component_type,
    };
  });

  return {
    totalPayable,
    totalPaid,
    balance,
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
