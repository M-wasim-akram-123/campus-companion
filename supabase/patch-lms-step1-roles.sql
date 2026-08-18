-- Run this FIRST (alone), then run migrations/20260724151000_lms_foundation.sql
-- in a SEPARATE SQL Editor query.
--
-- Adds every app_role value the LMS foundation policies/triggers reference.
-- Safe to re-run: IF NOT EXISTS.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'registrar';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'campus_incharge';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_officer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cashier';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'exam_officer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sub_admission_officer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hod';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'academic_coordinator';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'bs_coordinator';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'bs_finance_admin';

NOTIFY pgrst, 'reload schema';
