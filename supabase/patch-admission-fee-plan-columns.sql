-- Patch: ensure admission fee-plan columns exist.
-- Run this if admission confirmation fails on student_fee_plans with a 400/schema-cache error.

ALTER TYPE public.fee_component_type ADD VALUE IF NOT EXISTS 'board_registration_fee';
ALTER TYPE public.fee_component_type ADD VALUE IF NOT EXISTS 'board_examination_fee';

ALTER TABLE public.student_fee_plans
  ADD COLUMN IF NOT EXISTS board_registration_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS board_examination_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admission_payment_breakdown JSONB;

NOTIFY pgrst, 'reload schema';
