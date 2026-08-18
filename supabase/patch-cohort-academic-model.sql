-- Cohort academic model:
-- - overlapping running sessions typed as Intermediate or BS
-- - Intermediate-only sections with program/session integrity
-- - BS program ↔ LMS department single workflow
-- - BS semester-1 auto-enroll + close/promote RPCs

-- ---------------------------------------------------------------------------
-- 1. Typed overlapping sessions (is_active = running; many allowed)
-- ---------------------------------------------------------------------------
ALTER TABLE public.academic_sessions
  ADD COLUMN IF NOT EXISTS program_type public.program_type;

UPDATE public.academic_sessions s
SET program_type = CASE
  WHEN (s.end_year - s.start_year) >= 3 THEN 'bs'::public.program_type
  ELSE 'intermediate'::public.program_type
END
WHERE s.program_type IS NULL;

ALTER TABLE public.academic_sessions
  ALTER COLUMN program_type SET NOT NULL;

ALTER TABLE public.academic_sessions
  ALTER COLUMN program_type SET DEFAULT 'intermediate'::public.program_type;

CREATE INDEX IF NOT EXISTS idx_academic_sessions_program_type_running
  ON public.academic_sessions (program_type, is_active, start_year DESC);

-- ---------------------------------------------------------------------------
-- 2. Integrity: Intermediate sections / BS students without sections
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_student_program_placement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_type public.program_type;
  v_section_program_id UUID;
  v_section_session_id UUID;
  v_class_program_id UUID;
BEGIN
  IF NEW.program_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT type INTO v_program_type
  FROM public.programs
  WHERE id = NEW.program_id;

  IF v_program_type IS NULL THEN
    RAISE EXCEPTION 'Student program not found';
  END IF;

  IF v_program_type = 'bs' THEN
    IF NEW.section_id IS NOT NULL THEN
      RAISE EXCEPTION 'BS students cannot be assigned Intermediate sections';
    END IF;
    -- class_id optional for BS (semester system owns progression)
    IF NEW.class_id IS NOT NULL THEN
      SELECT program_id INTO v_class_program_id
      FROM public.classes
      WHERE id = NEW.class_id;
      IF v_class_program_id IS DISTINCT FROM NEW.program_id THEN
        RAISE EXCEPTION 'BS class must belong to the student program';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Intermediate
  IF NEW.section_id IS NULL THEN
    RAISE EXCEPTION 'Intermediate students require a section';
  END IF;

  SELECT class_id, session_id
  INTO v_class_program_id, v_section_session_id
  FROM public.sections
  WHERE id = NEW.section_id;

  SELECT program_id INTO v_section_program_id
  FROM public.classes
  WHERE id = (
    SELECT class_id FROM public.sections WHERE id = NEW.section_id
  );

  IF v_section_program_id IS DISTINCT FROM NEW.program_id THEN
    RAISE EXCEPTION 'Section must belong to the Intermediate student program';
  END IF;

  IF NEW.academic_session_id IS NOT NULL
     AND v_section_session_id IS DISTINCT FROM NEW.academic_session_id THEN
    RAISE EXCEPTION 'Section session must match the student academic session';
  END IF;

  IF NEW.class_id IS NOT NULL AND NEW.class_id IS DISTINCT FROM (
    SELECT class_id FROM public.sections WHERE id = NEW.section_id
  ) THEN
    RAISE EXCEPTION 'Student class must match the selected section class';
  END IF;

  -- Ensure session type is Intermediate when set
  IF NEW.academic_session_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.academic_sessions
      WHERE id = NEW.academic_session_id
        AND program_type = 'intermediate'
    ) THEN
      RAISE EXCEPTION 'Intermediate students must use an Intermediate session';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_student_program_placement ON public.students;
CREATE TRIGGER trg_validate_student_program_placement
  BEFORE INSERT OR UPDATE OF program_id, class_id, section_id, academic_session_id
  ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_student_program_placement();

CREATE OR REPLACE FUNCTION public.validate_section_is_intermediate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.program_type;
  v_session_type public.program_type;
