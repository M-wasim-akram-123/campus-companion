-- Finance control foundation: immutable ledger, transactional payments, fines, cashier closing

DO $$ BEGIN
  CREATE TYPE public.finance_ledger_entry_type AS ENUM (
    'fee_charge',
    'fine',
    'late_fee',
    'payment',
    'waiver',
    'adjustment',
    'reversal',
    'bad_debt'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.cashier_session_status AS ENUM ('open', 'closed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE public.student_status ADD VALUE IF NOT EXISTS 'left';
ALTER TYPE public.student_status ADD VALUE IF NOT EXISTS 'bad_debt';

CREATE TABLE IF NOT EXISTS public.student_finance_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  installment_id UUID REFERENCES public.student_fee_installments(id) ON DELETE SET NULL,
  voucher_id UUID REFERENCES public.fee_vouchers(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.fee_payments(id) ON DELETE SET NULL,
  entry_type public.finance_ledger_entry_type NOT NULL,
  component_type public.fee_component_type,
  label TEXT NOT NULL,
  debit NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'posted',
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  reversed_entry_id UUID REFERENCES public.student_finance_ledger(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (debit > 0 OR credit > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_finance_ledger_installment_charge
  ON public.student_finance_ledger (installment_id)
  WHERE entry_type = 'fee_charge' AND installment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_finance_ledger_student ON public.student_finance_ledger (student_id);
CREATE INDEX IF NOT EXISTS idx_student_finance_ledger_type ON public.student_finance_ledger (entry_type);
CREATE INDEX IF NOT EXISTS idx_student_finance_ledger_effective ON public.student_finance_ledger (effective_date);
CREATE INDEX IF NOT EXISTS idx_student_finance_ledger_payment ON public.student_finance_ledger (payment_id);

CREATE TABLE IF NOT EXISTS public.finance_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  before_data JSONB,
  after_data JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_audit_log_actor ON public.finance_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_finance_audit_log_student ON public.finance_audit_log (student_id);
CREATE INDEX IF NOT EXISTS idx_finance_audit_log_created ON public.finance_audit_log (created_at);

CREATE TABLE IF NOT EXISTS public.cashier_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.cashier_session_status NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_cash NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  expected_cash NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (expected_cash >= 0),
  counted_cash NUMERIC(12, 2),
  variance NUMERIC(12, 2),
  notes TEXT,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashier_sessions_cashier ON public.cashier_sessions (cashier_id);
CREATE INDEX IF NOT EXISTS idx_cashier_sessions_status ON public.cashier_sessions (status);
CREATE INDEX IF NOT EXISTS idx_cashier_sessions_opened ON public.cashier_sessions (opened_at);

ALTER TABLE public.fee_payments
  ADD COLUMN IF NOT EXISTS cashier_session_id UUID REFERENCES public.cashier_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_fee_payments_cashier_session ON public.fee_payments (cashier_session_id);

ALTER TABLE public.student_finance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashier_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated student finance ledger" ON public.student_finance_ledger;
CREATE POLICY "Authenticated student finance ledger" ON public.student_finance_ledger
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated finance audit log" ON public.finance_audit_log;
CREATE POLICY "Authenticated finance audit log" ON public.finance_audit_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated cashier sessions" ON public.cashier_sessions;
CREATE POLICY "Authenticated cashier sessions" ON public.cashier_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.student_finance_ledger (
  student_id,
  installment_id,
  entry_type,
  component_type,
  label,
  debit,
  effective_date,
  status,
  notes,
  created_at
)
SELECT
  i.student_id,
  i.id,
  'fee_charge'::public.finance_ledger_entry_type,
  i.component_type,
  i.label,
  i.amount,
  i.due_date,
  'posted',
  'Initial ledger charge from existing installment schedule.',
  i.created_at
FROM public.student_fee_installments i
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.add_student_finance_charge(
  p_student_id UUID,
  p_entry_type public.finance_ledger_entry_type,
  p_label TEXT,
  p_amount NUMERIC,
  p_component_type public.fee_component_type DEFAULT NULL,
  p_effective_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_id UUID;
  v_fee_plan_id UUID;
  v_installment_id UUID;
  v_sort_order INT;
BEGIN
  IF p_entry_type NOT IN ('fine', 'late_fee', 'adjustment') THEN
    RAISE EXCEPTION 'Only fine, late_fee, or adjustment charges can be created with this function.';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Charge amount must be greater than zero.';
  END IF;

  SELECT id INTO v_fee_plan_id
  FROM public.student_fee_plans
  WHERE student_id = p_student_id;

  IF v_fee_plan_id IS NULL THEN
    RAISE EXCEPTION 'Student has no fee plan. Create a fee plan before adding finance charges.';
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_sort_order
  FROM public.student_fee_installments
  WHERE student_id = p_student_id;

  INSERT INTO public.student_fee_installments (
    student_id,
    fee_plan_id,
    label,
    component_type,
    amount,
    paid_amount,
    due_date,
    status,
    sort_order
  )
  VALUES (
    p_student_id,
    v_fee_plan_id,
    trim(p_label),
    p_component_type,
    p_amount,
    0,
    COALESCE(p_effective_date, CURRENT_DATE),
    'pending',
    v_sort_order
  )
  RETURNING id INTO v_installment_id;

  INSERT INTO public.student_finance_ledger (
    student_id,
    installment_id,
    entry_type,
    component_type,
    label,
    debit,
    effective_date,
    notes,
    created_by
  )
  VALUES (
    p_student_id,
    v_installment_id,
    p_entry_type,
    p_component_type,
    trim(p_label),
    p_amount,
    COALESCE(p_effective_date, CURRENT_DATE),
    p_notes,
    v_user
  )
  RETURNING id INTO v_id;

  INSERT INTO public.finance_audit_log (actor_id, action, entity_type, entity_id, student_id, after_data, notes)
  VALUES (
    v_user,
    'finance_charge_created',
    'student_finance_ledger',
    v_id,
    p_student_id,
    jsonb_build_object('entry_type', p_entry_type, 'label', p_label, 'amount', p_amount),
    p_notes
  );

  RETURN v_installment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_fee_payment(
  p_student_id UUID,
  p_amount NUMERIC,
  p_receipt_number TEXT,
  p_payment_method public.payment_method,
  p_paid_at TIMESTAMPTZ DEFAULT now(),
  p_notes TEXT DEFAULT NULL,
  p_voucher_id UUID DEFAULT NULL,
  p_cashier_session_id UUID DEFAULT NULL,
  p_allocations JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_payment_id UUID;
  v_alloc JSONB;
  v_installment_id UUID;
  v_alloc_amount NUMERIC;
  v_alloc_sum NUMERIC := 0;
  v_inst RECORD;
  v_new_paid NUMERIC;
  v_status TEXT;
  v_voucher RECORD;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;
  IF trim(COALESCE(p_receipt_number, '')) = '' THEN
    RAISE EXCEPTION 'Receipt number is required.';
  END IF;
  IF jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Payment allocations must be an array.';
  END IF;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_alloc_amount := COALESCE((v_alloc->>'amount')::NUMERIC, 0);
    v_alloc_sum := v_alloc_sum + v_alloc_amount;
  END LOOP;

  IF abs(v_alloc_sum - p_amount) > 0.01 THEN
    RAISE EXCEPTION 'Allocation total must match payment amount.';
  END IF;

  INSERT INTO public.fee_payments (
    receipt_number,
    student_id,
    voucher_id,
    amount,
    payment_method,
    paid_at,
    notes,
    recorded_by,
    cashier_session_id
  )
  VALUES (
    trim(p_receipt_number),
    p_student_id,
    p_voucher_id,
    p_amount,
    p_payment_method,
    COALESCE(p_paid_at, now()),
    p_notes,
    v_user,
    p_cashier_session_id
  )
  RETURNING id INTO v_payment_id;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_installment_id := (v_alloc->>'installmentId')::UUID;
    v_alloc_amount := (v_alloc->>'amount')::NUMERIC;

    SELECT * INTO v_inst
    FROM public.student_fee_installments
    WHERE id = v_installment_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Installment % not found.', v_installment_id;
    END IF;
    IF v_inst.student_id <> p_student_id THEN
      RAISE EXCEPTION 'Installment does not belong to this student.';
    END IF;
    IF v_alloc_amount <= 0 THEN
      RAISE EXCEPTION 'Allocation amount must be greater than zero.';
    END IF;
    IF v_alloc_amount > (v_inst.amount - v_inst.paid_amount) + 0.01 THEN
      RAISE EXCEPTION 'Allocation exceeds installment balance.';
    END IF;

    INSERT INTO public.fee_payment_allocations (payment_id, installment_id, amount)
    VALUES (v_payment_id, v_installment_id, v_alloc_amount);

    v_new_paid := LEAST(v_inst.amount, v_inst.paid_amount + v_alloc_amount);
    v_status := CASE
      WHEN v_new_paid <= 0 THEN 'pending'
      WHEN v_new_paid >= v_inst.amount THEN 'paid'
      ELSE 'partial'
    END;

    UPDATE public.student_fee_installments
    SET paid_amount = v_new_paid, status = v_status
    WHERE id = v_installment_id;

    INSERT INTO public.student_finance_ledger (
      student_id,
      installment_id,
      voucher_id,
      payment_id,
      entry_type,
      component_type,
      label,
      credit,
      effective_date,
      notes,
      created_by
    )
    VALUES (
      p_student_id,
      v_installment_id,
      p_voucher_id,
      v_payment_id,
      'payment',
      v_inst.component_type,
      'Payment - ' || v_inst.label,
      v_alloc_amount,
      COALESCE(p_paid_at::DATE, CURRENT_DATE),
      p_notes,
      v_user
    );
  END LOOP;

  IF p_voucher_id IS NOT NULL THEN
    SELECT * INTO v_voucher
    FROM public.fee_vouchers
    WHERE id = p_voucher_id
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.fee_vouchers
      SET
        paid_amount = LEAST(v_voucher.total_amount, v_voucher.paid_amount + p_amount),
        status = CASE
          WHEN LEAST(v_voucher.total_amount, v_voucher.paid_amount + p_amount) <= 0 THEN 'issued'::public.voucher_status
          WHEN LEAST(v_voucher.total_amount, v_voucher.paid_amount + p_amount) >= v_voucher.total_amount THEN 'paid'::public.voucher_status
          ELSE 'partial'::public.voucher_status
        END
      WHERE id = p_voucher_id;
    END IF;
  END IF;

  IF p_cashier_session_id IS NOT NULL AND p_payment_method = 'cash' THEN
    UPDATE public.cashier_sessions
    SET expected_cash = expected_cash + p_amount, updated_at = now()
    WHERE id = p_cashier_session_id AND status = 'open';
  END IF;

  INSERT INTO public.finance_audit_log (actor_id, action, entity_type, entity_id, student_id, after_data, notes)
  VALUES (
    v_user,
    'payment_recorded',
    'fee_payments',
    v_payment_id,
    p_student_id,
    jsonb_build_object('amount', p_amount, 'receipt_number', p_receipt_number, 'voucher_id', p_voucher_id),
    p_notes
  );

  RETURN v_payment_id;
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
BEGIN
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

  UPDATE public.cashier_sessions
  SET
    status = 'closed',
    closed_at = now(),
    counted_cash = p_counted_cash,
    variance = p_counted_cash - expected_cash,
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
    jsonb_build_object('counted_cash', p_counted_cash, 'expected_cash', v_session.expected_cash),
    p_notes
  );

  RETURN p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_student_finance_charge(UUID, public.finance_ledger_entry_type, TEXT, NUMERIC, public.fee_component_type, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, NUMERIC, TEXT, public.payment_method, TIMESTAMPTZ, TEXT, UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cashier_session(UUID, NUMERIC, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
