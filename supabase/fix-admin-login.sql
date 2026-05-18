-- Fix "Database error querying schema" on login for SQL-created users.
-- GoTrue cannot read NULL in token columns — set them to empty strings.
-- Run this, then try /login again.

UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email = 'admin@college.edu.pk';

-- Ensure identity exists for email provider
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
SELECT
  gen_random_uuid(),
  u.id,
  format('{"sub": "%s", "email": "%s"}', u.id, u.email)::jsonb,
  'email',
  u.email,
  NOW(),
  NOW(),
  NOW()
FROM auth.users u
WHERE u.email = 'admin@college.edu.pk'
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = u.id AND i.provider = 'email'
  );

SELECT id, email, email_confirmed_at IS NOT NULL AS confirmed
FROM auth.users
WHERE email = 'admin@college.edu.pk';
