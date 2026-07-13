-- Allow optional body_text with voice and video announcements.

ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_check;

ALTER TABLE public.announcements
  DROP CONSTRAINT IF EXISTS announcements_content_check;

ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_content_check CHECK (
    (content_type = 'text' AND body_text IS NOT NULL AND trim(body_text) <> '')
    OR (content_type = 'voice' AND media_path IS NOT NULL)
    OR (content_type = 'video' AND media_path IS NOT NULL)
  );

NOTIFY pgrst, 'reload schema';
