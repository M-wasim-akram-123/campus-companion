-- Treat each LMS department as its BS program. The legacy programs row is
-- created and linked automatically only for compatibility with admissions.
CREATE OR REPLACE FUNCTION public.lms_validate_semester_instance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_type TEXT;
  v_department_semesters INT;
  v_department_name TEXT;
  v_existing_department UUID;
  v_program_id UUID;
  v_year INT;
BEGIN
  SELECT semester_count, name
  INTO v_department_semesters, v_department_name
  FROM public.lms_departments
  WHERE id = NEW.department_id AND is_active;
  IF v_department_semesters IS NULL THEN
    RAISE EXCEPTION 'Department is not active.';
  END IF;

  IF NEW.program_id IS NULL THEN
    SELECT dp.program_id INTO v_program_id
    FROM public.lms_department_programs dp
    WHERE dp.department_id = NEW.department_id
    ORDER BY dp.created_at
    LIMIT 1;

    IF v_program_id IS NULL THEN
      SELECT p.id INTO v_program_id
      FROM public.programs p
      WHERE p.type::TEXT = 'bs'
        AND regexp_replace(lower(trim(p.name)), '^bs[[:space:]-]+', '') =
            regexp_replace(lower(trim(v_department_name)), '^bs[[:space:]-]+', '')
      ORDER BY p.created_at
      LIMIT 1;
    END IF;

    IF v_program_id IS NULL THEN
      INSERT INTO public.programs (name, type, duration_years)
      VALUES (v_department_name, 'bs', greatest(1, ceil(v_department_semesters / 2.0)::INT))
      RETURNING id INTO v_program_id;

      FOR v_year IN 1..greatest(1, ceil(v_department_semesters / 2.0)::INT) LOOP
        INSERT INTO public.classes (program_id, name, year_level)
        VALUES (v_program_id, 'BS Year ' || v_year, v_year);
      END LOOP;
    END IF;

    INSERT INTO public.lms_department_programs (department_id, program_id)
    VALUES (NEW.department_id, v_program_id)
    ON CONFLICT (program_id) DO NOTHING;

    NEW.program_id := v_program_id;
  END IF;

  SELECT type::TEXT INTO v_program_type
  FROM public.programs
  WHERE id = NEW.program_id;
  IF v_program_type IS DISTINCT FROM 'bs' THEN
    RAISE EXCEPTION 'LMS semesters can only be created for BS departments.';
  END IF;

  IF NEW.semester_number > v_department_semesters THEN
    RAISE EXCEPTION 'Semester number exceeds the department semester count.';
  END IF;

  SELECT department_id INTO v_existing_department
  FROM public.lms_department_programs
  WHERE program_id = NEW.program_id;
  IF v_existing_department IS NOT NULL AND v_existing_department <> NEW.department_id THEN
    RAISE EXCEPTION 'This BS department is already linked elsewhere.';
  END IF;

  INSERT INTO public.lms_department_programs (department_id, program_id)
  VALUES (NEW.department_id, NEW.program_id)
  ON CONFLICT (program_id) DO NOTHING;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
