-- Father name, gender, optional assignee on inquiries

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS father_name TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inquiries_assigned_to ON public.inquiries (assigned_to);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_by ON public.inquiries (created_by);
