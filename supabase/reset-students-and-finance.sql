-- DANGER: Clears ALL students + finance transaction data for fresh testing.
-- Run in Supabase SQL Editor. Take a backup first if you need any of this data.
--
-- CLEARS:
--   students, inquiries, fee plans/installments/vouchers/payments
--   finance ledger, audit log, cashier sessions, counters
--   student documents, roll-slip requests, exam marks, promotion/year-close logs
--   student photos + student document files in storage
--   student portal login accounts (auth users that only had role = student)
--
-- KEEPS:
--   staff logins (profiles + user_roles for non-student accounts)
--   academic setup (sessions, programs, classes, sections)
--   fee policies / templates / collection plans / session budgets
--   board gazette, announcements, exam series definitions (subjects cleared of marks)

DO $$
DECLARE
  v_tables TEXT;
  v_student_user_ids UUID[];
  v_deleted_student_users INT := 0;
BEGIN
  -- Student portal accounts linked from students (may be deleted after wipe)
  SELECT COALESCE(array_agg(DISTINCT user_id), ARRAY[]::UUID[])
    INTO v_student_user_ids
  FROM public.students
  WHERE user_id IS NOT NULL;

  -- In case any path uses DELETE instead of TRUNCATE against immutable ledger/audit.
  PERFORM set_config('app.allow_student_purge', 'on', true);

  -- Student photos + document uploads only (keep announcement media).
  -- Supabase blocks direct storage deletes unless this session flag is set.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
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
      -- finance transactions
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
      -- student records + related
      'internal_test_marks',
      'student_document_audit_log',
      'student_documents',
      'student_promotion_log',
      'roll_no_slip_requests',
      'students',
      -- admissions pipeline (so you can re-admit cleanly)
      'inquiry_interactions',
      'inquiries'
    );

  IF v_tables IS NULL THEN
    RAISE EXCEPTION 'No student/finance tables found to clear.';
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
    'Students + finance cleared. Removed % student portal login(s). Staff accounts and academic/fee setup kept.',
    v_deleted_student_users;
END $$;

NOTIFY pgrst, 'reload schema';
