-- Clear students / exam series / LMS enrollments, then seed test cohorts.
-- Run in Supabase SQL Editor. Take a backup first if you need current data.
--
-- CLEARS:
--   students + finance transactions
--   Intermediate exam series, tests, marks, section meta, academic ledger
--   BS LMS semester/course enrollments
--   student portal logins only
--
-- SEEDS:
--   Intermediate 1st Year (sessions 2026-2028 + 2027-2029 running, duration 2 years):
--     FSc Pre-Engineering / FSc Pre-Medical / ICS / ICOM — 5 × boys/girls section A
--   BS first semester (sessions 2026-2030 + 2027-2031 running, duration 4 years):
--     CS / SE / IT — 5 each with Sem-1 LMS enrollment (no Intermediate sections)
--   Fee plans:
--     Intermediate = 2-year annual plan + Year 2 projection
--     BS = 4-year semester plan + Semesters 2–8 projections
--
-- KEEPS:
--   staff accounts, academic/fee setup, LMS departments/courses/offerings structure
--
-- PREREQUISITE: run supabase/patch-cohort-academic-model.sql first (program_type on sessions, LMS RPCs).

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS admission_year_level INT;

DO $$
DECLARE
  v_tables TEXT;
  v_student_user_ids UUID[];
  v_deleted_student_users INT := 0;
  v_inter_session_id UUID;
  v_inter_session_label TEXT;
  v_inter_session_year INT;
  v_bs_session_id UUID;
  v_bs_session_label TEXT;
  v_bs_session_year INT;
  v_adm_counter INT := 0;
  v_inter_program_id UUID;
  v_inter_class_id UUID;
  v_section_id UUID;
  v_track TEXT;
  v_track_code TEXT;
  v_gender public.section_gender;
  v_i INT;
  v_roll TEXT;
  v_name TEXT;
  v_father TEXT;
  v_phone TEXT;
  v_cnic TEXT;
  v_student_id UUID;
  v_dept RECORD;
  v_program_id UUID;
  v_class_id UUID;
  v_semester_id UUID;
  v_offering_id UUID;
  v_semester_enrollment_id UUID;
  v_inter_count INT := 0;
  v_bs_count INT := 0;
  v_has_lms BOOLEAN;
