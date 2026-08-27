-- Series papers follow subjects assigned to participating sections.
-- A subject without marks is not included in series results.
-- Keeps teacher class-test handling from patch-intermediate-teacher-class-test-create.sql.

CREATE OR REPLACE FUNCTION public.prepare_internal_test_section_meta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.internal_test_series_sections
    WHERE series_id = NEW.series_id
  ) THEN
    RAISE EXCEPTION 'Add sections to this test series first.';
  END IF;

  SELECT count(*) INTO v_assigned
  FROM public.internal_test_series_sections series_section
  JOIN public.intermediate_section_subjects assignment
    ON assignment.section_id = series_section.section_id
   AND assignment.subject_id = NEW.subject_id
  WHERE series_section.series_id = NEW.series_id;

  IF v_assigned = 0 THEN
    RAISE EXCEPTION
      'This subject is not assigned to any section in the series. Assign it in the Intermediate catalog first.';
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

CREATE OR REPLACE FUNCTION public.publish_internal_test(p_test_id UUID)
RETURNS public.internal_tests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.internal_tests;
BEGIN
  IF NOT public.is_exam_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only exam staff can publish results.';
  END IF;

  SELECT * INTO v_test
  FROM public.internal_tests
  WHERE id = p_test_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test not found.';
  END IF;
  IF v_test.status <> 'draft' THEN
    RAISE EXCEPTION 'Test is already published.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.internal_test_marks WHERE internal_test_id = p_test_id
  ) THEN
    RAISE EXCEPTION 'No marks entered. Leave this subject unpublished so it is not included in the series.';
  END IF;

  UPDATE public.internal_tests
  SET status = 'published', published_at = now(), updated_at = now()
  WHERE id = p_test_id
  RETURNING * INTO v_test;

  INSERT INTO public.student_academic_ledger (
    student_id,
    event_type,
    internal_test_id,
    series_id,
    subject_id,
    section_id,
    teacher_user_id,
    academic_session_id,
    academic_year_start,
    class_year_level,
    subject_name,
    test_name,
    marks_obtained,
    max_marks,
    passing_marks,
    is_absent,
    metadata,
    recorded_by
  )
  SELECT
    mark.student_id,
    'test_published',
    v_test.id,
    v_test.series_id,
    v_test.subject_id,
    student.section_id,
    meta.teacher_user_id,
    v_test.academic_session_id,
    v_test.academic_year_start,
    v_test.class_year_level,
    v_test.subject_name,
    v_test.test_name,
    mark.marks_obtained,
    v_test.max_marks,
    v_test.passing_marks,
    mark.is_absent,
    jsonb_build_object(
      'academic_session_id', v_test.academic_session_id,
      'academic_year_start', v_test.academic_year_start,
      'class_year_level', v_test.class_year_level,
      'teacher_name', meta.teacher_name_snapshot,
      'remarks', mark.remarks
    ),
    auth.uid()
  FROM public.internal_test_marks mark
  JOIN public.students student ON student.id = mark.student_id
  LEFT JOIN public.internal_test_section_meta meta
    ON meta.internal_test_id = v_test.id
   AND meta.section_id = student.section_id
  WHERE mark.internal_test_id = v_test.id
  ON CONFLICT (student_id, internal_test_id, event_type)
    WHERE event_type = 'test_published'
  DO NOTHING;

  RETURN v_test;
END;
$$;

NOTIFY pgrst, 'reload schema';
