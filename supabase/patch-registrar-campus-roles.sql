-- Adds Registrar and Campus Incharge roles for student edit permissions.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'registrar';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'campus_incharge';

NOTIFY pgrst, 'reload schema';
