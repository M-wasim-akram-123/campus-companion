-- Fix teacher weekly/class test creation RLS failures.
-- Apply after patch-intermediate-teacher-tests.sql.
--
-- Cause: teacher INSERT could pass, but RETURNING/select required a
-- section-meta row that was not yet visible, or the create policy was too
-- brittle. This adds a SECURITY DEFINER create RPC and lets teachers read
-- tests they created.

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

CREATE OR REPLACE FUNCTION public.create_teacher_class_test(
  p_academic_session_id UUID,
  p_academic_year_start INT,
  p_class_year_level INT,
  p_section_id UUID,
  p_subject_id UUID,
  p_test_name TEXT,
  p_test_date DATE,
  p_max_marks NUMERIC,
  p_passing_marks NUMERIC DEFAULT NULL
)
RETURNS public.internal_tests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject_name TEXT;
  v_teacher_name TEXT;
  v_test public.internal_tests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  IF NOT public.has_role(auth.uid(), 'teacher') THEN
    RAISE EXCEPTION 'Only teachers can create class tests.';
  END IF;

  IF NOT public.teacher_has_intermediate_subject(
    auth.uid(),
    p_section_id,
    p_subject_id
  ) THEN
    RAISE EXCEPTION 'This subject is not assigned to you for the selected section.';
  END IF;

  SELECT name
  INTO v_subject_name
  FROM public.intermediate_subjects
  WHERE id = p_subject_id
    AND is_active = true;

  IF v_subject_name IS NULL THEN
    RAISE EXCEPTION 'Subject not found or inactive.';
  END IF;

  SELECT COALESCE(NULLIF(trim(full_name), ''), 'Teacher')
  INTO v_teacher_name
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.internal_tests (
    academic_session_id,
    academic_year_start,
    class_year_level,
    section_id,
    series_id,
    subject_id,
    subject_name,
    test_name,
    test_date,
    max_marks,
    passing_marks,
    teacher_name,
    paper_received,
    status,
    created_by
  )
  VALUES (
    p_academic_session_id,
    p_academic_year_start,
    p_class_year_level,
    p_section_id,
    NULL,
    p_subject_id,
    v_subject_name,
    trim(p_test_name),
    p_test_date,
    p_max_marks,
    p_passing_marks,
    v_teacher_name,
    true,
    'draft',
    auth.uid()
  )
  RETURNING * INTO v_test;

  RETURN v_test;
END;
$$;

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

REVOKE EXECUTE ON FUNCTION public.create_teacher_class_test(
  UUID, INT, INT, UUID, UUID, TEXT, DATE, NUMERIC, NUMERIC
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_teacher_class_test(
  UUID, INT, INT, UUID, UUID, TEXT, DATE, NUMERIC, NUMERIC
) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.teacher_has_intermediate_subject(UUID, UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_has_intermediate_subject(UUID, UUID, UUID)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
