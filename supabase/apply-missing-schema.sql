-- Run once in Supabase Dashboard → SQL Editor
-- Fixes: "Could not find the table 'public.academic_sessions'"

-- ============ ENUM ============
DO $$ BEGIN
  CREATE TYPE public.section_gender AS ENUM ('boys', 'girls');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============ ACADEMIC SESSIONS ============
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

DROP POLICY IF EXISTS "Authenticated read sessions" ON public.academic_sessions;
CREATE POLICY "Authenticated read sessions" ON public.academic_sessions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Staff manage sessions" ON public.academic_sessions;
DROP POLICY IF EXISTS "Authenticated manage sessions" ON public.academic_sessions;
CREATE POLICY "Authenticated manage sessions" ON public.academic_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.academic_sessions (label, start_year, end_year, is_active)
VALUES ('2025-2026', 2025, 2026, true)
ON CONFLICT (label) DO UPDATE SET is_active = EXCLUDED.is_active;

-- ============ MATRIC COLUMNS (inquiries / students) ============
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

-- ============ SECTIONS: session + gender ============
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

    CREATE INDEX IF NOT EXISTS idx_sections_class_session_gender
      ON public.sections (class_id, session_id, gender);
  END IF;
END $$;

-- ============ OPEN POLICIES (no role gate for now) ============
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

-- Fix has_role / is_staff execute + open RLS (run fix-permissions.sql block if errors persist)
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