BEGIN
  SELECT p.type INTO v_type
  FROM public.classes c
  JOIN public.programs p ON p.id = c.program_id
  WHERE c.id = NEW.class_id;

  IF v_type IS DISTINCT FROM 'intermediate' THEN
    RAISE EXCEPTION 'Sections can only be created for Intermediate programs';
  END IF;

  SELECT program_type INTO v_session_type
  FROM public.academic_sessions
  WHERE id = NEW.session_id;

  IF v_session_type IS DISTINCT FROM 'intermediate' THEN
    RAISE EXCEPTION 'Intermediate sections must use an Intermediate session';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_section_is_intermediate ON public.sections;
CREATE TRIGGER trg_validate_section_is_intermediate
  BEFORE INSERT OR UPDATE OF class_id, session_id
  ON public.sections
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_section_is_intermediate();

-- ---------------------------------------------------------------------------
-- 3. BS program ↔ LMS department (single workflow)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_lms_department_for_bs_program(
  p_program_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program RECORD;
  v_dept_id UUID;
  v_code TEXT;
  v_i INT;
BEGIN
  SELECT id, name, type, duration_years
  INTO v_program
  FROM public.programs
  WHERE id = p_program_id;

  IF v_program.id IS NULL THEN
    RAISE EXCEPTION 'Program not found';
  END IF;
  IF v_program.type <> 'bs' THEN
    RAISE EXCEPTION 'LMS department sync is only for BS programs';
  END IF;

  SELECT department_id INTO v_dept_id
  FROM public.lms_department_programs
  WHERE program_id = p_program_id
  LIMIT 1;

  IF v_dept_id IS NULL THEN
    SELECT d.id INTO v_dept_id
    FROM public.lms_departments d
    WHERE lower(trim(d.name)) = lower(trim(v_program.name))
       OR lower(trim(d.name)) = lower(trim(regexp_replace(v_program.name, '^BS\s+', '', 'i')))
    ORDER BY d.created_at
    LIMIT 1;
  END IF;

  v_code := upper(regexp_replace(coalesce(nullif(trim(v_program.name), ''), 'BS'), '[^A-Za-z0-9]+', '', 'g'));
  IF length(v_code) < 2 THEN
    v_code := 'BS';
  END IF;
  IF length(v_code) > 12 THEN
    v_code := left(v_code, 12);
  END IF;

  IF v_dept_id IS NULL THEN
    INSERT INTO public.lms_departments (name, code, semester_count, is_active)
    VALUES (
      v_program.name,
      v_code,
      GREATEST(COALESCE(v_program.duration_years, 4), 1) * 2,
      true
    )
    ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          semester_count = EXCLUDED.semester_count,
          is_active = true,
          updated_at = now()
    RETURNING id INTO v_dept_id;
  ELSE
    UPDATE public.lms_departments
    SET name = v_program.name,
        semester_count = GREATEST(COALESCE(v_program.duration_years, 4), 1) * 2,
        is_active = true,
        updated_at = now()
    WHERE id = v_dept_id;
  END IF;

  INSERT INTO public.lms_department_programs (department_id, program_id)
  VALUES (v_dept_id, p_program_id)
  ON CONFLICT (program_id) DO UPDATE
    SET department_id = EXCLUDED.department_id;

  -- Ensure semester templates 1..N exist
  FOR v_i IN 1..(GREATEST(COALESCE(v_program.duration_years, 4), 1) * 2) LOOP
    INSERT INTO public.lms_semester_templates (department_id, semester_number, name)
    VALUES (v_dept_id, v_i, 'Semester ' || v_i)
    ON CONFLICT (department_id, semester_number) DO NOTHING;
  END LOOP;

  RETURN v_dept_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_bs_program_department()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'bs' THEN
    PERFORM public.ensure_lms_department_for_bs_program(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bs_program_department ON public.programs;
CREATE TRIGGER trg_sync_bs_program_department
  AFTER INSERT OR UPDATE OF name, type, duration_years
  ON public.programs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_bs_program_department();

-- Backfill existing BS programs
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lms_departments'
  ) THEN
    FOR r IN SELECT id FROM public.programs WHERE type = 'bs' LOOP
      PERFORM public.ensure_lms_department_for_bs_program(r.id);
    END LOOP;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. BS Semester 1 auto-enroll on admission
-- ---------------------------------------------------------------------------
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
  v_class_group_id UUID;
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

  -- Already enrolled?
  SELECT id INTO v_enrollment_id
  FROM public.lms_student_semester_enrollments
  WHERE student_id = p_student_id
    AND semester_instance_id = v_semester_id
  LIMIT 1;

  IF v_enrollment_id IS NOT NULL THEN
    RETURN v_enrollment_id;
  END IF;

  IF p_class_group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.lms_class_groups
      WHERE id = p_class_group_id
        AND semester_instance_id = v_semester_id
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Class group does not belong to Semester 1';
    END IF;
    v_class_group_id := p_class_group_id;
  ELSE
    SELECT id INTO v_class_group_id
    FROM public.lms_class_groups
    WHERE semester_instance_id = v_semester_id
      AND is_active = true
    ORDER BY
      CASE WHEN name = 'A' THEN 0 ELSE 1 END,
      created_at
    LIMIT 1;

    IF v_class_group_id IS NULL THEN
      INSERT INTO public.lms_class_groups (
        semester_instance_id, name, shift, capacity, is_active
      )
      VALUES (v_semester_id, 'A', 'morning', 50, true)
      RETURNING id INTO v_class_group_id;
    END IF;
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
    v_class_group_id,
    v_student.roll_number,
    'active'
  )
  RETURNING id INTO v_enrollment_id;

  FOR v_offering IN
    SELECT o.id
    FROM public.lms_course_offerings o
    WHERE o.semester_instance_id = v_semester_id
      AND o.class_group_id = v_class_group_id
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