BEGIN
  PERFORM set_config('app.allow_student_purge', 'on', true);
  PERFORM set_config('storage.allow_delete_query', 'true', true);

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'lms_departments'
  ) INTO v_has_lms;

  SELECT COALESCE(array_agg(DISTINCT user_id), ARRAY[]::UUID[])
  INTO v_student_user_ids
  FROM public.students
  WHERE user_id IS NOT NULL;

  DELETE FROM storage.objects
  WHERE bucket_id IN ('student-photos', 'student-documents');

  SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', ' ORDER BY c.relname)
  INTO v_tables
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN (
      'fee_payment_allocations',
      'fee_payments',
      'fee_voucher_lines',
      'fee_vouchers',
      'student_fee_installments',
      'student_fee_plans',
      'student_fee_projections',
      'student_finance_ledger',
      'finance_audit_log',
      'cashier_sessions',
      'finance_counters',
      'student_academic_year_closes',
      'internal_test_marks',
      'internal_test_section_meta',
      'internal_tests',
      'internal_test_series_sections',
      'internal_test_series',
      'student_academic_ledger',
      'lms_course_enrollments',
      'lms_student_semester_enrollments',
      'student_document_audit_log',
      'student_documents',
      'student_promotion_log',
      'roll_no_slip_requests',
      'students',
      'inquiry_interactions',
      'inquiries'
    );

  IF v_tables IS NULL THEN
    RAISE EXCEPTION 'No student/exam/LMS tables found to clear.';
  END IF;

  EXECUTE 'TRUNCATE TABLE ' || v_tables || ' RESTART IDENTITY CASCADE';

  IF cardinality(v_student_user_ids) > 0 THEN
    DELETE FROM public.user_roles ur
    WHERE ur.user_id = ANY (v_student_user_ids)
      AND ur.role::TEXT = 'student'
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles other
        WHERE other.user_id = ur.user_id
          AND other.role::TEXT <> 'student'
      );

    DELETE FROM public.profiles p
    WHERE p.id = ANY (v_student_user_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id
      );

    DELETE FROM auth.users u
    WHERE u.id = ANY (v_student_user_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id
      );

    GET DIAGNOSTICS v_deleted_student_users = ROW_COUNT;
  END IF;

  -- Overlapping running cohorts (multiple Intermediate + BS sessions can run together)
  INSERT INTO public.academic_sessions (label, start_year, end_year, is_active, program_type)
  VALUES ('2026-2028', 2026, 2028, true, 'intermediate')
  ON CONFLICT (label) DO UPDATE
    SET start_year = EXCLUDED.start_year,
        end_year = EXCLUDED.end_year,
        is_active = true,
        program_type = 'intermediate'
  RETURNING id, label, start_year
  INTO v_inter_session_id, v_inter_session_label, v_inter_session_year;

  INSERT INTO public.academic_sessions (label, start_year, end_year, is_active, program_type)
  VALUES ('2027-2029', 2027, 2029, true, 'intermediate')
  ON CONFLICT (label) DO UPDATE
    SET start_year = EXCLUDED.start_year,
        end_year = EXCLUDED.end_year,
        is_active = true,
        program_type = 'intermediate';

  INSERT INTO public.academic_sessions (label, start_year, end_year, is_active, program_type)
  VALUES ('2026-2030', 2026, 2030, true, 'bs')
  ON CONFLICT (label) DO UPDATE
    SET start_year = EXCLUDED.start_year,
        end_year = EXCLUDED.end_year,
        is_active = true,
        program_type = 'bs'
  RETURNING id, label, start_year
  INTO v_bs_session_id, v_bs_session_label, v_bs_session_year;

  INSERT INTO public.academic_sessions (label, start_year, end_year, is_active, program_type)
  VALUES ('2027-2031', 2027, 2031, true, 'bs')
  ON CONFLICT (label) DO UPDATE
    SET start_year = EXCLUDED.start_year,
        end_year = EXCLUDED.end_year,
        is_active = true,
        program_type = 'bs';

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'admission_number_counters'
  ) THEN
    DELETE FROM public.admission_number_counters
    WHERE academic_session_id IN (v_inter_session_id, v_bs_session_id);
  END IF;

  -- Intermediate: one program per track + 1st Year boys/girls section A
  FOREACH v_track IN ARRAY ARRAY[
    'FSc Pre-Engineering',
    'FSc Pre-Medical',
    'ICS',
    'ICOM'
  ]
  LOOP
    v_track_code := CASE v_track
      WHEN 'FSc Pre-Engineering' THEN 'ENG'
      WHEN 'FSc Pre-Medical' THEN 'MED'
      WHEN 'ICOM' THEN 'ICM'
      ELSE 'ICS'
    END;

    SELECT id INTO v_inter_program_id
    FROM public.programs
    WHERE type = 'intermediate'
      AND lower(trim(name)) = lower(trim(v_track))
    ORDER BY created_at
    LIMIT 1;

    IF v_inter_program_id IS NULL THEN
      INSERT INTO public.programs (name, type, duration_years)
      VALUES (v_track, 'intermediate', 2)
      RETURNING id INTO v_inter_program_id;

      INSERT INTO public.classes (program_id, name, year_level)
      VALUES
        (v_inter_program_id, '1st Year', 1),
        (v_inter_program_id, '2nd Year', 2);
    ELSE
      UPDATE public.programs
      SET duration_years = 2
      WHERE id = v_inter_program_id
        AND duration_years IS DISTINCT FROM 2;
    END IF;

    SELECT id INTO v_inter_class_id
    FROM public.classes
    WHERE program_id = v_inter_program_id
      AND year_level = 1
    ORDER BY created_at
    LIMIT 1;

    IF v_inter_class_id IS NULL THEN
      INSERT INTO public.classes (program_id, name, year_level)
      VALUES (v_inter_program_id, '1st Year', 1)
      RETURNING id INTO v_inter_class_id;
    END IF;

    FOREACH v_gender IN ARRAY ARRAY[
      'boys'::public.section_gender,
      'girls'::public.section_gender
    ]
    LOOP
      SELECT id INTO v_section_id
      FROM public.sections
      WHERE class_id = v_inter_class_id
        AND session_id = v_inter_session_id
        AND gender = v_gender
        AND name = 'A'
      LIMIT 1;

      IF v_section_id IS NULL THEN
        INSERT INTO public.sections (
          class_id,
          session_id,
          name,
          gender,
          capacity
        )
        VALUES (
          v_inter_class_id,
          v_inter_session_id,
          'A',
          v_gender,
          50
        )
        RETURNING id INTO v_section_id;
      END IF;

      FOR v_i IN 1..5 LOOP
        v_adm_counter := v_adm_counter + 1;
        v_roll := format(
          'ADM-%s-%s',
          v_inter_session_year,
          lpad(v_adm_counter::TEXT, 5, '0')
        );
        v_name := format(
          'Demo %s %s %s',
          v_track,
          CASE WHEN v_gender = 'boys' THEN 'Boy' ELSE 'Girl' END,
          v_i
        );
        v_father := format('Father of %s', v_name);
        v_phone := format(
          '0300%s%s%s',
          CASE v_track_code WHEN 'ENG' THEN '1' WHEN 'MED' THEN '2' ELSE '3' END,
          CASE WHEN v_gender = 'boys' THEN '1' ELSE '2' END,
          lpad(v_i::TEXT, 6, '0')
        );
        v_cnic := format(
          '35202-%s%s%s-%s',
          CASE v_track_code WHEN 'ENG' THEN '1' WHEN 'MED' THEN '2' ELSE '3' END,
          CASE WHEN v_gender = 'boys' THEN '1' ELSE '2' END,
          lpad(v_i::TEXT, 5, '0'),
          CASE WHEN v_gender = 'boys' THEN '1' ELSE '2' END
        );

        INSERT INTO public.students (
          roll_number,
          full_name,
          father_name,
          cnic,
          date_of_birth,
          gender,
          phone,
          email,
          address,
          guardian_name,
          guardian_phone,
          program_id,
          class_id,
          section_id,
          academic_session_id,
          session,
          admission_date,
          status,
          enrollment_type,
          matric_school,
          matric_marks_obtained,
          matric_marks_total,
          admission_year_level
        )
        VALUES (
          v_roll,
          v_name,
          v_father,
          v_cnic,
          DATE '2008-01-01' + ((v_i - 1) * 17),
          CASE WHEN v_gender = 'boys' THEN 'male' ELSE 'female' END,
          v_phone,
          lower(replace(v_roll, '-', '')) || '@test.local',
          'Test Address, Lahore',
          v_father,
          v_phone,
          v_inter_program_id,
          v_inter_class_id,
          v_section_id,
          v_inter_session_id,
          v_inter_session_label,
          CURRENT_DATE,
          'active',
          'regular',
          'Test Matric School',
          900 + v_i,
          1100,
          1
        );

        v_inter_count := v_inter_count + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  -- BS CS / SE / IT first-semester students + LMS enrollments
  IF NOT v_has_lms THEN
    RAISE NOTICE 'LMS tables not found — skipped BS CS/SE/IT seeding.';
  END IF;

  FOR v_dept IN
    SELECT d.id, d.code, d.name
    FROM public.lms_departments d
    WHERE v_has_lms
      AND d.code IN ('CS', 'SE', 'IT')
      AND d.is_active = true
    ORDER BY d.code
  LOOP
    -- Ensure matching BS program + department link
    SELECT p.id INTO v_program_id
    FROM public.programs p
    WHERE p.type = 'bs'
      AND (
        lower(p.name) = lower(v_dept.name)
        OR lower(p.name) = lower('BS ' || v_dept.name)
        OR lower(p.name) LIKE '%' || lower(v_dept.name) || '%'
      )
    ORDER BY p.created_at
    LIMIT 1;

    IF v_program_id IS NULL THEN
      INSERT INTO public.programs (name, type, duration_years)
      VALUES ('BS ' || v_dept.name, 'bs', 4)
      RETURNING id INTO v_program_id;

      INSERT INTO public.classes (program_id, name, year_level)
      VALUES
        (v_program_id, '1st Year', 1),
        (v_program_id, '2nd Year', 2),
        (v_program_id, '3rd Year', 3),
        (v_program_id, '4th Year', 4);
    ELSE
      UPDATE public.programs
      SET duration_years = 4
      WHERE id = v_program_id
        AND duration_years IS DISTINCT FROM 4;
    END IF;

    INSERT INTO public.lms_department_programs (department_id, program_id)
    VALUES (v_dept.id, v_program_id)
    ON CONFLICT (department_id, program_id) DO NOTHING;

    SELECT id INTO v_class_id
    FROM public.classes
    WHERE program_id = v_program_id
      AND year_level = 1
    ORDER BY created_at
    LIMIT 1;

    IF v_class_id IS NULL THEN
      INSERT INTO public.classes (program_id, name, year_level)
      VALUES (v_program_id, '1st Year', 1)
      RETURNING id INTO v_class_id;
    END IF;

    -- Semester 1 instance
    SELECT id INTO v_semester_id
    FROM public.lms_semester_instances
    WHERE department_id = v_dept.id
      AND academic_session_id = v_bs_session_id
      AND semester_number = 1
    LIMIT 1;

    IF v_semester_id IS NULL THEN
      INSERT INTO public.lms_semester_instances (
        department_id,
        program_id,
        academic_session_id,
        semester_number,
        name,
        status,
        start_date,
        end_date
      )
      VALUES (
        v_dept.id,
        v_program_id,
        v_bs_session_id,
        1,
        'Semester 1',
        'running',
        CURRENT_DATE - 30,
        CURRENT_DATE + 120
      )
      RETURNING id INTO v_semester_id;
    ELSE
      UPDATE public.lms_semester_instances
      SET status = 'running',
          program_id = v_program_id,
          updated_at = now()
      WHERE id = v_semester_id;
    END IF;

    -- Ensure at least one Sem-1 course + offering for roster testing
    INSERT INTO public.lms_courses (
      department_id,
      code,
      name,
      credit_hours,
      theory_hours,
      lab_hours,
      lecture_count,
      lab_count,
      learning_outcomes
    )
    VALUES (
      v_dept.id,
      v_dept.code || '-101',
      'Introduction to ' || v_dept.name,
      3,
      2,
      1,
      32,
      16,
      '["Foundational concepts for testing"]'::jsonb
    )
    ON CONFLICT (department_id, code) DO NOTHING;

    SELECT o.id INTO v_offering_id
    FROM public.lms_course_offerings o
    JOIN public.lms_courses c ON c.id = o.course_id
    WHERE o.semester_instance_id = v_semester_id
      AND c.code = v_dept.code || '-101'
    LIMIT 1;

    IF v_offering_id IS NULL THEN
      INSERT INTO public.lms_course_offerings (
        semester_instance_id,
        class_group_id,
        course_id,
        section_code,
        capacity,
        status
      )
      SELECT
        v_semester_id,
        NULL,
        c.id,
        NULL,
        50,
        'active'
      FROM public.lms_courses c
      WHERE c.department_id = v_dept.id
        AND c.code = v_dept.code || '-101'
      RETURNING id INTO v_offering_id;
    END IF;

    FOR v_i IN 1..5 LOOP
      v_adm_counter := v_adm_counter + 1;
      v_roll := format(
        'ADM-%s-%s',
        v_bs_session_year,
        lpad(v_adm_counter::TEXT, 5, '0')
      );
      v_name := format('Demo BS %s Student %s', v_dept.code, v_i);
      v_father := format('Father of %s', v_name);
      v_phone := format(
        '0311%s%s',
        CASE v_dept.code WHEN 'CS' THEN '1' WHEN 'SE' THEN '2' ELSE '3' END,
        lpad(v_i::TEXT, 6, '0')
      );
      v_cnic := format(
        '35201-%s%s-%s',
        CASE v_dept.code WHEN 'CS' THEN '4' WHEN 'SE' THEN '5' ELSE '6' END,
        lpad(v_i::TEXT, 6, '0'),
        CASE WHEN v_i % 2 = 0 THEN '2' ELSE '1' END
      );

      INSERT INTO public.students (
        roll_number,
        full_name,
        father_name,
        cnic,
        date_of_birth,
        gender,
        phone,
        email,
        address,
        guardian_name,
        guardian_phone,
        program_id,
        class_id,
        section_id,
        academic_session_id,
        session,
        admission_date,
        status,
        enrollment_type,
        matric_school,
        matric_marks_obtained,
        matric_marks_total,
        admission_year_level
      )
      VALUES (
        v_roll,
        v_name,
        v_father,
        v_cnic,
        DATE '2006-03-01' + ((v_i - 1) * 21),
        CASE WHEN v_i % 2 = 0 THEN 'female' ELSE 'male' END,
        v_phone,
        lower(replace(v_roll, '-', '')) || '@test.local',
        'Test BS Address, Lahore',
        v_father,
        v_phone,
        v_program_id,
        NULL,
        NULL,
        v_bs_session_id,
        v_bs_session_label,
        CURRENT_DATE,
        'active',
        'regular',
        'Test College',
        850 + v_i,
        1100,
        1
      )
      RETURNING id INTO v_student_id;

      INSERT INTO public.lms_student_semester_enrollments (
        student_id,
        semester_instance_id,
        class_group_id,
        registration_number,
        status,
        enrolled_on
      )
      VALUES (
        v_student_id,
        v_semester_id,
        NULL,
        v_roll,
        'active',
        CURRENT_DATE
      )
      RETURNING id INTO v_semester_enrollment_id;

      IF v_offering_id IS NOT NULL THEN
        INSERT INTO public.lms_course_enrollments (
          semester_enrollment_id,
          offering_id,
          status
        )
        VALUES (
          v_semester_enrollment_id,
          v_offering_id,
          'active'
        )
        ON CONFLICT DO NOTHING;
      END IF;

      v_bs_count := v_bs_count + 1;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'admission_number_counters'
  ) THEN
    -- Shared ADM-2026 sequence across both sessions (same start year)
    INSERT INTO public.admission_number_counters (academic_session_id, last_number)
    VALUES
      (v_inter_session_id, v_adm_counter),
      (v_bs_session_id, v_adm_counter)
    ON CONFLICT (academic_session_id)
    DO UPDATE SET last_number = EXCLUDED.last_number;
  END IF;

  -- Ensure program durations match degree length
  UPDATE public.programs
  SET duration_years = 2
  WHERE type = 'intermediate'
    AND duration_years IS DISTINCT FROM 2;

  UPDATE public.programs
  SET duration_years = 4
  WHERE type = 'bs'
    AND duration_years IS DISTINCT FROM 4;

  RAISE NOTICE
    'Students seeded. Cleared prior data (removed % portal logins). Inserted % Intermediate (session %) + % BS (session %). Creating fee plans…',
    v_deleted_student_users,
    v_inter_count,
    v_inter_session_label,
    v_bs_count,
    v_bs_session_label;
