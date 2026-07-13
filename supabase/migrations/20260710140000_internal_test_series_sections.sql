-- Series section scope + subject tests without fixed section (marks entered per section).

CREATE TABLE IF NOT EXISTS public.internal_test_series_sections (
  series_id UUID NOT NULL REFERENCES public.internal_test_series(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_test_series_sections_section
  ON public.internal_test_series_sections (section_id);

ALTER TABLE public.internal_tests
  DROP CONSTRAINT IF EXISTS internal_tests_series_requires_section;

DROP INDEX IF EXISTS public.idx_internal_tests_series_subject;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_tests_series_subject
  ON public.internal_tests (series_id, lower(trim(subject_name)))
  WHERE series_id IS NOT NULL AND section_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_tests_series_section_subject
  ON public.internal_tests (series_id, section_id, lower(trim(subject_name)))
  WHERE series_id IS NOT NULL AND section_id IS NOT NULL;

ALTER TABLE public.internal_test_series_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exam staff read series sections" ON public.internal_test_series_sections;
CREATE POLICY "Exam staff read series sections" ON public.internal_test_series_sections
  FOR SELECT TO authenticated
  USING (public.is_exam_staff(auth.uid()));

DROP POLICY IF EXISTS "Exam staff manage series sections" ON public.internal_test_series_sections;
CREATE POLICY "Exam staff manage series sections" ON public.internal_test_series_sections
  FOR ALL TO authenticated
  USING (public.is_exam_staff(auth.uid()))
  WITH CHECK (public.is_exam_staff(auth.uid()));

NOTIFY pgrst, 'reload schema';
