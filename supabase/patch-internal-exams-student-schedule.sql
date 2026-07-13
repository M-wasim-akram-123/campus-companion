-- Let students read upcoming test series schedules for their section.

CREATE OR REPLACE FUNCTION public.student_in_series_section(p_series_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_test_series_sections sts
    JOIN public.students s ON s.section_id = sts.section_id
    JOIN public.internal_test_series ser ON ser.id = sts.series_id
    WHERE sts.series_id = p_series_id
      AND s.user_id = p_user_id
      AND s.status = 'active'
      AND s.academic_session_id = ser.academic_session_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.student_in_series_section(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_in_series_section(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Students read scheduled test series" ON public.internal_test_series;
CREATE POLICY "Students read scheduled test series" ON public.internal_test_series
  FOR SELECT TO authenticated
  USING (public.student_in_series_section(id, auth.uid()));

DROP POLICY IF EXISTS "Students read scheduled tests" ON public.internal_tests;
CREATE POLICY "Students read scheduled tests" ON public.internal_tests
  FOR SELECT TO authenticated
  USING (
    status = 'draft'
    AND series_id IS NOT NULL
    AND public.student_in_series_section(series_id, auth.uid())
  );

NOTIFY pgrst, 'reload schema';