END $$;

-- Fee plans + year-1 installments + remaining-degree projections for seeded students
DO $$
DECLARE
  v_student RECORD;
  v_policy_id UUID;
  v_plan_id UUID;
  v_sort INT;
  v_i INT;
  v_due DATE;
  v_annual NUMERIC := 60000;
  v_semester NUMERIC := 45000;
  v_admission_inter NUMERIC := 15000;
  v_admission_bs NUMERIC := 20000;
  v_annual_fund NUMERIC := 5000;
  v_board_reg NUMERIC := 3000;
  v_board_exam NUMERIC := 4000;
  v_inst_base NUMERIC;
  v_inst_amount NUMERIC;
  v_inst_count INT := 4;
  v_fee_plans INT := 0;
  v_has_projections BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'student_fee_projections'
  ) INTO v_has_projections;

  FOR v_student IN
    SELECT
      s.id,
      s.program_id,
      s.academic_session_id,
      p.type::TEXT AS program_type,
      p.name AS program_name,
      p.duration_years
    FROM public.students s
    JOIN public.programs p ON p.id = s.program_id
    WHERE s.roll_number LIKE 'ADM-%'
      AND NOT EXISTS (
        SELECT 1 FROM public.student_fee_plans fp WHERE fp.student_id = s.id
      )
    ORDER BY s.created_at
  LOOP
    SELECT id INTO v_policy_id
    FROM public.admission_fee_policies
    WHERE program_id = v_student.program_id
      AND academic_session_id IS NOT DISTINCT FROM v_student.academic_session_id
      AND is_active = true
    ORDER BY created_at
    LIMIT 1;

    IF v_policy_id IS NULL THEN
      INSERT INTO public.admission_fee_policies (
        program_id,
        academic_session_id,
        name,
        is_active,
        default_schedule,
        default_installment_count,
        default_start_after_months,
        projection_cycle_type,
        projection_cycle_count,
        increment_type,
        increment_value,
        annual_fund_frequency
      )
      VALUES (
        v_student.program_id,
        v_student.academic_session_id,
        v_student.program_name || ' — demo fee policy',
        true,
        CASE
          WHEN v_student.program_type = 'bs' THEN 'custom'::public.annual_fee_schedule_type
          ELSE 'quarterly'::public.annual_fee_schedule_type
        END,
        CASE WHEN v_student.program_type = 'bs' THEN 1 ELSE 4 END,
        2,
        CASE WHEN v_student.program_type = 'bs' THEN 'semester' ELSE 'annual' END,
        CASE
          WHEN v_student.program_type = 'bs'
            THEN GREATEST(COALESCE(v_student.duration_years, 4), 1) * 2
          ELSE GREATEST(COALESCE(v_student.duration_years, 2), 1)
        END,
        'none',
        0,
        'every_cycle'
      )
      RETURNING id INTO v_policy_id;

      INSERT INTO public.fee_policy_components (policy_id, component_type, amount)
      VALUES
        (
          v_policy_id,
          'admission_fee',
          CASE WHEN v_student.program_type = 'bs' THEN v_admission_bs ELSE v_admission_inter END
        ),
        (v_policy_id, 'annual_fund', v_annual_fund),
        (
          v_policy_id,
          'annual_fee',
          CASE WHEN v_student.program_type = 'bs' THEN 0 ELSE v_annual END
        ),
        (
          v_policy_id,
          'semester_fee',
          CASE WHEN v_student.program_type = 'bs' THEN v_semester ELSE 0 END
        ),
        (
          v_policy_id,
          'board_registration_fee',
          CASE WHEN v_student.program_type = 'bs' THEN 0 ELSE v_board_reg END
        ),
        (
          v_policy_id,
          'board_examination_fee',
          CASE WHEN v_student.program_type = 'bs' THEN 0 ELSE v_board_exam END
        )
      ON CONFLICT (policy_id, component_type) DO NOTHING;
    END IF;

    IF v_student.program_type = 'bs' THEN
      INSERT INTO public.student_fee_plans (
        student_id,
        policy_id,
        enrollment_type,
        admission_fee,
        annual_fund,
        annual_fee,
        semester_fee,
        board_registration_fee,
        board_examination_fee,
        scholarship_discount,
        pay_at_admission,
        annual_fee_schedule,
        installment_count,
        start_after_months,
        notes,
        admission_payment_breakdown
      )
      VALUES (
        v_student.id,
        v_policy_id,
        'regular',
        v_admission_bs,
        v_annual_fund,
        0,
        v_semester,
        0,
        0,
        0,
        v_admission_bs + v_annual_fund,
        'custom'::public.annual_fee_schedule_type,
        1,
        2,
        'Demo BS 4-year semester fee plan',
        jsonb_build_array(
          jsonb_build_object(
            'component_type', 'admission_fee',
            'enabled', true,
            'amount', v_admission_bs,
            'policy_amount', v_admission_bs
          ),
          jsonb_build_object(
            'component_type', 'annual_fund',
            'enabled', true,
            'amount', v_annual_fund,
            'policy_amount', v_annual_fund
          )
        )
      )
      RETURNING id INTO v_plan_id;

      INSERT INTO public.student_fee_installments (
        student_id,
        fee_plan_id,
        label,
        component_type,
        amount,
        due_date,
        status,
        sort_order,
        fee_cycle,
        academic_year_start
      )
      VALUES
        (
          v_student.id, v_plan_id, 'Admission fee', 'admission_fee',
          v_admission_bs, CURRENT_DATE, 'pending', 0, 1,
          EXTRACT(YEAR FROM CURRENT_DATE)::INT
        ),
        (
          v_student.id, v_plan_id, 'Annual fund', 'annual_fund',
          v_annual_fund, CURRENT_DATE, 'pending', 1, 1,
          EXTRACT(YEAR FROM CURRENT_DATE)::INT
        ),
        (
          v_student.id, v_plan_id, 'Semester fee — Semester 1', 'semester_fee',
          v_semester, (CURRENT_DATE + INTERVAL '2 months')::DATE, 'pending', 2, 1,
          EXTRACT(YEAR FROM CURRENT_DATE)::INT
        );

      IF v_has_projections THEN
        FOR v_i IN 2..(GREATEST(COALESCE(v_student.duration_years, 4), 1) * 2) LOOP
          INSERT INTO public.student_fee_projections (
            student_id,
            fee_plan_id,
            cycle_no,
            cycle_label,
            component_type,
            policy_amount,
            scholarship_discount,
            payable_amount,
            due_date,
            notes
          )
          VALUES (
            v_student.id,
            v_plan_id,
            v_i,
            'Semester ' || v_i,
            'semester_fee',
            v_semester,
            0,
            v_semester,
            (CURRENT_DATE + make_interval(months => (v_i - 1) * 6))::DATE,
            'Projected semester fee for 4-year BS degree'
          );
        END LOOP;
      END IF;
    ELSE
      INSERT INTO public.student_fee_plans (
        student_id,
        policy_id,
        enrollment_type,
        admission_fee,
        annual_fund,
        annual_fee,
        semester_fee,
        board_registration_fee,
        board_examination_fee,
        scholarship_discount,
        pay_at_admission,
        annual_fee_schedule,
        installment_count,
        start_after_months,
        notes,
        admission_payment_breakdown
      )
      VALUES (
        v_student.id,
        v_policy_id,
        'regular',
        v_admission_inter,
        v_annual_fund,
        v_annual,
        0,
        v_board_reg,
        v_board_exam,
        0,
        v_admission_inter + v_annual_fund,
        'quarterly'::public.annual_fee_schedule_type,
        v_inst_count,
        2,
        'Demo Intermediate 2-year annual fee plan',
        jsonb_build_array(
          jsonb_build_object(
            'component_type', 'admission_fee',
            'enabled', true,
            'amount', v_admission_inter,
            'policy_amount', v_admission_inter
          ),
          jsonb_build_object(
            'component_type', 'annual_fund',
            'enabled', true,
            'amount', v_annual_fund,
            'policy_amount', v_annual_fund
          )
        )
      )
      RETURNING id INTO v_plan_id;

      INSERT INTO public.student_fee_installments (
        student_id,
        fee_plan_id,
        label,
        component_type,
        amount,
        due_date,
        status,
        sort_order,
        fee_cycle,
        academic_year_start
      )
      VALUES
        (
          v_student.id, v_plan_id, 'Admission fee', 'admission_fee',
          v_admission_inter, CURRENT_DATE, 'pending', 0, 1,
          EXTRACT(YEAR FROM CURRENT_DATE)::INT
        ),
        (
          v_student.id, v_plan_id, 'Annual fund', 'annual_fund',
          v_annual_fund, CURRENT_DATE, 'pending', 1, 1,
          EXTRACT(YEAR FROM CURRENT_DATE)::INT
        ),
        (
          v_student.id, v_plan_id, 'Board registration fee', 'board_registration_fee',
          v_board_reg, CURRENT_DATE, 'pending', 2, 1,
          EXTRACT(YEAR FROM CURRENT_DATE)::INT
        ),
        (
          v_student.id, v_plan_id, 'Board examination fee', 'board_examination_fee',
          v_board_exam, (CURRENT_DATE + INTERVAL '8 months')::DATE, 'pending', 3, 1,
          EXTRACT(YEAR FROM CURRENT_DATE)::INT
        );

      v_inst_base := ceil(v_annual / v_inst_count / 10.0) * 10;
      v_sort := 4;
      FOR v_i IN 1..v_inst_count LOOP
        IF v_i = v_inst_count THEN
          v_inst_amount := v_annual - (v_inst_base * (v_inst_count - 1));
        ELSE
          v_inst_amount := v_inst_base;
        END IF;
        v_due := (CURRENT_DATE + make_interval(months => 1 + (v_i - 1)))::DATE;
        INSERT INTO public.student_fee_installments (
          student_id,
          fee_plan_id,
          label,
          component_type,
          amount,
          due_date,
          status,
          sort_order,
          fee_cycle,
          academic_year_start
        )
        VALUES (
          v_student.id,
          v_plan_id,
          'Annual fee - ' || to_char(v_due, 'FMMonth YYYY'),
          'annual_fee',
          v_inst_amount,
          v_due,
          'pending',
          v_sort,
          1,
          EXTRACT(YEAR FROM CURRENT_DATE)::INT
        );
        v_sort := v_sort + 1;
      END LOOP;

      IF v_has_projections THEN
        FOR v_i IN 2..GREATEST(COALESCE(v_student.duration_years, 2), 1) LOOP
          INSERT INTO public.student_fee_projections (
            student_id,
            fee_plan_id,
            cycle_no,
            cycle_label,
            component_type,
            policy_amount,
            scholarship_discount,
            payable_amount,
            due_date,
            notes
          )
          VALUES
            (
              v_student.id, v_plan_id, v_i, 'Year ' || v_i, 'annual_fee',
              v_annual, 0, v_annual,
              (CURRENT_DATE + make_interval(years => v_i - 1))::DATE,
              'Projected annual fee for 2-year Intermediate degree'
            ),
            (
              v_student.id, v_plan_id, v_i, 'Year ' || v_i, 'annual_fund',
              v_annual_fund, 0, v_annual_fund,
              (CURRENT_DATE + make_interval(years => v_i - 1))::DATE,
              'Projected annual fund for 2-year Intermediate degree'
            );
        END LOOP;
      END IF;
    END IF;

    v_fee_plans := v_fee_plans + 1;
  END LOOP;

  RAISE NOTICE
    'Created % demo fee plans (Intermediate 2-year annual, BS 4-year semester).',
    v_fee_plans;
END $$;

NOTIFY pgrst, 'reload schema';
