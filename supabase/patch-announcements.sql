-- Student announcements (run in Supabase SQL editor).

DO $$ BEGIN
  CREATE TYPE public.announcement_content_type AS ENUM ('text', 'voice', 'video');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.announcement_status AS ENUM ('draft', 'published');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_session_id UUID NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body_text TEXT,
  content_type public.announcement_content_type NOT NULL,
  media_path TEXT,
  media_mime_type TEXT,
  class_year_level INT CHECK (class_year_level IS NULL OR class_year_level >= 1),
  target_gender public.section_gender,
  status public.announcement_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT announcements_content_check CHECK (
    (content_type = 'text' AND body_text IS NOT NULL AND trim(body_text) <> '')
    OR (content_type = 'voice' AND media_path IS NOT NULL)
    OR (content_type = 'video' AND media_path IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_announcements_session
  ON public.announcements (academic_session_id, status, published_at DESC);

CREATE TABLE IF NOT EXISTS public.announcement_sections (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_sections_section
  ON public.announcement_sections (section_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('announcement-media', 'announcement-media', false)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.announcement_visible_to_student(p_announcement_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.announcements a
    JOIN public.students s ON s.user_id = p_user_id AND s.status = 'active'
    LEFT JOIN public.sections sec ON sec.id = s.section_id
    LEFT JOIN public.classes cls ON cls.id = COALESCE(s.class_id, sec.class_id)
    WHERE a.id = p_announcement_id
      AND a.status = 'published'
      AND a.academic_session_id = s.academic_session_id
      AND (a.class_year_level IS NULL OR cls.year_level = a.class_year_level)
      AND (a.target_gender IS NULL OR sec.gender = a.target_gender)
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.announcement_sections asx
          WHERE asx.announcement_id = a.id
        )
        OR EXISTS (
          SELECT 1 FROM public.announcement_sections asx
          WHERE asx.announcement_id = a.id AND asx.section_id = s.section_id
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.announcement_visible_to_student(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.announcement_visible_to_student(UUID, UUID) TO authenticated;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read announcements" ON public.announcements;
CREATE POLICY "Staff read announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage announcements" ON public.announcements;
CREATE POLICY "Staff manage announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Students read published announcements" ON public.announcements;
CREATE POLICY "Students read published announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (public.announcement_visible_to_student(id, auth.uid()));

DROP POLICY IF EXISTS "Staff manage announcement sections" ON public.announcement_sections;
CREATE POLICY "Staff manage announcement sections" ON public.announcement_sections
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Students read announcement sections" ON public.announcement_sections;
CREATE POLICY "Students read announcement sections" ON public.announcement_sections
  FOR SELECT TO authenticated
  USING (public.announcement_visible_to_student(announcement_id, auth.uid()));

DROP POLICY IF EXISTS "Staff upload announcement media" ON storage.objects;
CREATE POLICY "Staff upload announcement media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'announcement-media' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff update announcement media" ON storage.objects;
CREATE POLICY "Staff update announcement media" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'announcement-media' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff delete announcement media" ON storage.objects;
CREATE POLICY "Staff delete announcement media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'announcement-media' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read announcement media" ON storage.objects;
CREATE POLICY "Authenticated read announcement media" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'announcement-media');

NOTIFY pgrst, 'reload schema';
