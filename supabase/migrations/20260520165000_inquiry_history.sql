ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

UPDATE public.inquiries
SET assigned_at = COALESCE(assigned_at, updated_at, created_at)
WHERE assigned_to IS NOT NULL
  AND assigned_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inquiry_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL DEFAULT 'visit'
    CHECK (interaction_type IN ('visit', 'call', 'message', 'follow_up', 'status_change', 'assignment', 'conversion', 'note')),
  remarks TEXT NOT NULL,
  follow_up_date DATE,
  status_after public.inquiry_status,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inquiry_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view inquiry interactions" ON public.inquiry_interactions
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Staff insert inquiry interactions" ON public.inquiry_interactions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Super admin delete inquiry interactions" ON public.inquiry_interactions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_inquiries_assigned_to ON public.inquiries (assigned_to);
CREATE INDEX IF NOT EXISTS idx_inquiries_assigned_at ON public.inquiries (assigned_at);
CREATE INDEX IF NOT EXISTS idx_inquiries_converted_by ON public.inquiries (converted_by);
CREATE INDEX IF NOT EXISTS idx_inquiries_converted_at ON public.inquiries (converted_at);
CREATE INDEX IF NOT EXISTS idx_inquiry_interactions_inquiry_id ON public.inquiry_interactions (inquiry_id);
CREATE INDEX IF NOT EXISTS idx_inquiry_interactions_created_by ON public.inquiry_interactions (created_by);
CREATE INDEX IF NOT EXISTS idx_inquiry_interactions_follow_up_date ON public.inquiry_interactions (follow_up_date);

NOTIFY pgrst, 'reload schema';
