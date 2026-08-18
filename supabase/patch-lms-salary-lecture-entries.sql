-- LMS teacher salary sheet: manual lectures delivered per offering / teacher / period.

CREATE TABLE IF NOT EXISTS public.lms_salary_lecture_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.lms_course_offerings(id) ON DELETE CASCADE,
  teacher_user_id UUID NOT NULL REFERENCES public.lms_teacher_profiles(user_id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  lectures_delivered INTEGER NOT NULL CHECK (lectures_delivered >= 0),
  notes TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offering_id, teacher_user_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_lms_salary_lecture_entries_period
  ON public.lms_salary_lecture_entries (period_key);

CREATE INDEX IF NOT EXISTS idx_lms_salary_lecture_entries_teacher
  ON public.lms_salary_lecture_entries (teacher_user_id);

DROP TRIGGER IF EXISTS trg_lms_salary_lecture_entries_updated ON public.lms_salary_lecture_entries;
CREATE TRIGGER trg_lms_salary_lecture_entries_updated
  BEFORE UPDATE ON public.lms_salary_lecture_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lms_salary_lecture_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "LMS salary sheet read lecture entries" ON public.lms_salary_lecture_entries;
DROP POLICY IF EXISTS "LMS salary sheet manage lecture entries" ON public.lms_salary_lecture_entries;

-- Explicitly LMS academic/HR roles only — finance is not included.
CREATE POLICY "LMS salary sheet read lecture entries" ON public.lms_salary_lecture_entries
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hod')
    OR public.has_role(auth.uid(), 'academic_coordinator')
    OR public.has_role(auth.uid(), 'registrar')
    OR public.has_role(auth.uid(), 'exam_officer')
    OR public.has_role(auth.uid(), 'hr')
  );

CREATE POLICY "LMS salary sheet manage lecture entries" ON public.lms_salary_lecture_entries
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hod')
    OR public.has_role(auth.uid(), 'academic_coordinator')
    OR public.has_role(auth.uid(), 'registrar')
    OR public.has_role(auth.uid(), 'exam_officer')
    OR public.has_role(auth.uid(), 'hr')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hod')
    OR public.has_role(auth.uid(), 'academic_coordinator')
    OR public.has_role(auth.uid(), 'registrar')
    OR public.has_role(auth.uid(), 'exam_officer')
    OR public.has_role(auth.uid(), 'hr')
  );
