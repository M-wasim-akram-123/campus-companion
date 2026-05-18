-- Super admin (also run supabase/create-admin.sql on hosted if seed did not run)
-- Email:    admin@college.edu.pk
-- Password: SuperAdmin@2026

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user_id UUID := 'a0000000-0000-4000-8000-000000000001';
  v_email TEXT := 'admin@college.edu.pk';
  v_encrypted_pw TEXT := crypt('SuperAdmin@2026', gen_salt('bf'));
  v_instance_id UUID;
BEGIN
  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  DELETE FROM auth.identities WHERE user_id = v_user_id;
  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  DELETE FROM public.profiles WHERE id = v_user_id;
  DELETE FROM auth.users WHERE id = v_user_id;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES (
    v_instance_id,
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    v_encrypted_pw,
    NOW(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Super Admin"}',
    NOW(),
    NOW()
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    format('{"sub": "%s", "email": "%s"}', v_user_id, v_email)::jsonb,
    'email',
    v_email,
    NOW(),
    NOW(),
    NOW()
  );

  INSERT INTO public.profiles (id, full_name)
  VALUES (v_user_id, 'Super Admin')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.academic_sessions (label, start_year, end_year, is_active)
  VALUES ('2025-2026', 2025, 2026, true)
  ON CONFLICT (label) DO UPDATE SET is_active = true;
END $$;
