-- Run in Supabase SQL Editor to add the inquiry stage before conversion.

ALTER TYPE public.inquiry_status ADD VALUE IF NOT EXISTS 'ready_for_admission';

NOTIFY pgrst, 'reload schema';
