-- ====================================================================
-- Consolidated pending migrations + finance enhancements (idempotent)
-- ====================================================================

-- ---- inquiries / students extra columns ----
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS matric_school TEXT,
  ADD COLUMN IF NOT EXISTS matric_marks_obtained NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS matric_marks_total NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS father_name TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS matric_school TEXT,
  ADD COLUMN IF NOT EXISTS matric_marks_obtained NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS matric_marks_total NUMERIC(6,2);

-- ---- academic_sessions ----
DO $$ BEGIN
  CREATE TYPE public.section_gender AS ENUM ('boys', 'girls');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.academic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL UNIQUE,
  start_year INT NOT NULL,
  end_year INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.academic_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read sessions" ON public.academic_sessions;
CREATE POLICY "Authenticated read sessions" ON public.academic_sessions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Staff manage sessions" ON public.academic_sessions;
CREATE POLICY "Staff manage sessions" ON public.academic_sessions FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO public.academic_sessions (label, start_year, end_year, is_active)
VALUES ('2025-2026', 2025, 2026, true)
ON CONFLICT (label) DO NOTHING;

-- ---- sections: add gender / session ----
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS gender public.section_gender NOT NULL DEFAULT 'boys';

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preferred_section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL;

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS preferred_section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL;

-- Open RLS for inquiries/students to authenticated staff
DROP POLICY IF EXISTS "Staff view inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Staff insert inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Staff update inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Staff delete inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Authenticated inquiries" ON public.inquiries;
CREATE POLICY "Authenticated inquiries" ON public.inquiries FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Staff view students" ON public.students;
DROP POLICY IF EXISTS "Staff insert students" ON public.students;
DROP POLICY IF EXISTS "Staff update students" ON public.students;
DROP POLICY IF EXISTS "Super admin delete students" ON public.students;
DROP POLICY IF EXISTS "Authenticated students" ON public.students;
CREATE POLICY "Authenticated students" ON public.students FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- programs / classes / sections: staff manage
DROP POLICY IF EXISTS "Super admin manage programs" ON public.programs;
DROP POLICY IF EXISTS "Staff manage programs" ON public.programs;
CREATE POLICY "Staff manage programs" ON public.programs FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Super admin manage classes" ON public.classes;
DROP POLICY IF EXISTS "Staff manage classes" ON public.classes;
CREATE POLICY "Staff manage classes" ON public.classes FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "Super admin manage sections" ON public.sections;
DROP POLICY IF EXISTS "Staff manage sections" ON public.sections;
CREATE POLICY "Staff manage sections" ON public.sections FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated;

-- storage bucket policies
DROP POLICY IF EXISTS "Authenticated read student photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload student photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update student photos" ON storage.objects;
CREATE POLICY "Authenticated read student photos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'student-photos');
CREATE POLICY "Authenticated upload student photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'student-photos');
CREATE POLICY "Authenticated update student photos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'student-photos');

-- ====================================================================
-- Fee module
-- ====================================================================
DO $$ BEGIN
  CREATE TYPE public.fee_component_type AS ENUM (
    'admission_fee','annual_fund','annual_fee','semester_fee','board_admission_fee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.annual_fee_schedule_type AS ENUM ('monthly','quarterly','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.admission_fee_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_schedule public.annual_fee_schedule_type DEFAULT 'quarterly',
  default_installment_count INT NOT NULL DEFAULT 4,
  default_start_after_months INT NOT NULL DEFAULT 2,
  default_admission_components public.fee_component_type[] DEFAULT ARRAY['admission_fee','annual_fund']::public.fee_component_type[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, academic_session_id)
);

CREATE TABLE IF NOT EXISTS public.fee_policy_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.admission_fee_policies(id) ON DELETE CASCADE,
  component_type public.fee_component_type NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (policy_id, component_type)
);

