-- BS LMS single-cohort model:
-- One semester instance = one class for that program/intake.
-- Offerings are (semester, course) only — no class groups / section codes.

-- 0) Remove the legacy class-group validation before touching existing rows
DROP TRIGGER IF EXISTS trg_lms_validate_course_offering ON public.lms_course_offerings;

-- 1) Soften offerings: class_group optional, unique per semester+course
ALTER TABLE public.lms_course_offerings
  ALTER COLUMN class_group_id DROP NOT NULL;

ALTER TABLE public.lms_course_offerings
  DROP CONSTRAINT IF EXISTS lms_course_offerings_class_group_id_course_id_key;

-- Deduplicate offerings that would collide under (semester, course)
DELETE FROM public.lms_course_offerings a
USING public.lms_course_offerings b
WHERE a.semester_instance_id = b.semester_instance_id
  AND a.course_id = b.course_id
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_offerings_semester_course
  ON public.lms_course_offerings (semester_instance_id, course_id);

-- Clear legacy class-group / section fields (keep columns nullable for compatibility)
UPDATE public.lms_course_offerings
SET class_group_id = NULL,
    section_code = NULL
WHERE class_group_id IS NOT NULL
   OR section_code IS NOT NULL;

UPDATE public.lms_student_semester_enrollments
SET class_group_id = NULL
WHERE class_group_id IS NOT NULL;

-- 2) Offering validation: semester + course same department only
CREATE OR REPLACE FUNCTION public.lms_validate_course_offering()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_semester_department UUID;
  v_course_department UUID;
BEGIN
  SELECT department_id INTO v_semester_department
  FROM public.lms_semester_instances WHERE id = NEW.semester_instance_id;

  SELECT department_id INTO v_course_department
  FROM public.lms_courses WHERE id = NEW.course_id;

  IF v_course_department IS DISTINCT FROM v_semester_department THEN
    RAISE EXCEPTION 'Course and semester must belong to the same department/program.';
  END IF;

  -- Ignore legacy class_group_id if present
  NEW.class_group_id := NULL;
  NEW.section_code := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lms_validate_course_offering ON public.lms_course_offerings;
CREATE TRIGGER trg_lms_validate_course_offering
  BEFORE INSERT OR UPDATE OF semester_instance_id, class_group_id, course_id, section_code
  ON public.lms_course_offerings
  FOR EACH ROW EXECUTE FUNCTION public.lms_validate_course_offering();

-- 3) BS Semester 1 auto-enroll (no class group)
CREATE OR REPLACE FUNCTION public.lms_enroll_bs_admission(
  p_student_id UUID,
  p_class_group_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student RECORD;
  v_program_type public.program_type;
  v_dept_id UUID;
  v_semester_id UUID;
  v_enrollment_id UUID;
  v_offering RECORD;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
    OR public.has_role(auth.uid(), 'registrar')
    OR public.lms_is_academic_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not allowed to enroll BS students';
  END IF;

  SELECT s.id, s.program_id, s.academic_session_id, s.roll_number, s.status, s.section_id
  INTO v_student
  FROM public.students s
  WHERE s.id = p_student_id;

  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  SELECT type INTO v_program_type
  FROM public.programs
  WHERE id = v_student.program_id;

  IF v_program_type IS DISTINCT FROM 'bs' THEN
    RAISE EXCEPTION 'Only BS students can be LMS-enrolled via this RPC';
  END IF;

  IF v_student.section_id IS NOT NULL THEN
    RAISE EXCEPTION 'BS students cannot have Intermediate sections';
  END IF;

  IF v_student.academic_session_id IS NULL THEN
    RAISE EXCEPTION 'BS student requires an academic session';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.academic_sessions
    WHERE id = v_student.academic_session_id
      AND program_type = 'bs'
  ) THEN
    RAISE EXCEPTION 'BS students must use a BS academic session';
  END IF;

  SELECT department_id INTO v_dept_id
  FROM public.lms_department_programs
  WHERE program_id = v_student.program_id
  LIMIT 1;

  IF v_dept_id IS NULL THEN
    v_dept_id := public.ensure_lms_department_for_bs_program(v_student.program_id);
  END IF;

  SELECT id INTO v_semester_id
  FROM public.lms_semester_instances
  WHERE program_id = v_student.program_id
    AND academic_session_id = v_student.academic_session_id
    AND semester_number = 1
    AND status IN ('admission_open', 'running')
  ORDER BY
    CASE status WHEN 'admission_open' THEN 0 WHEN 'running' THEN 1 ELSE 2 END,
    created_at DESC
  LIMIT 1;

  IF v_semester_id IS NULL THEN
    RAISE EXCEPTION
      'No open Semester 1 for this BS program and session. Prepare/open Semester 1 in LMS first.';
  END IF;

  SELECT id INTO v_enrollment_id
  FROM public.lms_student_semester_enrollments
  WHERE student_id = p_student_id
    AND semester_instance_id = v_semester_id
  LIMIT 1;

  IF v_enrollment_id IS NOT NULL THEN
    RETURN v_enrollment_id;
  END IF;

  INSERT INTO public.lms_student_semester_enrollments (
    student_id,
    semester_instance_id,
    class_group_id,
    registration_number,
    status
  )
  VALUES (
    p_student_id,
    v_semester_id,
    NULL,
    v_student.roll_number,
    'active'
  )
  RETURNING id INTO v_enrollment_id;

  FOR v_offering IN
    SELECT o.id
    FROM public.lms_course_offerings o
    WHERE o.semester_instance_id = v_semester_id
      AND o.status = 'active'
  LOOP
    INSERT INTO public.lms_course_enrollments (
      semester_enrollment_id,
      offering_id,
      status
    )
    VALUES (v_enrollment_id, v_offering.id, 'active')
    ON CONFLICT (semester_enrollment_id, offering_id) DO NOTHING;
  END LOOP;

  RETURN v_enrollment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lms_enroll_bs_admission(UUID, UUID) TO authenticated;

