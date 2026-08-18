-- DANGER: Clears academic setup for a clean rebuild in Settings → Academic.
-- Run in Supabase SQL Editor. Take a backup first if you need any of this data.
--
-- CLEARS:
--   academic_sessions, programs, classes, sections
--   students + finance transactions (required; they hang off programs/sections)
--   inquiries, fee policies tied to programs/sessions
--   Intermediate section/subject/teacher assignments + exam series/tests/marks
--   LMS semester instances / enrollments / offerings that block session/program delete
--   session budgets, admission number counters, campus-incharge section links
--
-- KEEPS:
--   staff logins (profiles + user_roles)
--   Intermediate subject catalog names (intermediate_subjects)
--   LMS departments / courses / teacher profiles (structure only)
--   board gazette, announcements content may be cleared when session-scoped

DO $$
DECLARE
  v_tables TEXT;
  v_student_user_ids UUID[];
  v_deleted_student_users INT := 0;
BEGIN
  PERFORM set_config('app.allow_student_purge', 'on', true);
  PERFORM set_config('storage.allow_delete_query', 'true', true);

  SELECT COALESCE(array_agg(DISTINCT user_id), ARRAY[]::UUID[])
  INTO v_student_user_ids
  FROM public.students
  WHERE user_id IS NOT NULL;

  DELETE FROM storage.objects
  WHERE bucket_id IN ('student-photos', 'student-documents');

  -- Truncate only tables that exist (safe if some patches not applied yet).
  SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', ' ORDER BY c.relname)
  INTO v_tables
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN (
      -- students + finance
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
      'student_document_audit_log',
      'student_documents',
      'student_promotion_log',
      'roll_no_slip_requests',
      'students',
      'inquiry_interactions',
      'inquiries',
      -- fee policies (program + session scoped)
      'fee_policy_installment_templates',
      'fee_scholarship_slabs',
      'fee_policy_components',
      'admission_fee_policies',
      'admission_number_counters',
      'session_finance_budgets',
      'session_collection_targets',
      -- Intermediate catalog assignments / exams
      'intermediate_section_subjects',
      'intermediate_teacher_assignments',
      'internal_test_marks',
      'internal_test_section_meta',
      'internal_tests',
      'internal_test_series_sections',
      'internal_test_series',
      'student_academic_ledger',
      -- announcements (session / section scoped)
      'announcement_section_targets',
      'announcements',
      -- campus incharge section links
      'campus_incharge_sections',
      -- LMS rows that RESTRICT delete of programs / sessions
      'lms_course_enrollments',
      'lms_student_semester_enrollments',
      'lms_course_offerings',
      'lms_class_groups',
      'lms_semester_instances',
      'lms_department_programs',
      -- core academic setup
      'sections',
      'classes',
      'programs',
      'academic_sessions'
    );

  IF v_tables IS NULL THEN
    RAISE EXCEPTION 'No academic/student tables found to clear.';
  END IF;

  EXECUTE 'TRUNCATE TABLE ' || v_tables || ' RESTART IDENTITY CASCADE';

  -- Remove orphan student portal accounts (keep staff / multi-role users).
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

  RAISE NOTICE
    'Academic setup cleared (sessions, programs, classes, sections). Also cleared students/finance/fee policies/LMS semesters. Removed % student portal login(s). Staff kept.',
    v_deleted_student_users;
END $$;

NOTIFY pgrst, 'reload schema';
