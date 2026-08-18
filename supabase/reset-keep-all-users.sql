-- DANGER: Clears ALL campus data. Keeps system (staff) login accounts only.
-- Run in Supabase SQL Editor. Take a backup first if you need any of this data.
--
-- KEEPS:
--   auth.users / auth.identities for staff (any non-student role)
--   public.profiles + public.user_roles for those staff accounts
--
-- CLEARS:
--   every other public application table
--   student-only portal logins (role = student with no staff role)
--   all storage files
--   active login session locks on profiles

DO $$
DECLARE
  v_tables TEXT;
  v_staff_ids UUID[];
  v_staff_count INT := 0;
  v_deleted_student_users INT := 0;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT user_id), ARRAY[]::UUID[])
  INTO v_staff_ids
  FROM public.user_roles
  WHERE role::TEXT <> 'student';

  v_staff_count := COALESCE(cardinality(v_staff_ids), 0);
  IF v_staff_count = 0 THEN
    RAISE EXCEPTION
      'No staff users found (non-student roles). Aborting so you are not locked out.';
  END IF;

  PERFORM set_config('app.allow_student_purge', 'on', true);
  PERFORM set_config('storage.allow_delete_query', 'true', true);

  -- Wipe uploaded files (photos, documents, announcement media, etc.)
  DELETE FROM storage.objects;

  -- Truncate all public tables except login tables.
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY tablename)
  INTO v_tables
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN ('profiles', 'user_roles');

  IF v_tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || v_tables || ' RESTART IDENTITY CASCADE';
  END IF;

  -- Drop student-only portal accounts; keep every staff login + their roles.
  DELETE FROM public.user_roles
  WHERE user_id <> ALL (v_staff_ids);

  DELETE FROM public.profiles
  WHERE id <> ALL (v_staff_ids);

  DELETE FROM auth.users
  WHERE id <> ALL (v_staff_ids);

  GET DIAGNOSTICS v_deleted_student_users = ROW_COUNT;

  -- Clear single-device session locks so staff can log in again.
  UPDATE public.profiles
  SET
    active_auth_session_id = NULL,
    last_seen_at = NULL
  WHERE active_auth_session_id IS NOT NULL
     OR last_seen_at IS NOT NULL;

  RAISE NOTICE
    'Full reset complete. Kept % staff login(s). Removed % non-staff auth user(s). All other public tables cleared.',
    v_staff_count,
    v_deleted_student_users;
END $$;

NOTIFY pgrst, 'reload schema';
