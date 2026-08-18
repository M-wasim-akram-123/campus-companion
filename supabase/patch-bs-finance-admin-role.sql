-- BS Finance Admin: separate from Intermediate finance_officer / finance_admin / cashier.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'bs_finance_admin';

CREATE OR REPLACE FUNCTION public.is_finance_staff(_user_id UUID)
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
        'finance_admin',
        'finance_officer',
        'cashier',
        'bs_finance_admin'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_finance_admin(_user_id UUID)
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
        'finance_admin',
        'finance_officer',
        'bs_finance_admin'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_finance_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance_admin(UUID) TO authenticated;
