-- Flexible fee policies: default schedule templates + admission payment breakdown

ALTER TABLE public.admission_fee_policies
  ADD COLUMN IF NOT EXISTS default_schedule public.annual_fee_schedule_type DEFAULT 'quarterly',
  ADD COLUMN IF NOT EXISTS default_installment_count INT NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS default_start_after_months INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS default_admission_components public.fee_component_type[] DEFAULT ARRAY['admission_fee', 'annual_fund']::public.fee_component_type[];

CREATE TABLE IF NOT EXISTS public.fee_policy_installment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.admission_fee_policies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  component_type public.fee_component_type,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  due_months_after_admission INT NOT NULL DEFAULT 0,
  due_day INT CHECK (due_day IS NULL OR (due_day >= 1 AND due_day <= 28)),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fee_policy_templates_policy ON public.fee_policy_installment_templates (policy_id);

ALTER TABLE public.fee_policy_installment_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated fee policy templates" ON public.fee_policy_installment_templates;
CREATE POLICY "Authenticated fee policy templates" ON public.fee_policy_installment_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.student_fee_plans
  ADD COLUMN IF NOT EXISTS admission_payment_breakdown JSONB;