-- 4) Close + promote without class groups
CREATE OR REPLACE FUNCTION public.lms_close_and_promote_semester(
  p_from_semester_id UUID,
  p_to_semester_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from RECORD;
  v_to RECORD;
  v_enrollment RECORD;
  v_new_enrollment_id UUID;
  v_offering RECORD;
  v_promoted INT := 0;
  v_skipped INT := 0;
  v_graduated INT := 0;
  v_is_final BOOLEAN := false;
  v_semester_count INT;
BEGIN
  SELECT *
  INTO v_from
  FROM public.lms_semester_instances
  WHERE id = p_from_semester_id;

  IF v_from.id IS NULL THEN
    RAISE EXCEPTION 'Source semester not found';
  END IF;

  IF NOT public.lms_manages_department(auth.uid(), v_from.department_id) THEN
    RAISE EXCEPTION 'Not allowed to promote this department semester';
  END IF;

  IF v_from.status IS DISTINCT FROM 'running' THEN
    RAISE EXCEPTION 'Source semester must be running';
  END IF;

  SELECT semester_count INTO v_semester_count
  FROM public.lms_departments
  WHERE id = v_from.department_id;

  v_is_final := v_from.semester_number >= COALESCE(v_semester_count, 8);

  IF v_is_final THEN
    UPDATE public.lms_student_semester_enrollments e
    SET status = 'completed',
        completed_on = CURRENT_DATE,
        updated_at = now()
    FROM public.students s
    WHERE e.semester_instance_id = p_from_semester_id
      AND e.student_id = s.id
      AND e.status = 'active'
      AND s.status = 'active';

    GET DIAGNOSTICS v_graduated = ROW_COUNT;

    UPDATE public.students s
    SET status = 'graduated',
        updated_at = now()
    WHERE s.status = 'active'
      AND EXISTS (
        SELECT 1
        FROM public.lms_student_semester_enrollments e
        WHERE e.student_id = s.id
          AND e.semester_instance_id = p_from_semester_id
          AND e.status = 'completed'
          AND e.completed_on = CURRENT_DATE
      );

    PERFORM public.lms_set_semester_status(p_from_semester_id, 'closed');

    RETURN jsonb_build_object(
      'promoted', 0,
      'skipped', 0,
      'graduated', v_graduated,
      'final_semester', true
    );
  END IF;

  SELECT *
  INTO v_to
  FROM public.lms_semester_instances
  WHERE id = p_to_semester_id;

  IF v_to.id IS NULL THEN
    RAISE EXCEPTION 'Target semester not found';
  END IF;

  IF v_to.department_id IS DISTINCT FROM v_from.department_id
     OR v_to.program_id IS DISTINCT FROM v_from.program_id
     OR v_to.academic_session_id IS DISTINCT FROM v_from.academic_session_id THEN
    RAISE EXCEPTION 'Target semester must match source program and session';
  END IF;

  IF v_to.semester_number IS DISTINCT FROM (v_from.semester_number + 1) THEN
    RAISE EXCEPTION 'Target must be the next semester number';
  END IF;

  IF v_to.status IS DISTINCT FROM 'preparing' THEN
    RAISE EXCEPTION 'Target semester must be in preparing status';
  END IF;

  FOR v_enrollment IN
    SELECT e.*
    FROM public.lms_student_semester_enrollments e
    JOIN public.students s ON s.id = e.student_id
    WHERE e.semester_instance_id = p_from_semester_id
      AND e.status = 'active'
      AND s.status = 'active'
  LOOP
    UPDATE public.lms_student_semester_enrollments
    SET status = 'completed',
        completed_on = CURRENT_DATE,
        updated_at = now()
    WHERE id = v_enrollment.id;

    INSERT INTO public.lms_student_semester_enrollments (
      student_id,
      semester_instance_id,
      class_group_id,
      registration_number,
      status
    )
    VALUES (
      v_enrollment.student_id,
      p_to_semester_id,
      NULL,
      v_enrollment.registration_number,
      'active'
    )
    ON CONFLICT (student_id, semester_instance_id) DO UPDATE
      SET class_group_id = NULL,
          status = 'active',
          updated_at = now()
    RETURNING id INTO v_new_enrollment_id;

    FOR v_offering IN
      SELECT o.id
      FROM public.lms_course_offerings o
      WHERE o.semester_instance_id = p_to_semester_id
        AND o.status = 'active'
    LOOP
      INSERT INTO public.lms_course_enrollments (
        semester_enrollment_id, offering_id, status
      )
      VALUES (v_new_enrollment_id, v_offering.id, 'active')
      ON CONFLICT (semester_enrollment_id, offering_id) DO NOTHING;
    END LOOP;

    v_promoted := v_promoted + 1;
  END LOOP;

  SELECT COUNT(*)::INT INTO v_skipped
  FROM public.lms_student_semester_enrollments e
  WHERE e.semester_instance_id = p_from_semester_id
    AND e.status IN ('failed', 'frozen', 'withdrawn');

  PERFORM public.lms_set_semester_status(p_from_semester_id, 'closed');
  PERFORM public.lms_set_semester_status(p_to_semester_id, 'running');

  RETURN jsonb_build_object(
    'promoted', v_promoted,
    'skipped', v_skipped,
    'graduated', 0,
    'final_semester', false,
    'from_semester_id', p_from_semester_id,
    'to_semester_id', p_to_semester_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lms_close_and_promote_semester(UUID, UUID) TO authenticated;
