-- Test series: exam branch schedules Test 1 / Test 2 with per-section subject papers.

CREATE TABLE IF NOT EXISTS public.internal_test_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_session_id UUID NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  academic_year_start INT NOT NULL,
  class_year_level INT NOT NULL CHECK (class_year_level >= 1),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_test_series_unique_name
  ON public.internal_test_series (
    academic_session_id,
    academic_year_start,
    class_year_level,
    lower(trim(name))
  );

CREATE INDEX IF NOT EXISTS idx_internal_test_series_session
  ON public.internal_test_series (academic_session_id, academic_year_start, class_year_level);

ALTER TABLE public.internal_tests
  ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES public.internal_test_series(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS teacher_name TEXT,
  ADD COLUMN IF NOT EXISTS paper_received BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.internal_tests
  DROP CONSTRAINT IF EXISTS internal_tests_series_requires_section;

ALTER TABLE public.internal_tests
  ADD CONSTRAINT internal_tests_series_requires_section
  CHECK (series_id IS NULL OR section_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_tests_series_subject
  ON public.internal_tests (series_id, section_id, lower(trim(subject_name)))
  WHERE series_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_internal_tests_series
  ON public.internal_tests (series_id);

ALTER TABLE public.internal_test_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exam staff read test series" ON public.internal_test_series;
CREATE POLICY "Exam staff read test series" ON public.internal_test_series
  FOR SELECT TO authenticated
  USING (public.is_exam_staff(auth.uid()));

DROP POLICY IF EXISTS "Exam staff manage test series" ON public.internal_test_series;
CREATE POLICY "Exam staff manage test series" ON public.internal_test_series
  FOR ALL TO authenticated
  USING (public.is_exam_staff(auth.uid()))
  WITH CHECK (public.is_exam_staff(auth.uid()));

NOTIFY pgrst, 'reload schema';
