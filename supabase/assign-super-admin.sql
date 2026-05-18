-- Assign super_admin (change email if needed)
-- Use this instead of /signup if you get HTTP 429 rate limit errors
-- Run in Supabase Dashboard → SQL Editor (on YOUR project)

-- 1) Fix function permissions (required for 42501 errors)
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated;

-- 2) Assign super_admin role
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role
FROM auth.users
WHERE email IN ('admin@college.com', 'admin@college.edu.pk')
ON CONFLICT (user_id, role) DO NOTHING;

-- 3) Ensure profile exists
INSERT INTO public.profiles (id, full_name)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', 'Admin')
FROM auth.users
WHERE email IN ('admin@college.com', 'admin@college.edu.pk')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- 4) Confirm emails so login works without waiting for confirmation link
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email IN ('admin@college.com', 'admin@college.edu.pk');

-- Verify
SELECT u.email, u.email_confirmed_at IS NOT NULL AS confirmed, ur.role
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email IN ('admin@college.com', 'admin@college.edu.pk');
