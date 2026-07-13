-- DANGER: Clears ALL campus data for fresh testing.
-- Run manually in Supabase SQL Editor only. Take a backup first if needed.
--
-- PRESERVES (login):
--   auth.users
--   auth.identities
--   public.profiles
--   public.user_roles
--
-- CLEARS:
--   every other public application table (students, finance, inquiries, etc.)
--   all storage files (student photos, documents, etc.)
--   active login session locks on profiles

DO $$
DECLARE
  v_tables TEXT;
  v_user_count INT;
BEGIN
  SELECT COUNT(*) INTO v_user_count FROM auth.users;
  IF v_user_count = 0 THEN
    RAISE EXCEPTION 'No auth users found. Create at least one login account before resetting.';
  END IF;

  -- Remove uploaded files (photos, documents, etc.)
  DELETE FROM storage.objects;

  -- Truncate all public tables except user login tables.
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
  INTO v_tables
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN ('profiles', 'user_roles');

  IF v_tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || v_tables || ' RESTART IDENTITY CASCADE';
  END IF;

  -- Clear single-device session locks so everyone can log in again.
  UPDATE public.profiles
  SET
    active_auth_session_id = NULL,
    last_seen_at = NULL
  WHERE active_auth_session_id IS NOT NULL
     OR last_seen_at IS NOT NULL;

  RAISE NOTICE 'Reset complete. Kept % login user(s). All campus data cleared.', v_user_count;
END $$;

NOTIFY pgrst, 'reload schema';
