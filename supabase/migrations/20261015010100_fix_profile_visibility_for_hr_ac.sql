-- Fix BUG-11: Allow HR and academic_coordinator to see teacher/hod/bs_coordinator profiles
-- so they can assign teachers and create LMS teacher profiles

DROP POLICY IF EXISTS "Staff view staff profiles" ON public.profiles;

CREATE POLICY "Staff view staff profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'super_admin')
    OR (
      -- HR and academic coordinators need to see all staff for teacher assignment
      (public.has_role(auth.uid(), 'hr') OR public.has_role(auth.uid(), 'academic_coordinator'))
      AND public.is_staff(profiles.id)
    )
    OR (
      -- Other staff can see profiles with relevant roles
      public.is_staff(auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = profiles.id
          AND ur.role IN (
            'super_admin',
            'admission_officer',
            'sub_admission_officer',
            'hr',
            'finance_admin',
            'finance_officer',
            'bs_finance_admin',
            'cashier',
            'campus_incharge',
            'registrar',
            'exam_officer',
            'receptionist',
            'teacher',
            'hod',
            'academic_coordinator',
            'bs_coordinator'
          )
      )
    )
  );

NOTIFY pgrst, 'reload schema';
