-- Extend is_staff() so exam branch (and other staff roles) are recognized by RLS.

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::TEXT IN (
        'super_admin',
        'campus_incharge',
        'registrar',
        'admission_officer',
        'sub_admission_officer',
        'hr',
        'finance_admin',
        'finance_officer',
        'cashier',
        'exam_officer',
        'receptionist',
        'teacher'
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_staff(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated;

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
            'super_admin',
            'campus_incharge',
            'registrar',
            'admission_officer',
            'sub_admission_officer',
            'hr',
            'finance_admin',
            'finance_officer',
            'cashier',
            'exam_officer',
            'receptionist',
            'teacher'
          )
      )
    )
  );

NOTIFY pgrst, 'reload schema';
