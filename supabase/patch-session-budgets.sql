-- Session revenue targets (budget vs actual on finance dashboard)
-- Run in Supabase SQL editor after patch-finance.sql

CREATE TABLE IF NOT EXISTS public.session_finance_budgets (
  academic_session_id UUID PRIMARY KEY REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  total_target NUMERIC(14, 2) NOT NULL DEFAULT 0,
  admission_fee_target NUMERIC(12, 2) NOT NULL DEFAULT 0,
  annual_fund_target NUMERIC(12, 2) NOT NULL DEFAULT 0,
  annual_fee_target NUMERIC(12, 2) NOT NULL DEFAULT 0,
  semester_fee_target NUMERIC(12, 2) NOT NULL DEFAULT 0,
  board_admission_fee_target NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.session_finance_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_finance_budgets_all" ON public.session_finance_budgets;
CREATE POLICY "session_finance_budgets_all" ON public.session_finance_budgets
  FOR ALL USING (true) WITH CHECK (true);
