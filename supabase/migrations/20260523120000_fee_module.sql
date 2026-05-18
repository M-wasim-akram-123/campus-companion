-- Fee policies, scholarships, student fee plans & installments

CREATE TYPE public.fee_component_type AS ENUM (
  'admission_fee',
  'annual_fund',
  'annual_fee',
  'semester_fee',
  'board_admission_fee'
);

CREATE TYPE public.annual_fee_schedule_type AS ENUM (
  'monthly',
  'quarterly',
  'custom'
);

CREATE TABLE public.admission_fee_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, academic_session_id)
);

CREATE TABLE public.fee_policy_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.admission_fee_policies(id) ON DELETE CASCADE,
  component_type public.fee_component_type NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  UNIQUE (policy_id, component_type)
);

CREATE TABLE public.fee_scholarship_slabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.admission_fee_policies(id) ON DELETE CASCADE,
  min_percentage NUMERIC(5, 2) NOT NULL CHECK (min_percentage >= 0),
  max_percentage NUMERIC(5, 2) CHECK (max_percentage IS NULL OR max_percentage >= min_percentage),
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  applies_to public.fee_component_type NOT NULL DEFAULT 'admission_fee',
  label TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE public.student_fee_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.admission_fee_policies(id) ON DELETE SET NULL,
  admission_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  annual_fund NUMERIC(12, 2) NOT NULL DEFAULT 0,
  annual_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  semester_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  board_admission_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  scholarship_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  scholarship_label TEXT,
  pay_at_admission NUMERIC(12, 2) NOT NULL DEFAULT 0,
  annual_fee_schedule public.annual_fee_schedule_type NOT NULL DEFAULT 'quarterly',
  installment_count INT NOT NULL DEFAULT 4 CHECK (installment_count >= 1),
  start_after_months INT NOT NULL DEFAULT 2 CHECK (start_after_months >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.student_fee_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_plan_id UUID NOT NULL REFERENCES public.student_fee_plans(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  component_type public.fee_component_type,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  due_date DATE NOT NULL,
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fee_policies_program ON public.admission_fee_policies (program_id);
CREATE INDEX idx_fee_installments_student ON public.student_fee_installments (student_id);
CREATE INDEX idx_fee_installments_due ON public.student_fee_installments (due_date);

ALTER TABLE public.admission_fee_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_policy_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_scholarship_slabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fee_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fee_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated fee policies" ON public.admission_fee_policies
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated fee components" ON public.fee_policy_components
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated scholarship slabs" ON public.fee_scholarship_slabs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated student fee plans" ON public.student_fee_plans
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated student installments" ON public.student_fee_installments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_fee_policies_updated BEFORE UPDATE ON public.admission_fee_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_student_fee_plans_updated BEFORE UPDATE ON public.student_fee_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Per-session admission number sequence helper
CREATE TABLE public.admission_number_counters (
  academic_session_id UUID PRIMARY KEY REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  last_number INT NOT NULL DEFAULT 0
);

ALTER TABLE public.admission_number_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated admission counters" ON public.admission_number_counters
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.next_admission_number(p_session_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INT;
  v_next INT;
BEGIN
  SELECT start_year INTO v_year FROM public.academic_sessions WHERE id = p_session_id;
  IF v_year IS NULL THEN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
  END IF;

  INSERT INTO public.admission_number_counters (academic_session_id, last_number)
  VALUES (p_session_id, 1)
  ON CONFLICT (academic_session_id) DO UPDATE
    SET last_number = admission_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN format('ADM-%s-%s', v_year, lpad(v_next::text, 5, '0'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_admission_number(UUID) TO authenticated;
