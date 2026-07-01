-- Add student lifecycle statuses used in the student profile UI.
-- Safe to run multiple times.

ALTER TYPE public.student_status ADD VALUE IF NOT EXISTS 'left';
ALTER TYPE public.student_status ADD VALUE IF NOT EXISTS 'bad_debt';

NOTIFY pgrst, 'reload schema';
