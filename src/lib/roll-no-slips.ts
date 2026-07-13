import type { AppRole } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { installmentBalance } from "@/lib/finance";

export type RollNoSlipRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "released"
  | "settled";

export type RollNoSlipEligibilityCategory =
  | "eligible"
  | "not_eligible"
  | "pending_approval"
  | "approved_exception"
  | "released_with_dues";

export type RollNoSlipRequest = {
  id: string;
  student_id: string;
  academic_session_id: string | null;
  class_id: string | null;
  section_id: string | null;
  status: RollNoSlipRequestStatus;
  outstanding_amount_at_request: number;
  approved_amount: number | null;
  guarantor_name: string;
  guarantor_phone: string | null;
  promised_payment_date: string | null;
  reason: string | null;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_notes: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_notes: string | null;
  released_by: string | null;
  released_at: string | null;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RollNoSlipStudentRow = {
  studentId: string;
  fullName: string;
  rollNumber: string;
  fatherName: string;
  phone: string;
  guardianPhone: string;
  program: string;
  className: string;
  yearLevel: number | null;
  section: string;
  sectionId: string;
  gender: string;
  sessionId: string;
  sessionLabel: string;
  programId: string;
  classId: string;
  totalBalance: number;
  oldestDueDate: string | null;
  unpaidLines: string[];
  category: RollNoSlipEligibilityCategory;
  canRelease: boolean;
  request: RollNoSlipRequest | null;
  requestedByName: string | null;
  approvedByName: string | null;
  releasedByName: string | null;
};

export type RollNoSlipFilters = {
  sessionId?: string;
  programId?: string;
  classId?: string;
  sectionId?: string;
  gender?: "boys" | "girls";
  yearLevel?: number;
  category?: RollNoSlipEligibilityCategory | "__all__";
  search?: string;
};

export const ROLL_SLIP_ACCESS_ROLES: AppRole[] = [
  "super_admin",
  "registrar",
  "finance_admin",
  "finance_officer",
];

export const ROLL_SLIP_CATEGORY_LABELS: Record<RollNoSlipEligibilityCategory, string> = {
  eligible: "Eligible",
  not_eligible: "Not eligible",
  pending_approval: "Pending approval",
  approved_exception: "Approved exception",
  released_with_dues: "Released with dues",
};

export function canAccessRollNoSlips(roles: AppRole[]): boolean {
  return roles.some((role) => ROLL_SLIP_ACCESS_ROLES.includes(role));
}

export function canApproveRollNoSlipRequests(roles: AppRole[]): boolean {
  return roles.includes("super_admin");
}

export function canRequestRollNoSlipException(roles: AppRole[]): boolean {
  return roles.some((role) =>
    ["super_admin", "registrar", "finance_admin", "finance_officer"].includes(role),
  );
}

export function canReleaseRollNoSlip(roles: AppRole[]): boolean {
  return roles.some((role) => ["super_admin", "registrar"].includes(role));
}

type StudentRow = {
  id: string;
  full_name: string;
  roll_number: string;
  father_name: string | null;
  phone: string | null;
  guardian_phone: string | null;
  academic_session_id: string | null;
  class_id: string | null;
  section_id: string | null;
  program_id: string | null;
  status: string;
  programs: { name?: string } | null;
  classes: { name?: string; year_level?: number } | null;
  sections: { name?: string; gender?: string } | null;
  academic_sessions: { label?: string } | null;
};

type InstallmentRow = {
  student_id: string;
  label: string;
  due_date: string;
  amount: number;
  paid_amount: number;
};

function sectionLabel(sections: StudentRow["sections"]) {
  if (!sections?.name) return "—";
  const gender = sections.gender === "girls" ? "Girls" : "Boys";
  return `${gender} — ${sections.name}`;
}

function categorizeStudent(
  totalBalance: number,
  request: RollNoSlipRequest | null,
): RollNoSlipEligibilityCategory {
  if (request?.status === "pending") return "pending_approval";
  if (request?.status === "approved") return "approved_exception";
  if (request?.status === "released" && totalBalance > 0.01) return "released_with_dues";
  if (totalBalance <= 0.01) return "eligible";
  return "not_eligible";
}

function canReleaseStudent(
  totalBalance: number,
  request: RollNoSlipRequest | null,
): boolean {
  if (totalBalance <= 0.01) return true;
  return request?.status === "approved";
}

function pickActiveRequest(requests: RollNoSlipRequest[]): RollNoSlipRequest | null {
  const priority: RollNoSlipRequestStatus[] = [
    "released",
    "approved",
    "pending",
    "rejected",
    "settled",
  ];
  const sorted = [...requests].sort((a, b) => {
    const pa = priority.indexOf(a.status);
    const pb = priority.indexOf(b.status);
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const active = sorted.find((r) => r.status !== "settled" && r.status !== "rejected");
  return active ?? sorted[0] ?? null;
}

export async function fetchRollNoSlipRows(sessionId?: string): Promise<RollNoSlipStudentRow[]> {
  let studentQuery = supabase
    .from("students")
    .select(
      "id, full_name, roll_number, father_name, phone, guardian_phone, academic_session_id, class_id, section_id, program_id, status, programs(name), classes(name, year_level), sections(name, gender), academic_sessions(label)",
    )
    .eq("status", "active")
    .order("full_name");

  if (sessionId) {
    studentQuery = studentQuery.eq("academic_session_id", sessionId);
  }

  const { data: students, error: studentErr } = await studentQuery;
  if (studentErr) throw studentErr;

  const studentIds = (students ?? []).map((s) => s.id);
  if (!studentIds.length) return [];

  const [{ data: installments, error: instErr }, { data: requests, error: reqErr }] =
    await Promise.all([
      supabase
        .from("student_fee_installments")
        .select("student_id, label, due_date, amount, paid_amount")
        .in("student_id", studentIds),
      supabase
        .from("roll_no_slip_requests")
        .select("*")
        .in("student_id", studentIds)
        .order("created_at", { ascending: false }),
    ]);

  if (instErr) {
    if (
      instErr.message.includes("roll_no_slip_requests") ||
      instErr.message.includes("schema cache")
    ) {
      throw new Error(
        "Roll no slip tables are missing. Run supabase/patch-roll-no-slip-requests.sql in Supabase SQL Editor.",
      );
    }
    throw instErr;
  }
  if (reqErr) {
    if (
      reqErr.message.includes("roll_no_slip_requests") ||
      reqErr.message.includes("schema cache")
    ) {
      throw new Error(
        "Roll no slip tables are missing. Run supabase/patch-roll-no-slip-requests.sql in Supabase SQL Editor.",
      );
    }
    throw reqErr;
  }

  const requestsByStudent = new Map<string, RollNoSlipRequest[]>();
  for (const row of (requests ?? []) as RollNoSlipRequest[]) {
    const list = requestsByStudent.get(row.student_id) ?? [];
    list.push(row);
    requestsByStudent.set(row.student_id, list);
  }

  const installmentsByStudent = new Map<string, InstallmentRow[]>();
  for (const row of (installments ?? []) as InstallmentRow[]) {
    const list = installmentsByStudent.get(row.student_id) ?? [];
    list.push(row);
    installmentsByStudent.set(row.student_id, list);
  }

  const staffIds = new Set<string>();
  for (const list of requestsByStudent.values()) {
    for (const req of list) {
      if (req.requested_by) staffIds.add(req.requested_by);
      if (req.approved_by) staffIds.add(req.approved_by);
      if (req.released_by) staffIds.add(req.released_by);
    }
  }

  const profileMap = new Map<string, string>();
  if (staffIds.size) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...staffIds]);
    for (const profile of profiles ?? []) {
      profileMap.set(profile.id, profile.full_name ?? profile.id);
    }
  }

  const rows: RollNoSlipStudentRow[] = [];

  for (const student of (students ?? []) as StudentRow[]) {
    const insts = installmentsByStudent.get(student.id) ?? [];
    let totalBalance = 0;
    let oldestDueDate: string | null = null;
    const unpaidLines: string[] = [];

    for (const inst of insts) {
      const balance = installmentBalance(inst);
      if (balance <= 0) continue;
      totalBalance += balance;
      unpaidLines.push(`${inst.label} (${inst.due_date}): ${balance}`);
      if (!oldestDueDate || inst.due_date < oldestDueDate) oldestDueDate = inst.due_date;
    }

    const studentRequests = requestsByStudent.get(student.id) ?? [];
    const request = pickActiveRequest(studentRequests);

    const activeRequest =
      request?.status === "settled" || request?.status === "rejected" ? null : request;
    const category = categorizeStudent(totalBalance, activeRequest);

    rows.push({
      studentId: student.id,
      fullName: student.full_name,
      rollNumber: student.roll_number,
      fatherName: student.father_name ?? "—",
      phone: student.phone ?? "",
      guardianPhone: student.guardian_phone ?? "",
      program: student.programs?.name ?? "—",
      programId: student.program_id ?? "",
      className: student.classes?.name ?? "—",
      classId: student.class_id ?? "",
      yearLevel: student.classes?.year_level ?? null,
      section: sectionLabel(student.sections),
      sectionId: student.section_id ?? "",
      gender: student.sections?.gender ?? "",
      sessionId: student.academic_session_id ?? "",
      sessionLabel: student.academic_sessions?.label ?? "—",
      totalBalance,
      oldestDueDate,
      unpaidLines,
      category,
      canRelease: canReleaseStudent(totalBalance, activeRequest),
      request: activeRequest,
      requestedByName: activeRequest?.requested_by
        ? profileMap.get(activeRequest.requested_by) ?? null
        : null,
      approvedByName: activeRequest?.approved_by
        ? profileMap.get(activeRequest.approved_by) ?? null
        : null,
      releasedByName: activeRequest?.released_by
        ? profileMap.get(activeRequest.released_by) ?? null
        : null,
    });
  }

  return rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function filterRollNoSlipRows(
  rows: RollNoSlipStudentRow[],
  filters: RollNoSlipFilters,
): RollNoSlipStudentRow[] {
  const q = filters.search?.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.sessionId && row.sessionId !== filters.sessionId) return false;
    if (filters.programId && row.programId !== filters.programId) return false;
    if (filters.classId && row.classId !== filters.classId) return false;
    if (filters.sectionId && row.sectionId !== filters.sectionId) return false;
    if (filters.gender && row.gender !== filters.gender) return false;
    if (filters.yearLevel != null && row.yearLevel !== filters.yearLevel) return false;
    if (filters.category && filters.category !== "__all__" && row.category !== filters.category) {
      return false;
    }
    if (q) {
      const hay = `${row.fullName} ${row.rollNumber} ${row.fatherName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export async function createRollNoSlipRequest(params: {
  studentId: string;
  academicSessionId: string | null;
  classId: string | null;
  sectionId: string | null;
  outstandingAmount: number;
  guarantorName: string;
  guarantorPhone?: string;
  promisedPaymentDate?: string;
  reason?: string;
}) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("You must be signed in.");

  const { data: existing } = await supabase
    .from("roll_no_slip_requests")
    .select("id, status")
    .eq("student_id", params.studentId)
    .in("status", ["pending", "approved", "released"])
    .maybeSingle();

  if (existing) {
    throw new Error("This student already has an active roll no slip request.");
  }

  const { data, error } = await supabase
    .from("roll_no_slip_requests")
    .insert({
      student_id: params.studentId,
      academic_session_id: params.academicSessionId,
      class_id: params.classId,
      section_id: params.sectionId,
      outstanding_amount_at_request: params.outstandingAmount,
      guarantor_name: params.guarantorName.trim(),
      guarantor_phone: params.guarantorPhone?.trim() || null,
      promised_payment_date: params.promisedPaymentDate || null,
      reason: params.reason?.trim() || null,
      requested_by: user.user.id,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw error;
  return data as RollNoSlipRequest;
}

export async function approveRollNoSlipRequest(
  requestId: string,
  notes?: string,
  approvedAmount?: number,
) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("You must be signed in.");

  const { data, error } = await supabase
    .from("roll_no_slip_requests")
    .update({
      status: "approved",
      approved_by: user.user.id,
      approved_at: new Date().toISOString(),
      approval_notes: notes?.trim() || null,
      approved_amount: approvedAmount ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select()
    .single();

  if (error) throw error;
  return data as RollNoSlipRequest;
}

export async function rejectRollNoSlipRequest(requestId: string, notes?: string) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("You must be signed in.");

  const { data, error } = await supabase
    .from("roll_no_slip_requests")
    .update({
      status: "rejected",
      rejected_by: user.user.id,
      rejected_at: new Date().toISOString(),
      rejection_notes: notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select()
    .single();

  if (error) throw error;
  return data as RollNoSlipRequest;
}

export async function releaseRollNoSlip(requestId: string) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("You must be signed in.");

  const { data: request, error: fetchErr } = await supabase
    .from("roll_no_slip_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (fetchErr) throw fetchErr;

  const req = request as RollNoSlipRequest;
  if (req.status !== "approved") {
    throw new Error("Only approved requests can be marked as released.");
  }

  const { data: installments } = await supabase
    .from("student_fee_installments")
    .select("amount, paid_amount")
    .eq("student_id", req.student_id);

  const totalBalance = (installments ?? []).reduce(
    (sum, row) => sum + installmentBalance(row),
    0,
  );

  const { data, error } = await supabase
    .from("roll_no_slip_requests")
    .update({
      status: totalBalance <= 0.01 ? "settled" : "released",
      released_by: user.user.id,
      released_at: new Date().toISOString(),
      settled_at: totalBalance <= 0.01 ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .select()
    .single();

  if (error) throw error;
  return data as RollNoSlipRequest;
}

export async function fetchRollNoSlipPendingRecoveries() {
  const { data, error } = await supabase
    .from("roll_no_slip_requests")
    .select(
      "*, students(full_name, roll_number, programs(name), sections(name, gender))",
    )
    .in("status", ["approved", "released"])
    .order("released_at", { ascending: false, nullsFirst: false });

  if (error) {
    if (error.message.includes("roll_no_slip_requests")) {
      return { count: 0, totalAmount: 0, rows: [] as RollNoSlipRequest[] };
    }
    throw error;
  }

  const rows = (data ?? []) as RollNoSlipRequest[];
  const studentIds = [...new Set(rows.map((r) => r.student_id))];
  if (!studentIds.length) return { count: 0, totalAmount: 0, rows: [] };

  const { data: installments } = await supabase
    .from("student_fee_installments")
    .select("student_id, amount, paid_amount")
    .in("student_id", studentIds);

  const balanceByStudent = new Map<string, number>();
  for (const inst of installments ?? []) {
    const current = balanceByStudent.get(inst.student_id) ?? 0;
    balanceByStudent.set(inst.student_id, current + installmentBalance(inst));
  }

  const pending = rows.filter((row) => (balanceByStudent.get(row.student_id) ?? 0) > 0.01);
  const totalAmount = pending.reduce(
    (sum, row) => sum + (balanceByStudent.get(row.student_id) ?? 0),
    0,
  );

  return { count: pending.length, totalAmount, rows: pending };
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function exportRollNoSlipReport(rows: RollNoSlipStudentRow[], filenamePrefix = "roll-no-slips") {
  const header = [
    "Admission no",
    "Student",
    "Father",
    "Phone",
    "Guardian phone",
    "Program",
    "Class",
    "Section",
    "Session",
    "Total unpaid",
    "Oldest due date",
    "Unpaid items",
    "Eligibility",
    "Request status",
    "Approved amount",
    "Guarantor",
    "Guarantor phone",
    "Promised payment date",
    "Requested by",
    "Approved by",
    "Released by",
    "Released at",
    "Reason",
  ];

  const data = rows.map((row) => [
    row.rollNumber,
    row.fullName,
    row.fatherName,
    row.phone,
    row.guardianPhone,
    row.program,
    row.className,
    row.section,
    row.sessionLabel,
    String(row.totalBalance),
    row.oldestDueDate ?? "",
    row.unpaidLines.join("; "),
    ROLL_SLIP_CATEGORY_LABELS[row.category],
    row.request?.status ?? "",
    row.request?.approved_amount != null ? String(row.request.approved_amount) : "",
    row.request?.guarantor_name ?? "",
    row.request?.guarantor_phone ?? "",
    row.request?.promised_payment_date ?? "",
    row.requestedByName ?? "",
    row.approvedByName ?? "",
    row.releasedByName ?? "",
    row.request?.released_at ?? "",
    row.request?.reason ?? "",
  ]);

  const totalUnpaid = rows.reduce((sum, row) => sum + row.totalBalance, 0);
  const totalApproved = rows.reduce(
    (sum, row) => sum + (row.request?.approved_amount != null ? Number(row.request.approved_amount) : 0),
    0,
  );

  const footer =
    rows.length > 0
      ? [
          [
            "TOTAL",
            `${rows.length} student${rows.length === 1 ? "" : "s"}`,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            String(totalUnpaid),
            "",
            "",
            "",
            "",
            totalApproved > 0 ? String(totalApproved) : "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
          ],
        ]
      : [];

  const lines = [
    header.join(","),
    ...data.map((row) => row.map(csvEscape).join(",")),
    ...footer.map((row) => row.map(csvEscape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
