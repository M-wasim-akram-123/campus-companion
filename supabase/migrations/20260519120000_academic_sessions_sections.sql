-- Academic sessions, gendered sections, no seeded section names

CREATE TYPE public.section_gender AS ENUM ('boys', 'girls');

CREATE TABLE public.academic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  start_year INT NOT NULL,
  end_year INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (label)
);

ALTER TABLE public.academic_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read sessions" ON public.academic_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff manage sessions" ON public.academic_sessions FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  );

INSERT INTO public.academic_sessions (label, start_year, end_year, is_active)
VALUES ('2025-2026', 2025, 2026, true)
ON CONFLICT (label) DO NOTHING;

-- Remove any pre-seeded section rows (A/B, stream names, etc.)
UPDATE public.students SET section_id = NULL WHERE section_id IS NOT NULL;
UPDATE public.inquiries SET preferred_section_id = NULL WHERE preferred_section_id IS NOT NULL;
DELETE FROM public.sections;

ALTER TABLE public.sections
  ADD COLUMN session_id UUID REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  ADD COLUMN gender public.section_gender NOT NULL DEFAULT 'boys';

ALTER TABLE public.sections
  ALTER COLUMN session_id SET NOT NULL;

ALTER TABLE public.sections
  DROP CONSTRAINT IF EXISTS sections_class_id_name_key;

ALTER TABLE public.sections
  ADD CONSTRAINT sections_class_session_gender_name_key
  UNIQUE (class_id, session_id, gender, name);

CREATE INDEX idx_sections_class_session_gender ON public.sections (class_id, session_id, gender);

ALTER TABLE public.students
  ADD COLUMN academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL;

-- Staff can manage programs & classes (BS created in app)
DROP POLICY IF EXISTS "Super admin manage programs" ON public.programs;
CREATE POLICY "Staff manage programs" ON public.programs FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  );

DROP POLICY IF EXISTS "Super admin manage classes" ON public.classes;
CREATE POLICY "Staff manage classes" ON public.classes FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  );

-- Drop seeded BS program if present (BS programs added via Academic Setup)
DELETE FROM public.classes
WHERE program_id IN (SELECT id FROM public.programs WHERE type = 'bs' AND name = 'BS Program');

DELETE FROM public.programs WHERE type = 'bs' AND name = 'BS Program';
