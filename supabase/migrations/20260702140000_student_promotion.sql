-- Annual student promotion (class/section/fees) from 1 July each academic year.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS admission_year_level INT;

CREATE TABLE IF NOT EXISTS public.student_promotion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  academic_year_start INT NOT NULL,
  from_year_level INT NOT NULL,
  to_year_level INT NOT NULL,
  from_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  to_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  from_section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  to_section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  fee_installments_added INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year_start)
);

CREATE INDEX IF NOT EXISTS idx_student_promotion_log_session
  ON public.student_promotion_log (academic_session_id);
CREATE INDEX IF NOT EXISTS idx_student_promotion_log_year
  ON public.student_promotion_log (academic_year_start);

ALTER TABLE public.student_promotion_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read student promotion log" ON public.student_promotion_log;
CREATE POLICY "Staff read student promotion log" ON public.student_promotion_log
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage student promotion log" ON public.student_promotion_log;
CREATE POLICY "Staff manage student promotion log" ON public.student_promotion_log
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

UPDATE public.students s
SET admission_year_level = c.year_level
FROM public.classes c
WHERE c.id = s.class_id
  AND s.admission_year_level IS NULL;

UPDATE public.students s
SET admission_year_level = sub.from_year
FROM (
  SELECT student_id, MIN(from_year_level) AS from_year
  FROM public.student_promotion_log
  GROUP BY student_id
) sub
WHERE sub.student_id = s.id;

NOTIFY pgrst, 'reload schema';
