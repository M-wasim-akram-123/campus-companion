-- Run in Supabase SQL Editor for academic year finance (fee_cycle + year-end snapshots).

ALTER TABLE public.student_fee_installments
  ADD COLUMN IF NOT EXISTS fee_cycle INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS academic_year_start INT;

CREATE INDEX IF NOT EXISTS idx_student_fee_installments_fee_cycle
  ON public.student_fee_installments (student_id, fee_cycle);
CREATE INDEX IF NOT EXISTS idx_student_fee_installments_academic_year
  ON public.student_fee_installments (student_id, academic_year_start);

CREATE TABLE IF NOT EXISTS public.session_academic_year_closes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_session_id UUID NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  academic_year_start INT NOT NULL,
  fee_cycle INT NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_payable NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_outstanding NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_bad_debt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_waivers NUMERIC(12, 2) NOT NULL DEFAULT 0,
  student_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academic_session_id, academic_year_start)
);

CREATE TABLE IF NOT EXISTS public.student_academic_year_closes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_session_id UUID NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  academic_year_start INT NOT NULL,
  fee_cycle INT NOT NULL,
  payable NUMERIC(12, 2) NOT NULL DEFAULT 0,
  collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
  outstanding NUMERIC(12, 2) NOT NULL DEFAULT 0,
  class_year_level INT,
  section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year_start)
);

CREATE INDEX IF NOT EXISTS idx_session_academic_year_closes_session
  ON public.session_academic_year_closes (academic_session_id);
CREATE INDEX IF NOT EXISTS idx_student_academic_year_closes_session
  ON public.student_academic_year_closes (academic_session_id, academic_year_start);
CREATE INDEX IF NOT EXISTS idx_student_academic_year_closes_student
  ON public.student_academic_year_closes (student_id);

ALTER TABLE public.session_academic_year_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_academic_year_closes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read session year closes" ON public.session_academic_year_closes;
CREATE POLICY "Staff read session year closes" ON public.session_academic_year_closes
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage session year closes" ON public.session_academic_year_closes;
CREATE POLICY "Staff manage session year closes" ON public.session_academic_year_closes
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff read student year closes" ON public.student_academic_year_closes;
CREATE POLICY "Staff read student year closes" ON public.student_academic_year_closes
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage student year closes" ON public.student_academic_year_closes;
CREATE POLICY "Staff manage student year closes" ON public.student_academic_year_closes
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

UPDATE public.student_fee_installments i
SET
  fee_cycle = 1,
  academic_year_start = s.start_year
FROM public.students st
JOIN public.academic_sessions s ON s.id = st.academic_session_id
WHERE st.id = i.student_id
  AND i.academic_year_start IS NULL;

NOTIFY pgrst, 'reload schema';
