-- Split legacy board admission fee into Board Registration Fees and Board Examination Fees.
-- Safe to run multiple times.

ALTER TYPE public.fee_component_type ADD VALUE IF NOT EXISTS 'board_registration_fee';
ALTER TYPE public.fee_component_type ADD VALUE IF NOT EXISTS 'board_examination_fee';

ALTER TABLE public.student_fee_plans
  ADD COLUMN IF NOT EXISTS board_registration_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS board_examination_fee NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.session_finance_budgets
  ADD COLUMN IF NOT EXISTS board_registration_fee_target NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS board_examination_fee_target NUMERIC(12, 2) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
