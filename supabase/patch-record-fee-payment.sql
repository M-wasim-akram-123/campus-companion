-- Patch: restore the payment RPC used by Fee Collection.
-- Run this in Supabase SQL Editor if Record Payment says:
-- "Could not find the function public.record_fee_payment(...) in the schema cache"

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

  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Payment allocations must include at least one installment.';
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

GRANT EXECUTE ON FUNCTION public.record_fee_payment(
  UUID,
  NUMERIC,
  TEXT,
  public.payment_method,
  TIMESTAMPTZ,
  TEXT,
  UUID,
  UUID,
  JSONB
) TO authenticated;

NOTIFY pgrst, 'reload schema';
