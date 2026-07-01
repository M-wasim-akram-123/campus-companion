-- Diagnostic for "Database error deleting user".
--
-- 1) List every foreign key that points at auth.users together with its delete
--    rule. Anything showing "NO ACTION" or "RESTRICT" will block user deletion.

SELECT
  rel.relname        AS table_name,
  att.attname        AS column_name,
  con.conname        AS constraint_name,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END                AS on_delete
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
WHERE con.contype = 'f'
  AND con.confrelid = 'auth.users'::regclass
ORDER BY on_delete DESC, table_name;

-- 2) To see what a SPECIFIC user still owns, replace the id below and run.
--    (Uncomment the block.)
--
-- DO $$
-- DECLARE
--   target UUID := '00000000-0000-0000-0000-000000000000';  -- <-- user id here
--   rec RECORD;
--   col_name TEXT;
--   cnt BIGINT;
-- BEGIN
--   FOR rec IN
--     SELECT rel.relname AS table_name, con.conkey, con.conrelid
--     FROM pg_constraint con
--     JOIN pg_class rel ON rel.oid = con.conrelid
--     JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
--     WHERE nsp.nspname = 'public'
--       AND con.contype = 'f'
--       AND con.confrelid = 'auth.users'::regclass
--   LOOP
--     SELECT att.attname INTO col_name
--     FROM pg_attribute att
--     WHERE att.attrelid = rec.conrelid AND att.attnum = rec.conkey[1];
--     EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', rec.table_name, col_name)
--       INTO cnt USING target;
--     IF cnt > 0 THEN
--       RAISE NOTICE '% references in %.%', cnt, rec.table_name, col_name;
--     END IF;
--   END LOOP;
-- END $$;
