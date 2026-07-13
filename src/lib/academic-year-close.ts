import type { SupabaseClient } from "@supabase/supabase-js";
import {
  academicYearElapsed,
  ordinalYearLabel,
} from "@/lib/academic";
import { installmentBalance, fetchBadDebtByInstallment } from "@/lib/finance";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

export type YearCloseResult = {
  closedYears: number;
  studentsSnapshotted: number;
  errors: { sessionId: string; academicYearStart: number; message: string }[];
};

/** Academic year Jul Y – Jun Y+1 closes on or after 30 June Y+1. */
export function isYearEndCloseDue(academicYearStart: number, now = new Date()): boolean {
  const closeDate = new Date(academicYearStart + 1, 5, 30);
  return now >= closeDate;
}

export function academicYearLabel(academicYearStart: number): string {
  return `${academicYearStart}–${academicYearStart + 1}`;
}

export function feeCycleForAcademicYear(sessionStartYear: number, academicYearStart: number): number {
  return academicYearStart - sessionStartYear + 1;
}

async function sumLedgerCredits(
  client: Db,
  studentIds: string[],
): Promise<{ badDebt: number; waivers: number }> {
  if (!studentIds.length) return { badDebt: 0, waivers: 0 };
  const { data } = await client
    .from("student_finance_ledger")
    .select("entry_type, credit")
    .in("student_id", studentIds)
    .in("entry_type", ["bad_debt", "waiver"]);
  let badDebt = 0;
  let waivers = 0;
  for (const row of data ?? []) {
    const credit = Number(row.credit ?? 0);
    if (row.entry_type === "bad_debt") badDebt += credit;
    if (row.entry_type === "waiver") waivers += credit;
  }
  return { badDebt, waivers };
}

export async function runAcademicYearCloseIfDue(
  client: Db,
  options?: { now?: Date; sessionId?: string },
): Promise<YearCloseResult> {
  const now = options?.now ?? new Date();

  let sessionQuery = client.from("academic_sessions").select("id, start_year, end_year, label");
  if (options?.sessionId) {
    sessionQuery = sessionQuery.eq("id", options.sessionId);
  }
  const { data: sessions, error: sessionErr } = await sessionQuery;
  if (sessionErr) throw sessionErr;

  const result: YearCloseResult = {
    closedYears: 0,
    studentsSnapshotted: 0,
    errors: [],
  };

  for (const session of sessions ?? []) {
    const elapsed = academicYearElapsed(session.start_year, now);
    for (let cycle = 1; cycle <= Math.max(1, elapsed); cycle += 1) {
      const academicYearStart = session.start_year + (cycle - 1);
      if (!isYearEndCloseDue(academicYearStart, now)) continue;

      const { data: existing } = await client
        .from("session_academic_year_closes")
        .select("id")
        .eq("academic_session_id", session.id)
        .eq("academic_year_start", academicYearStart)
        .maybeSingle();
      if (existing) continue;

      try {
        const { data: students, error: stErr } = await client
          .from("students")
          .select("id, section_id, classes(year_level)")
          .eq("academic_session_id", session.id)
          .eq("status", "active")
          .eq("enrollment_type", "regular");
        if (stErr) throw stErr;

        const studentIds = (students ?? []).map((s) => s.id);
        if (!studentIds.length) {
          await client.from("session_academic_year_closes").insert({
            academic_session_id: session.id,
            academic_year_start: academicYearStart,
            fee_cycle: cycle,
            total_payable: 0,
            total_collected: 0,
            total_outstanding: 0,
            total_bad_debt: 0,
            total_waivers: 0,
            student_count: 0,
            metadata: { label: academicYearLabel(academicYearStart) },
          });
          result.closedYears += 1;
          continue;
        }

        const badDebtByInstallment = await fetchBadDebtByInstallment(studentIds, client);

        const { data: installments, error: instErr } = await client
          .from("student_fee_installments")
          .select("id, student_id, amount, paid_amount, status, fee_cycle, academic_year_start")
          .in("student_id", studentIds)
          .eq("fee_cycle", cycle);
        if (instErr) throw instErr;

        const byStudent = new Map<string, { payable: number; collected: number; outstanding: number }>();
        for (const inst of installments ?? []) {
          const balance = installmentBalance(inst, badDebtByInstallment.get(inst.id) ?? 0);
          const amt = Number(inst.amount);
          const paid = Number(inst.paid_amount);
          const cur = byStudent.get(inst.student_id) ?? { payable: 0, collected: 0, outstanding: 0 };
          cur.payable += amt;
          cur.collected += paid;
          cur.outstanding += balance;
          byStudent.set(inst.student_id, cur);
        }

        const studentRows = [];
        let totalPayable = 0;
        let totalCollected = 0;
        let totalOutstanding = 0;

        for (const st of students ?? []) {
          const totals = byStudent.get(st.id) ?? { payable: 0, collected: 0, outstanding: 0 };
          totalPayable += totals.payable;
          totalCollected += totals.collected;
          totalOutstanding += totals.outstanding;
          studentRows.push({
            student_id: st.id,
            academic_session_id: session.id,
            academic_year_start: academicYearStart,
            fee_cycle: cycle,
            payable: totals.payable,
            collected: totals.collected,
            outstanding: totals.outstanding,
            class_year_level: (st.classes as { year_level?: number } | null)?.year_level ?? null,
            section_id: st.section_id,
          });
        }

        const { badDebt, waivers } = await sumLedgerCredits(client, studentIds);

        const { error: insertStudentsErr } = await client
          .from("student_academic_year_closes")
          .insert(studentRows);
        if (insertStudentsErr) throw insertStudentsErr;

        const { error: insertSessionErr } = await client.from("session_academic_year_closes").insert({
          academic_session_id: session.id,
          academic_year_start: academicYearStart,
          fee_cycle: cycle,
          total_payable: totalPayable,
          total_collected: totalCollected,
          total_outstanding: totalOutstanding,
          total_bad_debt: badDebt,
          total_waivers: waivers,
          student_count: studentIds.length,
          metadata: {
            label: academicYearLabel(academicYearStart),
            cycle_label: ordinalYearLabel(cycle),
          },
        });
        if (insertSessionErr) throw insertSessionErr;

        result.closedYears += 1;
        result.studentsSnapshotted += studentRows.length;
      } catch (err) {
        result.errors.push({
          sessionId: session.id,
          academicYearStart,
          message: err instanceof Error ? err.message : "Year close failed",
        });
      }
    }
  }

  return result;
}

export async function runAcademicYearCloseAndPromotions(
  client: Db,
  options?: { now?: Date; sessionId?: string },
) {
  const { runSessionPromotions } = await import("@/lib/student-promotion");
  const closeResult = await runAcademicYearCloseIfDue(client, options);
  const promotionResult = await runSessionPromotions(client, options);
  return { closeResult, promotionResult };
}
