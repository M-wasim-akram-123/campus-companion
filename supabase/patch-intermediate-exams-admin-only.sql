-- Remove teacher access to Intermediate exam operations and reports.
-- Run this after patch-intermediate-subject-catalog.sql if that patch was
-- already applied before the admin-only access decision.

DROP POLICY IF EXISTS "Teachers read own section subjects"
  ON public.intermediate_section_subjects;
DROP POLICY IF EXISTS "Teachers read own test section metadata"
  ON public.internal_test_section_meta;
DROP POLICY IF EXISTS "Teachers read assigned academic ledger"
  ON public.student_academic_ledger;
DROP POLICY IF EXISTS "Teachers read assigned tests"
  ON public.internal_tests;
DROP POLICY IF EXISTS "Teachers read assigned series"
  ON public.internal_test_series;
DROP POLICY IF EXISTS "Teachers read assigned series sections"
  ON public.internal_test_series_sections;
DROP POLICY IF EXISTS "Teachers read assigned marks"
  ON public.internal_test_marks;
DROP POLICY IF EXISTS "Teachers manage assigned draft marks"
  ON public.internal_test_marks;

CREATE OR REPLACE FUNCTION public.complete_internal_test_section(
  p_test_id UUID,
  p_section_id UUID
)
RETURNS public.internal_test_section_meta
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta public.internal_test_section_meta;
  v_missing INT;
BEGIN
  IF NOT public.is_exam_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only exam staff can complete section mark sheets.';
  END IF;

  IF NOT public.internal_test_is_draft(p_test_id) THEN
    RAISE EXCEPTION 'Only draft tests can be completed.';
  END IF;

  SELECT count(*)
  INTO v_missing
  FROM public.students s
  JOIN public.internal_tests t ON t.id = p_test_id
  WHERE s.section_id = p_section_id
    AND s.academic_session_id = t.academic_session_id
    AND s.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.internal_test_marks mark
      WHERE mark.internal_test_id = p_test_id
        AND mark.student_id = s.id
    );

  IF v_missing > 0 THEN
    RAISE EXCEPTION '% active student(s) still need marks or an absent entry.', v_missing;
  END IF;

  UPDATE public.internal_test_section_meta
  SET
    marks_completed = true,
    marks_completed_at = now(),
    marks_completed_by = auth.uid(),
    updated_at = now()
  WHERE internal_test_id = p_test_id
    AND section_id = p_section_id
  RETURNING * INTO v_meta;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test section assignment not found.';
  END IF;

  RETURN v_meta;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_internal_test_section(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_internal_test_section(UUID, UUID)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