-- ---------------------------------------------------------------------------
-- 5. Close running semester and promote active students to prepared next
-- ---------------------------------------------------------------------------
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
  v_target_group_id UUID;
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
    -- Close final semester and graduate active students
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

  -- Default target class group (create A if needed)
  SELECT id INTO v_target_group_id
  FROM public.lms_class_groups
  WHERE semester_instance_id = p_to_semester_id
    AND is_active = true
  ORDER BY CASE WHEN name = 'A' THEN 0 ELSE 1 END, created_at
  LIMIT 1;

  IF v_target_group_id IS NULL THEN
    INSERT INTO public.lms_class_groups (
      semester_instance_id, name, shift, capacity, is_active
    )
    VALUES (p_to_semester_id, 'A', 'morning', 50, true)
    RETURNING id INTO v_target_group_id;
  END IF;

  FOR v_enrollment IN
    SELECT e.*
    FROM public.lms_student_semester_enrollments e
    JOIN public.students s ON s.id = e.student_id
    WHERE e.semester_instance_id = p_from_semester_id
      AND e.status = 'active'
      AND s.status = 'active'
  LOOP
    -- Prefer matching class group by name from source
    SELECT cg_to.id INTO v_target_group_id
    FROM public.lms_class_groups cg_from
    JOIN public.lms_class_groups cg_to
      ON cg_to.semester_instance_id = p_to_semester_id
     AND cg_to.name = cg_from.name
     AND cg_to.is_active = true
    WHERE cg_from.id = v_enrollment.class_group_id
    LIMIT 1;

    IF v_target_group_id IS NULL THEN
      SELECT id INTO v_target_group_id
      FROM public.lms_class_groups
      WHERE semester_instance_id = p_to_semester_id
        AND is_active = true
      ORDER BY CASE WHEN name = 'A' THEN 0 ELSE 1 END, created_at
      LIMIT 1;
    END IF;

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
      v_target_group_id,
      v_enrollment.registration_number,
      'active'
    )
    ON CONFLICT (student_id, semester_instance_id) DO UPDATE
      SET class_group_id = EXCLUDED.class_group_id,
          status = 'active',
          updated_at = now()
    RETURNING id INTO v_new_enrollment_id;

    FOR v_offering IN
      SELECT o.id
      FROM public.lms_course_offerings o
      WHERE o.semester_instance_id = p_to_semester_id
        AND o.class_group_id = v_target_group_id
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

  -- Close source, open target as running
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
