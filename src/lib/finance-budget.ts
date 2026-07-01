import { supabase } from "@/integrations/supabase/client";
import { FEE_COMPONENTS, type FeeComponentType } from "@/lib/fees-types";

export type SessionFinanceBudget = {
  academic_session_id: string;
  total_target: number;
  admission_fee_target: number;
  annual_fund_target: number;
  annual_fee_target: number;
  semester_fee_target: number;
  board_registration_fee_target: number;
  board_examination_fee_target: number;
  notes: string | null;
};

const BUDGET_KEYS: FeeComponentType[] = FEE_COMPONENTS.map((c) => c.key);

export function budgetTargetForComponent(
  budget: SessionFinanceBudget | null,
  key: FeeComponentType,
): number {
  if (!budget) return 0;
  return Number((budget as Record<string, number>)[`${key}_target`] ?? 0);
}

export async function fetchSessionFinanceBudget(sessionId: string): Promise<SessionFinanceBudget | null> {
  const { data, error } = await (supabase as { from: (t: string) => ReturnType<typeof supabase.from> })
    .from("session_finance_budgets")
    .select("*")
    .eq("academic_session_id", sessionId)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.message.includes("does not exist")) return null;
    throw error;
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    academic_session_id: row.academic_session_id as string,
    total_target: Number(row.total_target ?? 0),
    admission_fee_target: Number(row.admission_fee_target ?? 0),
    annual_fund_target: Number(row.annual_fund_target ?? 0),
    annual_fee_target: Number(row.annual_fee_target ?? 0),
    semester_fee_target: Number(row.semester_fee_target ?? 0),
    board_registration_fee_target: Number(row.board_registration_fee_target ?? 0),
    board_examination_fee_target: Number(row.board_examination_fee_target ?? 0),
    notes: (row.notes as string | null) ?? null,
  };
}

export async function saveSessionFinanceBudget(
  sessionId: string,
  input: Omit<SessionFinanceBudget, "academic_session_id">,
): Promise<SessionFinanceBudget> {
  const payload = {
    academic_session_id: sessionId,
    total_target: input.total_target,
    admission_fee_target: input.admission_fee_target,
    annual_fund_target: input.annual_fund_target,
    annual_fee_target: input.annual_fee_target,
    semester_fee_target: input.semester_fee_target,
    board_registration_fee_target: input.board_registration_fee_target,
    board_examination_fee_target: input.board_examination_fee_target,
    notes: input.notes,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await (supabase as { from: (t: string) => ReturnType<typeof supabase.from> })
    .from("session_finance_budgets")
    .upsert(payload, { onConflict: "academic_session_id" })
    .select()
    .single();
  if (error) throw error;
  const row = data as Record<string, unknown>;
  return {
    academic_session_id: sessionId,
    total_target: Number(row.total_target ?? 0),
    admission_fee_target: Number(row.admission_fee_target ?? 0),
    annual_fund_target: Number(row.annual_fund_target ?? 0),
    annual_fee_target: Number(row.annual_fee_target ?? 0),
    semester_fee_target: Number(row.semester_fee_target ?? 0),
    board_registration_fee_target: Number(row.board_registration_fee_target ?? 0),
    board_examination_fee_target: Number(row.board_examination_fee_target ?? 0),
    notes: (row.notes as string | null) ?? null,
  };
}

export function emptyBudgetForm(): Omit<SessionFinanceBudget, "academic_session_id"> {
  return {
    total_target: 0,
    admission_fee_target: 0,
    annual_fund_target: 0,
    annual_fee_target: 0,
    semester_fee_target: 0,
    board_registration_fee_target: 0,
    board_examination_fee_target: 0,
    notes: null,
  };
}

export { BUDGET_KEYS };
