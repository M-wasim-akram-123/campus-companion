-- DANGER: This clears campus data and keeps only Super Admin account(s).
-- Run manually in Supabase SQL editor only after you have a backup.
--
-- What it preserves:
--   - auth.users that currently have role = 'super_admin'
--   - public.profiles rows for those users
--   - public.user_roles rows with role = 'super_admin' for those users
--
-- What it clears:
--   - all other public application tables
--   - all non-super-admin auth users
--   - all storage objects

DO $$
DECLARE
  v_tables TEXT;
  v_super_admin_count INT;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS keep_super_admin_users (
    user_id UUID PRIMARY KEY
  ) ON COMMIT DROP;

  TRUNCATE keep_super_admin_users;

  INSERT INTO keep_super_admin_users (user_id)
  SELECT DISTINCT user_id
  FROM public.user_roles
  WHERE role::TEXT = 'super_admin';

  SELECT COUNT(*) INTO v_super_admin_count FROM keep_super_admin_users;
  IF v_super_admin_count = 0 THEN
    RAISE EXCEPTION 'No super_admin user found. Aborting reset.';
  END IF;

  DELETE FROM storage.objects;

  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
  INTO v_tables
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN ('profiles', 'user_roles');

  IF v_tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || v_tables || ' RESTART IDENTITY CASCADE';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id NOT IN (SELECT user_id FROM keep_super_admin_users)
     OR role::TEXT <> 'super_admin';

  DELETE FROM public.profiles
  WHERE id NOT IN (SELECT user_id FROM keep_super_admin_users);

  DELETE FROM auth.users
  WHERE id NOT IN (SELECT user_id FROM keep_super_admin_users);

  RAISE NOTICE 'Reset complete. Kept % super_admin account(s).', v_super_admin_count;
END $$;

NOTIFY pgrst, 'reload schema';
