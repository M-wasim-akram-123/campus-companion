-- Run in Supabase SQL Editor if staff/officer names show as Unknown.

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
          AND ur.role::TEXT IN ('super_admin','admission_officer','sub_admission_officer','hr','finance_admin','finance_officer','cashier','receptionist','teacher')
      )
    )
  );

INSERT INTO public.profiles (id, full_name, phone)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), u.email),
  NULLIF(u.raw_user_meta_data->>'phone', '')
FROM auth.users u
WHERE EXISTS (
  SELECT 1
  FROM public.user_roles ur
  WHERE ur.user_id = u.id
)
ON CONFLICT (id) DO UPDATE
SET
  full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
  phone = COALESCE(NULLIF(public.profiles.phone, ''), EXCLUDED.phone),
  updated_at = now();

NOTIFY pgrst, 'reload schema';
