-- Run in Supabase SQL Editor if inquiries table already exists (after bootstrap)

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS father_name TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inquiries_assigned_to ON public.inquiries (assigned_to);

NOTIFY pgrst, 'reload schema';
