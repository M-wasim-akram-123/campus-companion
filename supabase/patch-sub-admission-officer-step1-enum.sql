-- STEP 1 of 2 — Sub Admission Officer
-- Run this ALONE in Supabase SQL editor, then run patch-sub-admission-officer.sql.
-- PostgreSQL requires the new enum value to be committed before it can be used elsewhere.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sub_admission_officer';

NOTIFY pgrst, 'reload schema';
