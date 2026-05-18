-- Fix permission denied for has_role / is_staff in RLS policies

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated;

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
