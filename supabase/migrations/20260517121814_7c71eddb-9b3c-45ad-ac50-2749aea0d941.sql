
-- fix search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- revoke public execute on security-definer funcs (RLS still uses them server-side)
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Tighten storage list policy: drop broad SELECT, allow only staff to list/read
DROP POLICY IF EXISTS "Student photos publicly readable" ON storage.objects;
CREATE POLICY "Staff read student photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'student-photos' AND public.is_staff(auth.uid()));

-- Make bucket private (we'll use signed URLs / authenticated reads)
UPDATE storage.buckets SET public = false WHERE id = 'student-photos';
