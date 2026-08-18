-- Scoped Intermediate teacher test workflow.
-- Apply after patch-intermediate-subject-catalog.sql and
-- patch-intermediate-exams-admin-only.sql (if the latter was already applied).
--
-- Teachers can:
--   * create weekly/class tests for their assigned section + subject;
--   * view exam-department series assigned to them;
--   * enter and complete marks only for their assigned section.
-- Exam staff retain full monitoring, publishing, catalog, and reporting access.

CREATE OR REPLACE FUNCTION public.teacher_has_intermediate_subject(
  p_user_id UUID,
  p_section_id UUID,
  p_subject_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.intermediate_section_subjects assignment
    WHERE assignment.teacher_user_id = p_user_id
      AND assignment.section_id = p_section_id
      AND assignment.subject_id = p_subject_id
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_read_internal_mark(
  p_user_id UUID,
  p_test_id UUID,
  p_student_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students student
    JOIN public.internal_test_section_meta metadata
      ON metadata.section_id = student.section_id
     AND metadata.internal_test_id = p_test_id
     AND metadata.teacher_user_id = p_user_id
    JOIN public.internal_tests test
      ON test.id = p_test_id
    WHERE student.id = p_student_id
      AND student.academic_session_id = test.academic_session_id
  );
$$;

CREATE OR REPLACE FUNCTION public.prepare_internal_test_section_meta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected INT;
  v_assigned INT;
  v_teacher_user_id UUID;
  v_teacher_name TEXT;
BEGIN
  -- Teacher-owned weekly/class test for one assigned section.
  IF NEW.series_id IS NULL
     AND NEW.section_id IS NOT NULL
     AND NEW.subject_id IS NOT NULL THEN
    SELECT
      assignment.teacher_user_id,
      COALESCE(NULLIF(trim(profile.full_name), ''), 'Teacher')
    INTO v_teacher_user_id, v_teacher_name
    FROM public.intermediate_section_subjects assignment
    JOIN public.sections section_row ON section_row.id = assignment.section_id
    JOIN public.classes class_row ON class_row.id = section_row.class_id
    LEFT JOIN public.profiles profile ON profile.id = assignment.teacher_user_id
    WHERE assignment.section_id = NEW.section_id
      AND assignment.subject_id = NEW.subject_id
      AND section_row.session_id = NEW.academic_session_id
      AND class_row.year_level = NEW.class_year_level;

    IF v_teacher_user_id IS NULL THEN
      RAISE EXCEPTION
        'This subject is not assigned to a teacher in the selected section, session, and class year.';
    END IF;

    INSERT INTO public.internal_test_section_meta (
      internal_test_id,
      section_id,
      subject_id,
      teacher_user_id,
      teacher_name_snapshot,
      paper_received
    )
    VALUES (
      NEW.id,
      NEW.section_id,
      NEW.subject_id,
      v_teacher_user_id,
      v_teacher_name,
      true
    )
    ON CONFLICT (internal_test_id, section_id) DO NOTHING;

    RETURN NEW;
  END IF;

  -- Exam-department series paper, with one teacher snapshot per section.
  IF NEW.series_id IS NULL OR NEW.section_id IS NOT NULL OR NEW.subject_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_expected
  FROM public.internal_test_series_sections
  WHERE series_id = NEW.series_id;

  SELECT count(*) INTO v_assigned
  FROM public.internal_test_series_sections series_section
  JOIN public.intermediate_section_subjects assignment
    ON assignment.section_id = series_section.section_id
   AND assignment.subject_id = NEW.subject_id
  WHERE series_section.series_id = NEW.series_id;

  IF v_expected = 0 THEN
    RAISE EXCEPTION 'Add sections to this test series first.';
  END IF;

  IF v_assigned <> v_expected THEN
    RAISE EXCEPTION
      'Assign this subject and its teacher to every participating section before adding the paper.';
  END IF;

  INSERT INTO public.internal_test_section_meta (
    internal_test_id,
    section_id,
    subject_id,
    teacher_user_id,
    teacher_name_snapshot
  )
  SELECT
    NEW.id,
    series_section.section_id,
    NEW.subject_id,
    assignment.teacher_user_id,
    COALESCE(NULLIF(trim(profile.full_name), ''), 'Teacher')
  FROM public.internal_test_series_sections series_section
  JOIN public.intermediate_section_subjects assignment
    ON assignment.section_id = series_section.section_id
   AND assignment.subject_id = NEW.subject_id
  LEFT JOIN public.profiles profile ON profile.id = assignment.teacher_user_id
  WHERE series_section.series_id = NEW.series_id
  ON CONFLICT (internal_test_id, section_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Teachers read own section subjects"
  ON public.intermediate_section_subjects;
CREATE POLICY "Teachers read own section subjects"
  ON public.intermediate_section_subjects FOR SELECT TO authenticated
  USING (teacher_user_id = auth.uid());

DROP POLICY IF EXISTS "Teachers read own test section metadata"
  ON public.internal_test_section_meta;
CREATE POLICY "Teachers read own test section metadata"
  ON public.internal_test_section_meta FOR SELECT TO authenticated
  USING (teacher_user_id = auth.uid());

DROP POLICY IF EXISTS "Teachers read assigned tests" ON public.internal_tests;
CREATE POLICY "Teachers read assigned tests"
  ON public.internal_tests FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.internal_test_section_meta metadata
      WHERE metadata.internal_test_id = internal_tests.id
        AND metadata.teacher_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers create own class tests" ON public.internal_tests;
CREATE POLICY "Teachers create own class tests"
  ON public.internal_tests FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher')
    AND series_id IS NULL
    AND section_id IS NOT NULL
    AND subject_id IS NOT NULL
    AND created_by = auth.uid()
    AND status = 'draft'
    AND public.teacher_has_intermediate_subject(
      auth.uid(),
      section_id,
      subject_id
    )
  );

DROP POLICY IF EXISTS "Teachers update own class tests" ON public.internal_tests;
CREATE POLICY "Teachers update own class tests"
  ON public.internal_tests FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher')
    AND created_by = auth.uid()
    AND series_id IS NULL
    AND status = 'draft'
  )
  WITH CHECK (
    created_by = auth.uid()
    AND series_id IS NULL
    AND section_id IS NOT NULL
    AND subject_id IS NOT NULL
    AND status = 'draft'
    AND public.teacher_has_intermediate_subject(
      auth.uid(),
      section_id,
      subject_id
    )
  );

