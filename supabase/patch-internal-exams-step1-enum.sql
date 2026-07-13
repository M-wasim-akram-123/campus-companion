-- STEP 1 of 2 — Internal exams
-- Run this ALONE in Supabase SQL editor, then run patch-internal-exams.sql.
-- PostgreSQL requires the new enum value to be committed before it can be used elsewhere.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'exam_officer';

NOTIFY pgrst, 'reload schema';
