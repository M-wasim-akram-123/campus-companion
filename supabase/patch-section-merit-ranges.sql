-- Run in Supabase SQL Editor to add merit percentage ranges for automatic section assignment.

ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS merit_min_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS merit_max_percentage NUMERIC(5,2);

CREATE INDEX IF NOT EXISTS idx_sections_merit_range
  ON public.sections (class_id, session_id, gender, merit_min_percentage, merit_max_percentage);

NOTIFY pgrst, 'reload schema';
