-- Fix teacher marks meta policy to use correct column name
-- Addresses follow-up from BUG-08/09: the policy still referenced non-existent `test_id`
-- The actual column is `internal_test_id` on internal_test_section_meta

-- Helper function to check teacher access via section assignment
CREATE OR REPLACE FUNCTION public.teacher_can_access_test_meta(p_user_id UUID, p_internal_test_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Teacher can access meta if they are assigned to teach the subject in the test's section
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_test_section_meta meta
    WHERE meta.internal_test_id = p_internal_test_id
      AND meta.teacher_user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.teacher_can_access_test_meta(UUID, UUID) TO authenticated;

-- Drop and recreate the policy with correct column name
DROP POLICY IF EXISTS "Teachers read assigned section meta" ON public.internal_test_section_meta;

CREATE POLICY "Teachers read assigned section meta"
  ON public.internal_test_section_meta
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::TEXT = 'teacher'
    )
    AND teacher_user_id = auth.uid()
  );

-- Also ensure exam officers can still manage meta
DROP POLICY IF EXISTS "Exam officers manage test section meta" ON public.internal_test_section_meta;

CREATE POLICY "Exam officers manage test section meta"
  ON public.internal_test_section_meta
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

NOTIFY pgrst, 'reload schema';
