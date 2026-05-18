-- Allow any staff role to manage academic structure (not only super_admin / admission_officer)

DROP POLICY IF EXISTS "Staff manage sessions" ON public.academic_sessions;
CREATE POLICY "Staff manage sessions" ON public.academic_sessions FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage programs" ON public.programs;
CREATE POLICY "Staff manage programs" ON public.programs FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage classes" ON public.classes;
CREATE POLICY "Staff manage classes" ON public.classes FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage sections" ON public.sections;
CREATE POLICY "Staff manage sections" ON public.sections FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
