-- STEP 2 of 2 — Internal test series tables + RLS.
-- Prerequisite: run patch-internal-exams-step1-enum.sql first (or enum already added).

DO $$ BEGIN
  CREATE TYPE public.internal_test_status AS ENUM ('draft', 'published');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.internal_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_session_id UUID NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  academic_year_start INT NOT NULL,
  class_year_level INT NOT NULL CHECK (class_year_level >= 1),
  section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  subject_name TEXT NOT NULL,
  test_name TEXT NOT NULL,
  test_date DATE NOT NULL,
  max_marks NUMERIC(8, 2) NOT NULL CHECK (max_marks > 0),
  passing_marks NUMERIC(8, 2),
  status public.internal_test_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_tests_unique_name
  ON public.internal_tests (
    academic_session_id,
    academic_year_start,
    class_year_level,
    COALESCE(section_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(subject_name)),
    lower(trim(test_name))
  );

CREATE INDEX IF NOT EXISTS idx_internal_tests_session
  ON public.internal_tests (academic_session_id, academic_year_start, class_year_level);
CREATE INDEX IF NOT EXISTS idx_internal_tests_status
  ON public.internal_tests (status);

CREATE TABLE IF NOT EXISTS public.internal_test_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_test_id UUID NOT NULL REFERENCES public.internal_tests(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  marks_obtained NUMERIC(8, 2),
  is_absent BOOLEAN NOT NULL DEFAULT false,
  remarks TEXT,
  entered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (internal_test_id, student_id),
  CHECK (
    is_absent = true
    OR (marks_obtained IS NOT NULL AND marks_obtained >= 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_internal_test_marks_student
  ON public.internal_test_marks (student_id);
CREATE INDEX IF NOT EXISTS idx_internal_test_marks_test
  ON public.internal_test_marks (internal_test_id);

CREATE OR REPLACE FUNCTION public.is_exam_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::TEXT IN ('super_admin', 'exam_officer')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_exam_staff(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_exam_staff(UUID) TO authenticated;

-- SECURITY DEFINER helpers avoid RLS recursion between internal_tests and internal_test_marks.
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

ALTER TABLE public.internal_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_test_marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Exam staff read tests" ON public.internal_tests;
CREATE POLICY "Exam staff read tests" ON public.internal_tests
  FOR SELECT TO authenticated
  USING (public.is_exam_staff(auth.uid()));

DROP POLICY IF EXISTS "Exam staff manage draft tests" ON public.internal_tests;
CREATE POLICY "Exam staff manage draft tests" ON public.internal_tests
  FOR INSERT TO authenticated
  WITH CHECK (public.is_exam_staff(auth.uid()) AND status = 'draft');

DROP POLICY IF EXISTS "Exam staff update draft tests" ON public.internal_tests;
CREATE POLICY "Exam staff update draft tests" ON public.internal_tests
  FOR UPDATE TO authenticated
  USING (public.is_exam_staff(auth.uid()) AND status = 'draft')
  WITH CHECK (public.is_exam_staff(auth.uid()));

DROP POLICY IF EXISTS "Super admin update published tests" ON public.internal_tests;
CREATE POLICY "Super admin update published tests" ON public.internal_tests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Exam staff read marks" ON public.internal_test_marks;
CREATE POLICY "Exam staff read marks" ON public.internal_test_marks
  FOR SELECT TO authenticated
  USING (public.is_exam_staff(auth.uid()));

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

DROP POLICY IF EXISTS "Super admin manage published marks" ON public.internal_test_marks;
CREATE POLICY "Super admin manage published marks" ON public.internal_test_marks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

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
