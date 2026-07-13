-- Fix infinite RLS recursion between internal_tests and internal_test_marks.
-- Run this if test creation fails with "infinite recursion detected in policy".

CREATE OR REPLACE FUNCTION public.internal_test_is_draft(p_test_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.internal_tests
    WHERE id = p_test_id AND status = 'draft'
  );
$$;

CREATE OR REPLACE FUNCTION public.internal_test_is_published(p_test_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.internal_tests
    WHERE id = p_test_id AND status = 'published'
  );
$$;

CREATE OR REPLACE FUNCTION public.student_belongs_to_user(p_student_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students
    WHERE id = p_student_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.student_has_mark_on_test(p_test_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_test_marks m
    JOIN public.students s ON s.id = m.student_id
    WHERE m.internal_test_id = p_test_id
      AND s.user_id = p_user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.internal_test_is_draft(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.internal_test_is_published(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.student_belongs_to_user(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.student_has_mark_on_test(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.internal_test_is_draft(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_test_is_published(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_belongs_to_user(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_has_mark_on_test(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Exam staff manage draft marks" ON public.internal_test_marks;
CREATE POLICY "Exam staff manage draft marks" ON public.internal_test_marks
  FOR ALL TO authenticated
  USING (
    public.is_exam_staff(auth.uid())
    AND public.internal_test_is_draft(internal_test_id)
  )
  WITH CHECK (
    public.is_exam_staff(auth.uid())
    AND public.internal_test_is_draft(internal_test_id)
  );

DROP POLICY IF EXISTS "Students read own published marks" ON public.internal_test_marks;
CREATE POLICY "Students read own published marks" ON public.internal_test_marks
  FOR SELECT TO authenticated
  USING (
    public.internal_test_is_published(internal_test_id)
    AND public.student_belongs_to_user(student_id, auth.uid())
  );

DROP POLICY IF EXISTS "Students read own published tests" ON public.internal_tests;
CREATE POLICY "Students read own published tests" ON public.internal_tests
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND public.student_has_mark_on_test(id, auth.uid())
  );

NOTIFY pgrst, 'reload schema';
