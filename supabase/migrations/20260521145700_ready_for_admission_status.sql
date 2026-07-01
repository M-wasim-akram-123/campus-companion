ALTER TYPE public.inquiry_status ADD VALUE IF NOT EXISTS 'ready_for_admission';

NOTIFY pgrst, 'reload schema';