CREATE TABLE IF NOT EXISTS public.fee_scholarship_slabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.admission_fee_policies(id) ON DELETE CASCADE,
  min_percentage NUMERIC(5,2) NOT NULL,
  max_percentage NUMERIC(5,2),
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  applies_to public.fee_component_type NOT NULL DEFAULT 'admission_fee',
  label TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.fee_policy_installment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.admission_fee_policies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  component_type public.fee_component_type,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_months_after_admission INT NOT NULL DEFAULT 0,
  due_day INT,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.student_fee_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.admission_fee_policies(id) ON DELETE SET NULL,
  admission_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  annual_fund NUMERIC(12,2) NOT NULL DEFAULT 0,
  annual_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  semester_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  board_admission_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  scholarship_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  scholarship_label TEXT,
  pay_at_admission NUMERIC(12,2) NOT NULL DEFAULT 0,
  annual_fee_schedule public.annual_fee_schedule_type NOT NULL DEFAULT 'quarterly',
  installment_count INT NOT NULL DEFAULT 4,
  start_after_months INT NOT NULL DEFAULT 2,
  admission_payment_breakdown JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_fee_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  fee_plan_id UUID NOT NULL REFERENCES public.student_fee_plans(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  component_type public.fee_component_type,
  amount NUMERIC(12,2) NOT NULL,
  due_date DATE NOT NULL,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admission_number_counters (
  academic_session_id UUID PRIMARY KEY REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  last_number INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fee_installments_student ON public.student_fee_installments (student_id);
CREATE INDEX IF NOT EXISTS idx_fee_installments_due ON public.student_fee_installments (due_date);

ALTER TABLE public.admission_fee_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_policy_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_scholarship_slabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_policy_installment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fee_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fee_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_number_counters ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['admission_fee_policies','fee_policy_components','fee_scholarship_slabs','fee_policy_installment_templates','student_fee_plans','student_fee_installments','admission_number_counters']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Authenticated %s" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.next_admission_number(p_session_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year INT; v_next INT;
BEGIN
  SELECT start_year INTO v_year FROM public.academic_sessions WHERE id = p_session_id;
  IF v_year IS NULL THEN v_year := EXTRACT(YEAR FROM CURRENT_DATE)::INT; END IF;
  INSERT INTO public.admission_number_counters (academic_session_id, last_number)
  VALUES (p_session_id, 1)
  ON CONFLICT (academic_session_id) DO UPDATE
    SET last_number = admission_number_counters.last_number + 1
  RETURNING last_number INTO v_next;
  RETURN format('ADM-%s-%s', v_year, lpad(v_next::text, 5, '0'));
END; $$;
GRANT EXECUTE ON FUNCTION public.next_admission_number(UUID) TO authenticated;

-- ====================================================================
-- Finance module (vouchers, payments)
-- ====================================================================
DO $$ BEGIN CREATE TYPE public.voucher_status AS ENUM ('draft','issued','partial','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_method AS ENUM ('cash','bank','online','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.voucher_source AS ENUM ('manual','installment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.fee_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number TEXT NOT NULL UNIQUE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status public.voucher_status NOT NULL DEFAULT 'issued',
  source public.voucher_source NOT NULL DEFAULT 'manual',
  total_amount NUMERIC(12,2) NOT NULL,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  qr_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fee_voucher_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES public.fee_vouchers(id) ON DELETE CASCADE,
  installment_id UUID REFERENCES public.student_fee_installments(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.fee_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  voucher_id UUID REFERENCES public.fee_vouchers(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fee_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.fee_payments(id) ON DELETE CASCADE,
  installment_id UUID REFERENCES public.student_fee_installments(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS public.finance_counters (
  counter_key TEXT PRIMARY KEY,
  year INT NOT NULL,
  last_number INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fee_vouchers_student ON public.fee_vouchers (student_id);
CREATE INDEX IF NOT EXISTS idx_fee_vouchers_status ON public.fee_vouchers (status);
CREATE INDEX IF NOT EXISTS idx_fee_vouchers_due ON public.fee_vouchers (due_date);
CREATE INDEX IF NOT EXISTS idx_fee_vouchers_qr ON public.fee_vouchers (qr_token);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON public.fee_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_paid_at ON public.fee_payments (paid_at);

ALTER TABLE public.fee_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_voucher_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_counters ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_vouchers','fee_voucher_lines','fee_payments','fee_payment_allocations','finance_counters']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Authenticated %s" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.next_finance_number(p_key TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE y INT := EXTRACT(YEAR FROM CURRENT_DATE)::INT; n INT;
BEGIN
  INSERT INTO public.finance_counters (counter_key, year, last_number)
  VALUES (p_key, y, 1)
  ON CONFLICT (counter_key) DO UPDATE SET
    last_number = CASE WHEN finance_counters.year = y THEN finance_counters.last_number + 1 ELSE 1 END,
    year = y
  RETURNING last_number INTO n;
  IF p_key = 'receipt' THEN RETURN 'RCP-' || y || '-' || lpad(n::TEXT, 5, '0');
  ELSIF p_key = 'voucher' THEN RETURN 'VCH-' || y || '-' || lpad(n::TEXT, 5, '0');
  END IF;
  RETURN p_key || '-' || y || '-' || lpad(n::TEXT, 5, '0');
END; $$;
GRANT EXECUTE ON FUNCTION public.next_finance_number(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_fee_vouchers_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_fee_vouchers_updated ON public.fee_vouchers;
CREATE TRIGGER trg_fee_vouchers_updated BEFORE UPDATE ON public.fee_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.trg_fee_vouchers_updated();

-- ====================================================================
-- NEW: Auto voucher generation for upcoming installments
-- ====================================================================
CREATE OR REPLACE FUNCTION public.auto_issue_due_vouchers(p_days_ahead INT DEFAULT 7)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT := 0;
  v_rec RECORD;
  v_voucher_id UUID;
  v_voucher_number TEXT;
  v_balance NUMERIC(12,2);
BEGIN
  FOR v_rec IN
    SELECT i.*
    FROM public.student_fee_installments i
    WHERE i.status <> 'paid'
      AND (i.amount - i.paid_amount) > 0
      AND i.due_date <= (CURRENT_DATE + p_days_ahead)
      AND NOT EXISTS (
        SELECT 1 FROM public.fee_voucher_lines l
        JOIN public.fee_vouchers v ON v.id = l.voucher_id
        WHERE l.installment_id = i.id AND v.status IN ('issued','partial','draft')
      )
  LOOP
    v_balance := v_rec.amount - v_rec.paid_amount;
    v_voucher_number := public.next_finance_number('voucher');
    INSERT INTO public.fee_vouchers (voucher_number, student_id, source, total_amount, due_date, status, notes)
    VALUES (v_voucher_number, v_rec.student_id, 'installment', v_balance, v_rec.due_date, 'issued',
            'Auto-issued for installment ' || v_rec.label)
    RETURNING id INTO v_voucher_id;

    INSERT INTO public.fee_voucher_lines (voucher_id, installment_id, label, amount, sort_order)
    VALUES (v_voucher_id, v_rec.id, v_rec.label, v_balance, 0);

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;
GRANT EXECUTE ON FUNCTION public.auto_issue_due_vouchers(INT) TO authenticated;

-- ====================================================================
-- NEW: Reporting views
-- ====================================================================

-- Month-wise collection (last 12 months)
CREATE OR REPLACE VIEW public.finance_monthly_collection AS
SELECT
  date_trunc('month', paid_at) AS month,
  COUNT(*)               AS payment_count,
  SUM(amount)::NUMERIC(14,2) AS total_collected
FROM public.fee_payments
GROUP BY 1
ORDER BY 1 DESC;

-- Section-wise collection / outstanding
CREATE OR REPLACE VIEW public.finance_section_summary AS
SELECT
  s.id AS section_id,
  s.name AS section_name,
  c.name AS class_name,
  p.name AS program_name,
  COUNT(DISTINCT st.id) AS student_count,
  COALESCE(SUM(i.amount), 0)::NUMERIC(14,2) AS total_billed,
  COALESCE(SUM(i.paid_amount), 0)::NUMERIC(14,2) AS total_collected,
  COALESCE(SUM(i.amount - i.paid_amount), 0)::NUMERIC(14,2) AS outstanding
FROM public.sections s
LEFT JOIN public.classes c ON c.id = s.class_id
LEFT JOIN public.programs p ON p.id = c.program_id
LEFT JOIN public.students st ON st.section_id = s.id AND st.status = 'active'
LEFT JOIN public.student_fee_installments i ON i.student_id = st.id
GROUP BY s.id, s.name, c.name, p.name;

-- Defaulters: students with any overdue installment
CREATE OR REPLACE VIEW public.finance_defaulters AS
SELECT
  st.id           AS student_id,
  st.full_name,
  st.roll_number,
  st.phone,
  st.guardian_phone,
  sec.name        AS section_name,
  cls.name        AS class_name,
  pr.name         AS program_name,
  COUNT(i.id)     AS overdue_count,
  SUM(i.amount - i.paid_amount)::NUMERIC(14,2) AS overdue_amount,
  MIN(i.due_date) AS earliest_due
FROM public.student_fee_installments i
JOIN public.students st ON st.id = i.student_id
LEFT JOIN public.sections sec ON sec.id = st.section_id
LEFT JOIN public.classes cls  ON cls.id = st.class_id
LEFT JOIN public.programs pr  ON pr.id = st.program_id
WHERE i.status <> 'paid'
  AND (i.amount - i.paid_amount) > 0
  AND i.due_date < CURRENT_DATE
GROUP BY st.id, st.full_name, st.roll_number, st.phone, st.guardian_phone, sec.name, cls.name, pr.name;

-- Upcoming month's expected collection (installments due next calendar month)
CREATE OR REPLACE VIEW public.finance_upcoming_month AS
SELECT
  date_trunc('month', i.due_date) AS month,
  COUNT(*) AS installment_count,
  SUM(i.amount - i.paid_amount)::NUMERIC(14,2) AS expected_amount
FROM public.student_fee_installments i
WHERE i.status <> 'paid'
  AND (i.amount - i.paid_amount) > 0
  AND i.due_date >= date_trunc('month', CURRENT_DATE)
  AND i.due_date <  date_trunc('month', CURRENT_DATE) + INTERVAL '6 months'
GROUP BY 1
ORDER BY 1;

GRANT SELECT ON public.finance_monthly_collection, public.finance_section_summary,
              public.finance_defaulters, public.finance_upcoming_month TO authenticated;

NOTIFY pgrst, 'reload schema';
