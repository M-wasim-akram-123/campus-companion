-- Sub Admission Officer enum (must be in its own migration / committed first)

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sub_admission_officer';

NOTIFY pgrst, 'reload schema';
