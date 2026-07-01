ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guardian_name TEXT,
  ADD COLUMN IF NOT EXISTS guardian_phone TEXT,
  ADD COLUMN IF NOT EXISTS guardian_occupation TEXT,
  ADD COLUMN IF NOT EXISTS guardian_details TEXT;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS guardian_occupation TEXT,
  ADD COLUMN IF NOT EXISTS guardian_details TEXT;

CREATE INDEX IF NOT EXISTS idx_inquiries_academic_session_id ON public.inquiries (academic_session_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_class_id ON public.inquiries (class_id);

NOTIFY pgrst, 'reload schema';
