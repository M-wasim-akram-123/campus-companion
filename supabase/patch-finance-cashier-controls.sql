-- Patch: cashier session controls and finance admin signoff.
-- Run after patch-record-fee-payment.sql.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cashier';

ALTER TABLE public.cashier_sessions
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signoff_notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cashier_sessions_one_open_per_cashier
  ON public.cashier_sessions (cashier_id)
  WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.open_cashier_session(
  p_opening_cash NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_session_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = v_user
      AND role::TEXT IN ('cashier', 'finance_admin', 'finance_officer', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Only finance staff can open cashier sessions.';
  END IF;

  IF p_opening_cash < 0 THEN
    RAISE EXCEPTION 'Opening cash cannot be negative.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cashier_sessions
    WHERE cashier_id = v_user AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'You already have an open cashier session.';
  END IF;

  INSERT INTO public.cashier_sessions (cashier_id, opening_cash, expected_cash, notes)
  VALUES (v_user, p_opening_cash, 0, p_notes)
  RETURNING id INTO v_session_id;

  INSERT INTO public.finance_audit_log (actor_id, action, entity_type, entity_id, after_data, notes)
  VALUES (
    v_user,
    'cashier_session_opened',
    'cashier_sessions',
    v_session_id,
    jsonb_build_object('opening_cash', p_opening_cash),
    p_notes
  );

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cashier_session(
  p_session_id UUID,
  p_counted_cash NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_session RECORD;
  v_expected_drawer NUMERIC;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  SELECT * INTO v_session
  FROM public.cashier_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cashier session not found.';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Cashier session is not open.';
  END IF;

  IF v_session.cashier_id <> v_user AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = v_user
      AND role::TEXT = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Only the cashier or super admin can close this session.';
  END IF;

  IF p_counted_cash < 0 THEN
    RAISE EXCEPTION 'Counted cash cannot be negative.';
  END IF;

  v_expected_drawer := COALESCE(v_session.opening_cash, 0) + COALESCE(v_session.expected_cash, 0);

  UPDATE public.cashier_sessions
  SET
    status = 'closed',
    closed_at = now(),
    counted_cash = p_counted_cash,
    variance = p_counted_cash - v_expected_drawer,
    notes = p_notes,
    closed_by = v_user,
    updated_at = now()
  WHERE id = p_session_id;

  INSERT INTO public.finance_audit_log (actor_id, action, entity_type, entity_id, after_data, notes)
  VALUES (
    v_user,
    'cashier_session_closed',
    'cashier_sessions',
    p_session_id,
    jsonb_build_object(
      'opening_cash', v_session.opening_cash,
      'cash_collected', v_session.expected_cash,
      'expected_drawer_cash', v_expected_drawer,
      'counted_cash', p_counted_cash,
      'variance', p_counted_cash - v_expected_drawer
    ),
    p_notes
  );

  RETURN p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_cashier_session(
  p_session_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_session RECORD;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = v_user
      AND role::TEXT IN ('finance_admin', 'finance_officer', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Only finance admin can sign off cashier sessions.';
  END IF;

  SELECT * INTO v_session
  FROM public.cashier_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cashier session not found.';
  END IF;

  IF v_session.status <> 'closed' THEN
    RAISE EXCEPTION 'Only closed cashier sessions can be signed off.';
  END IF;

  UPDATE public.cashier_sessions
  SET
    approved_by = v_user,
    approved_at = now(),
    signoff_notes = p_notes,
    updated_at = now()
  WHERE id = p_session_id;

  INSERT INTO public.finance_audit_log (actor_id, action, entity_type, entity_id, after_data, notes)
  VALUES (
    v_user,
    'cashier_session_signed_off',
    'cashier_sessions',
    p_session_id,
    jsonb_build_object('approved_at', now(), 'variance', v_session.variance),
    p_notes
  );

  RETURN p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_cashier_session(NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cashier_session(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_cashier_session(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
