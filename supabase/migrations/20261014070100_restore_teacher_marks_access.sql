-- Restore teacher and exam_officer access to internal tests and marks
-- Addresses BUG-08 and BUG-09 from QA report

-- Helper function: check if a teacher can access a test based on their section assignments
CREATE OR REPLACE FUNCTION public.teacher_can_access_test(p_user_id UUID, p_test_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_tests t
    JOIN public.intermediate_teacher_assignments a
      ON a.section_id = t.section_id
     AND a.teacher_user_id = p_user_id
    WHERE t.id = p_test_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.teacher_can_access_test(UUID, UUID) TO authenticated;

-- ============================================================================
-- INTERNAL_TESTS: Add teacher read access for assigned sections
-- ============================================================================

DROP POLICY IF EXISTS "Teachers read assigned section tests" ON public.internal_tests;
CREATE POLICY "Teachers read assigned section tests"
  ON public.internal_tests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::TEXT = 'teacher'
    )
    AND public.teacher_can_access_test(auth.uid(), id)
  );

-- ============================================================================
-- INTERNAL_TEST_MARKS: Add teacher + exam_officer access
-- ============================================================================

-- Teachers can read marks for tests in their assigned sections
DROP POLICY IF EXISTS "Teachers read assigned section marks" ON public.internal_test_marks;
CREATE POLICY "Teachers read assigned section marks"
  ON public.internal_test_marks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::TEXT = 'teacher'
    )
    AND public.teacher_can_access_test(auth.uid(), internal_test_id)
  );

-- Teachers can manage (insert/update/delete) marks for draft tests in their assigned sections
DROP POLICY IF EXISTS "Teachers manage draft marks in assigned sections" ON public.internal_test_marks;
CREATE POLICY "Teachers manage draft marks in assigned sections"
  ON public.internal_test_marks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::TEXT = 'teacher'
    )
    AND public.teacher_can_access_test(auth.uid(), internal_test_id)
    AND public.internal_test_is_draft(internal_test_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::TEXT = 'teacher'
    )
    AND public.teacher_can_access_test(auth.uid(), internal_test_id)
    AND public.internal_test_is_draft(internal_test_id)
  );

-- Exam officers can manage all marks (not just draft)
DROP POLICY IF EXISTS "Exam officers manage all marks" ON public.internal_test_marks;
CREATE POLICY "Exam officers manage all marks"
  ON public.internal_test_marks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::TEXT IN ('exam_officer', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::TEXT IN ('exam_officer', 'super_admin')
    )
  );

-- ============================================================================
-- INTERNAL_TEST_SERIES: Ensure teachers can see series
-- ============================================================================

-- Check if series RLS exists and add teacher access
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'internal_test_series'
  ) THEN
    -- Teachers can read series for their assigned sections
    EXECUTE '
      DROP POLICY IF EXISTS "Teachers read assigned section series" ON public.internal_test_series;
      CREATE POLICY "Teachers read assigned section series"
        ON public.internal_test_series
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::TEXT = ''teacher''
          )
          AND EXISTS (
            SELECT 1
            FROM public.internal_test_series_sections tss
            JOIN public.intermediate_teacher_assignments a
              ON a.section_id = tss.section_id
             AND a.teacher_user_id = auth.uid()
            WHERE tss.series_id = internal_test_series.id
          )
        );
    ';
  END IF;
END $$;

-- ============================================================================
-- INTERNAL_TEST_SECTION_META: Ensure teachers and exam officers can access
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'internal_test_section_meta'
  ) THEN
    -- Teachers can read meta for their assigned sections
    EXECUTE '
      DROP POLICY IF EXISTS "Teachers read assigned section meta" ON public.internal_test_section_meta;
      CREATE POLICY "Teachers read assigned section meta"
        ON public.internal_test_section_meta
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::TEXT = ''teacher''
          )
          AND public.teacher_can_access_test(auth.uid(), test_id)
        );
    ';
    
    -- Exam officers can manage all meta
    EXECUTE '
      DROP POLICY IF EXISTS "Exam officers manage test section meta" ON public.internal_test_section_meta;
      CREATE POLICY "Exam officers manage test section meta"
        ON public.internal_test_section_meta
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::TEXT IN (''exam_officer'', ''super_admin'')
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::TEXT IN (''exam_officer'', ''super_admin'')
          )
        );
    ';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