DROP POLICY IF EXISTS "Teachers read assigned series"
  ON public.internal_test_series;
CREATE POLICY "Teachers read assigned series"
  ON public.internal_test_series FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.internal_tests test
      JOIN public.internal_test_section_meta metadata
        ON metadata.internal_test_id = test.id
      WHERE test.series_id = internal_test_series.id
        AND metadata.teacher_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers read assigned series sections"
  ON public.internal_test_series_sections;
CREATE POLICY "Teachers read assigned series sections"
  ON public.internal_test_series_sections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.internal_tests test
      JOIN public.internal_test_section_meta metadata
        ON metadata.internal_test_id = test.id
       AND metadata.section_id = internal_test_series_sections.section_id
      WHERE test.series_id = internal_test_series_sections.series_id
        AND metadata.teacher_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Teachers read assigned marks"
  ON public.internal_test_marks;
CREATE POLICY "Teachers read assigned marks"
  ON public.internal_test_marks FOR SELECT TO authenticated
  USING (
    public.teacher_can_read_internal_mark(
      auth.uid(),
      internal_test_id,
      student_id
    )
  );

DROP POLICY IF EXISTS "Teachers manage assigned draft marks"
  ON public.internal_test_marks;
CREATE POLICY "Teachers manage assigned draft marks"
  ON public.internal_test_marks FOR ALL TO authenticated
  USING (
    public.teacher_can_manage_internal_mark(
      auth.uid(),
      internal_test_id,
      student_id
    )
  )
  WITH CHECK (
    public.teacher_can_manage_internal_mark(
      auth.uid(),
      internal_test_id,
      student_id
    )
    AND entered_by = auth.uid()
  );

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
  IF NOT public.is_exam_staff(auth.uid())
     AND NOT public.teacher_assigned_to_test_section(
       auth.uid(),
       p_test_id,
       p_section_id
     ) THEN
    RAISE EXCEPTION 'You are not assigned to this test section.';
  END IF;

  IF NOT public.internal_test_is_draft(p_test_id) THEN
    RAISE EXCEPTION 'Only draft tests can be completed.';
  END IF;

  SELECT count(*)
  INTO v_missing
  FROM public.students student
  JOIN public.internal_tests test ON test.id = p_test_id
  WHERE student.section_id = p_section_id
    AND student.academic_session_id = test.academic_session_id
    AND student.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.internal_test_marks mark
      WHERE mark.internal_test_id = p_test_id
        AND mark.student_id = student.id
    );

  IF v_missing > 0 THEN
    RAISE EXCEPTION
      '% active student(s) still need marks or an absent entry.',
      v_missing;
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

REVOKE EXECUTE ON FUNCTION public.teacher_has_intermediate_subject(UUID, UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_has_intermediate_subject(UUID, UUID, UUID)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.teacher_can_read_internal_mark(UUID, UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_can_read_internal_mark(UUID, UUID, UUID)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_internal_test_section(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_internal_test_section(UUID, UUID)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
