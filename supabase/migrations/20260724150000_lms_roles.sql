-- Phase 1 LMS roles + any missing staff roles referenced by LMS foundation.
-- Run/commit this before 20260724151000_lms_foundation.sql because
-- PostgreSQL enum values cannot always be used in the same transaction that adds them.

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

NOTIFY pgrst, 'reload schema';
