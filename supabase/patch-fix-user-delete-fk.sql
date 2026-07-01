-- Fix "Database error deleting user" in User Management.
--
-- Root cause: one or more tables reference auth.users(id) with a delete rule of
-- NO ACTION or RESTRICT. Any user referenced by such a row (e.g. created_by,
-- recorded_by, assigned_to, etc.) cannot be deleted.
--
-- This patch scans EVERY foreign key in the public schema that points at
-- auth.users and, for any whose delete rule is NO ACTION or RESTRICT, rebuilds
-- it as ON DELETE SET NULL (when the column is nullable) or ON DELETE CASCADE
-- (when the column is NOT NULL, e.g. join tables like user_roles).

DO $$
DECLARE
  rec RECORD;
  col_name TEXT;
  is_notnull BOOLEAN;
  new_action TEXT;
BEGIN
  FOR rec IN
    SELECT
      con.conname,
      rel.relname AS table_name,
      con.conkey,
      con.conrelid,
      con.confdeltype
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND con.contype = 'f'
      AND con.confrelid = 'auth.users'::regclass
      AND con.confdeltype IN ('a', 'r')  -- a = NO ACTION, r = RESTRICT
  LOOP
    -- Single-column FKs only (all auth.users references in this app are single-column).
    SELECT att.attname, att.attnotnull
      INTO col_name, is_notnull
    FROM pg_attribute att
    WHERE att.attrelid = rec.conrelid
      AND att.attnum = rec.conkey[1];

    new_action := CASE WHEN is_notnull THEN 'CASCADE' ELSE 'SET NULL' END;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', rec.table_name, rec.conname);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE %s',
      rec.table_name, rec.conname, col_name, new_action
    );

    RAISE NOTICE 'Fixed %.% (%) -> ON DELETE %', rec.table_name, col_name, rec.conname, new_action;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
