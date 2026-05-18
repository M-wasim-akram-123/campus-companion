-- Run in Supabase Dashboard → SQL Editor
-- Fixes: "permission denied for function has_role"

-- RLS policies call these functions; authenticated users must be allowed to execute them.
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated;

-- ============ Open policies for development (any logged-in user) ============

-- Inquiries
DROP POLICY IF EXISTS "Staff view inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Staff insert inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Staff update inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Staff delete inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Authenticated inquiries" ON public.inquiries;
CREATE POLICY "Authenticated inquiries" ON public.inquiries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Students
DROP POLICY IF EXISTS "Staff view students" ON public.students;
DROP POLICY IF EXISTS "Staff insert students" ON public.students;
DROP POLICY IF EXISTS "Staff update students" ON public.students;
DROP POLICY IF EXISTS "Super admin delete students" ON public.students;
DROP POLICY IF EXISTS "Authenticated students" ON public.students;
CREATE POLICY "Authenticated students" ON public.students
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Programs / classes / sections / sessions
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
DROP POLICY IF EXISTS "Authenticated manage sessions" ON public.academic_sessions;
CREATE POLICY "Authenticated manage sessions" ON public.academic_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- User roles: read own row without calling has_role in policy
DROP POLICY IF EXISTS "Authenticated read own roles" ON public.user_roles;
CREATE POLICY "Authenticated read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Storage (student photos)
DROP POLICY IF EXISTS "Staff read student photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff upload student photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff update student photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated student photos" ON storage.objects;

CREATE POLICY "Authenticated read student photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'student-photos');

CREATE POLICY "Authenticated upload student photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-photos');

CREATE POLICY "Authenticated update student photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'student-photos');

NOTIFY pgrst, 'reload schema';
