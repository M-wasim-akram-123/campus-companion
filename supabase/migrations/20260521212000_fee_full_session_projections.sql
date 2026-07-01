ALTER TABLE public.admission_fee_policies
  ADD COLUMN IF NOT EXISTS projection_cycle_type TEXT NOT NULL DEFAULT 'annual'
    CHECK (projection_cycle_type IN ('annual', 'semester')),
  ADD COLUMN IF NOT EXISTS projection_cycle_count INTEGER NOT NULL DEFAULT 1 CHECK (projection_cycle_count >= 1),
  ADD COLUMN IF NOT EXISTS increment_type TEXT NOT NULL DEFAULT 'percentage'
    CHECK (increment_type IN ('none', 'percentage', 'fixed')),
  ADD COLUMN IF NOT EXISTS increment_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_fund_frequency TEXT NOT NULL DEFAULT 'every_cycle'
    CHECK (annual_fund_frequency IN ('admission_only', 'every_cycle'));

CREATE TABLE IF NOT EXISTS public.student_fee_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_plan_id UUID REFERENCES public.student_fee_plans(id) ON DELETE CASCADE,
  cycle_no INTEGER NOT NULL,
  cycle_label TEXT NOT NULL,
  component_type public.fee_component_type,
  policy_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  scholarship_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.student_fee_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated student fee projections" ON public.student_fee_projections
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_student_fee_projections_student ON public.student_fee_projections (student_id);
CREATE INDEX IF NOT EXISTS idx_student_fee_projections_plan ON public.student_fee_projections (fee_plan_id);

NOTIFY pgrst, 'reload schema';
