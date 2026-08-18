-- Teachers only see students in assigned Intermediate sections and BS LMS offerings.
-- Intermediate and BS remain separate assignment paths for the same teacher login.

CREATE TABLE IF NOT EXISTS public.intermediate_teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_user_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_intermediate_teacher_assignments_teacher
  ON public.intermediate_teacher_assignments (teacher_user_id);
CREATE INDEX IF NOT EXISTS idx_intermediate_teacher_assignments_section
  ON public.intermediate_teacher_assignments (section_id);

ALTER TABLE public.intermediate_teacher_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_broad_student_access(_user_id UUID)
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
      AND role::TEXT IN (
        'super_admin',
        'admission_officer',
        'registrar',
        'hr',
        'finance_admin',
        'finance_officer',
        'cashier',
        'receptionist',
        'sub_admission_officer'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_view_student(_user_id UUID, _student_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Intermediate: only assigned sections (session is implied by section).
    EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.programs p ON p.id = s.program_id
      JOIN public.intermediate_teacher_assignments a
        ON a.section_id = s.section_id
       AND a.teacher_user_id = _user_id
      WHERE s.id = _student_id
        AND s.section_id IS NOT NULL
        AND p.type::TEXT = 'intermediate'
    )
    OR
    -- BS: only students enrolled in offerings this teacher teaches.
    EXISTS (
      SELECT 1
      FROM public.lms_student_semester_enrollments se
      JOIN public.lms_course_enrollments ce
        ON ce.semester_enrollment_id = se.id
      JOIN public.lms_teacher_assignments ta
        ON ta.offering_id = ce.offering_id
       AND ta.teacher_user_id = _user_id
      WHERE se.student_id = _student_id
    );
$$;

DROP POLICY IF EXISTS "Teachers read assigned students" ON public.students;
CREATE POLICY "Teachers read assigned students"
  ON public.students
  FOR SELECT TO authenticated
  USING (
    public.has_role_name(auth.uid(), 'teacher')
    AND public.teacher_can_view_student(auth.uid(), id)
  );

DROP POLICY IF EXISTS "Super admin manage intermediate teacher assignments"
  ON public.intermediate_teacher_assignments;
CREATE POLICY "Super admin manage intermediate teacher assignments"
  ON public.intermediate_teacher_assignments
  FOR ALL TO authenticated
  USING (
    public.has_role_name(auth.uid(), 'super_admin')
    OR public.has_role_name(auth.uid(), 'registrar')
    OR public.has_role_name(auth.uid(), 'academic_coordinator')
  )
  WITH CHECK (
    public.has_role_name(auth.uid(), 'super_admin')
    OR public.has_role_name(auth.uid(), 'registrar')
    OR public.has_role_name(auth.uid(), 'academic_coordinator')
  );

DROP POLICY IF EXISTS "Teachers read own intermediate assignments"
  ON public.intermediate_teacher_assignments;
CREATE POLICY "Teachers read own intermediate assignments"
  ON public.intermediate_teacher_assignments
  FOR SELECT TO authenticated
  USING (teacher_user_id = auth.uid());

GRANT EXECUTE ON FUNCTION public.has_broad_student_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_view_student(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
