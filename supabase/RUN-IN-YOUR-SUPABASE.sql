-- =============================================================================
-- PATCH ONLY — for projects that ALREADY have the base schema
--
-- FRESH / EMPTY project? Run BOOTSTRAP-FRESH-SUPABASE.sql first (not this file).
-- Error "public.app_role does not exist" = you need BOOTSTRAP-FRESH-SUPABASE.sql.
--
-- Steps (new project):
-- 1. BOOTSTRAP-FRESH-SUPABASE.sql
-- 2. create-admin.sql
-- 3. Log in at /login
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role'
  ) THEN
    RAISE EXCEPTION 'Missing base schema. Run supabase/BOOTSTRAP-FRESH-SUPABASE.sql first, then create-admin.sql.';
  END IF;
END $$;

-- Allow RLS policies to call role helpers (fixes 42501 permission denied)
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated;

-- Enum for boys/girls sections
DO $$ BEGIN
  CREATE TYPE public.section_gender AS ENUM ('boys', 'girls');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Academic sessions table
CREATE TABLE IF NOT EXISTS public.academic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  start_year INT NOT NULL,
  end_year INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (label)
);

ALTER TABLE public.academic_sessions ENABLE ROW LEVEL SECURITY;

-- Matric + session columns
ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS matric_school TEXT,
  ADD COLUMN IF NOT EXISTS matric_marks_obtained NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS matric_marks_total NUMERIC(6,2);

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS matric_school TEXT,
  ADD COLUMN IF NOT EXISTS matric_marks_obtained NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS matric_marks_total NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inquiries' AND column_name = 'preferred_section_id'
  ) THEN
    ALTER TABLE public.inquiries
      ADD COLUMN preferred_section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Sections: add session_id + gender (only if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sections' AND column_name = 'session_id'
  ) THEN
    UPDATE public.students SET section_id = NULL WHERE section_id IS NOT NULL;
    UPDATE public.inquiries SET preferred_section_id = NULL WHERE preferred_section_id IS NOT NULL;
    DELETE FROM public.sections;

    ALTER TABLE public.sections
      ADD COLUMN session_id UUID REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
      ADD COLUMN gender public.section_gender NOT NULL DEFAULT 'boys';

    ALTER TABLE public.sections ALTER COLUMN session_id SET NOT NULL;
    ALTER TABLE public.sections DROP CONSTRAINT IF EXISTS sections_class_id_name_key;
    ALTER TABLE public.sections
      ADD CONSTRAINT sections_class_session_gender_name_key
      UNIQUE (class_id, session_id, gender, name);
  END IF;
END $$;

INSERT INTO public.academic_sessions (label, start_year, end_year, is_active)
VALUES ('2025-2026', 2025, 2026, true)
ON CONFLICT (label) DO UPDATE SET is_active = true;

-- Open RLS: any logged-in user (development)
DROP POLICY IF EXISTS "Staff view inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Staff insert inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Staff update inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Staff delete inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Authenticated inquiries" ON public.inquiries;
CREATE POLICY "Authenticated inquiries" ON public.inquiries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Staff view students" ON public.students;
DROP POLICY IF EXISTS "Staff insert students" ON public.students;
DROP POLICY IF EXISTS "Staff update students" ON public.students;
DROP POLICY IF EXISTS "Super admin delete students" ON public.students;
DROP POLICY IF EXISTS "Authenticated students" ON public.students;
CREATE POLICY "Authenticated students" ON public.students
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Super admin manage programs" ON public.programs;
DROP POLICY IF EXISTS "Staff manage programs" ON public.programs;
DROP POLICY IF EXISTS "Authenticated manage programs" ON public.programs;
CREATE POLICY "Authenticated manage programs" ON public.programs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Super admin manage classes" ON public.classes;
DROP POLICY IF EXISTS "Staff manage classes" ON public.classes;
DROP POLICY IF EXISTS "Authenticated manage classes" ON public.classes;
CREATE POLICY "Authenticated manage classes" ON public.classes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Super admin manage sections" ON public.sections;
DROP POLICY IF EXISTS "Staff manage sections" ON public.sections;
DROP POLICY IF EXISTS "Authenticated manage sections" ON public.sections;
CREATE POLICY "Authenticated manage sections" ON public.sections
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Staff manage sessions" ON public.academic_sessions;
DROP POLICY IF EXISTS "Authenticated read sessions" ON public.academic_sessions;
DROP POLICY IF EXISTS "Authenticated manage sessions" ON public.academic_sessions;
CREATE POLICY "Authenticated manage sessions" ON public.academic_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read own roles" ON public.user_roles;
CREATE POLICY "Authenticated read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff read student photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff upload student photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff update student photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read student photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload student photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update student photos" ON storage.objects;

CREATE POLICY "Authenticated read student photos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'student-photos');
CREATE POLICY "Authenticated upload student photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'student-photos');
CREATE POLICY "Authenticated update student photos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'student-photos');

NOTIFY pgrst, 'reload schema';
