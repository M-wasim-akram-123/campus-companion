-- Allow staff to see sub admission officers (and other staff) when assigning
-- a follow-up officer. Run in Supabase SQL Editor.
-- NOTE: The app also loads this list via a server endpoint that bypasses RLS,
-- so the dropdown works even without this patch. This keeps direct profile
-- reads consistent.

DROP POLICY IF EXISTS "Staff view staff profiles" ON public.profiles;
CREATE POLICY "Staff view staff profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'super_admin')
    OR (
      public.is_staff(auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = profiles.id
          AND ur.role::TEXT IN (
            'super_admin','admission_officer','sub_admission_officer','hr',
            'finance_admin','finance_officer','cashier','receptionist','teacher'
          )
      )
    )
  );

NOTIFY pgrst, 'reload schema';
