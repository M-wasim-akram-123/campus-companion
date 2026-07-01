-- Patch: finance hardening controls.
-- Run after the existing finance patches/migrations.

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
      AND role::TEXT IN ('super_admin', 'finance_admin', 'finance_officer', 'cashier')
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
      AND role::TEXT IN ('super_admin', 'finance_admin', 'finance_officer')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_student_owner(_student_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students
    WHERE id = _student_id
      AND user_id = auth.uid()
  );
$$;

-- Remove permissive legacy finance policies.
DROP POLICY IF EXISTS "Authenticated fee vouchers" ON public.fee_vouchers;
DROP POLICY IF EXISTS "Authenticated fee voucher lines" ON public.fee_voucher_lines;
DROP POLICY IF EXISTS "Authenticated fee payments" ON public.fee_payments;
DROP POLICY IF EXISTS "Authenticated fee payment allocations" ON public.fee_payment_allocations;
DROP POLICY IF EXISTS "Authenticated finance counters" ON public.finance_counters;
DROP POLICY IF EXISTS "Authenticated student finance ledger" ON public.student_finance_ledger;
DROP POLICY IF EXISTS "Authenticated finance audit log" ON public.finance_audit_log;
DROP POLICY IF EXISTS "Authenticated cashier sessions" ON public.cashier_sessions;
DROP POLICY IF EXISTS "Finance staff read vouchers" ON public.fee_vouchers;
DROP POLICY IF EXISTS "Finance staff read voucher lines" ON public.fee_voucher_lines;
DROP POLICY IF EXISTS "Finance staff read payments" ON public.fee_payments;
DROP POLICY IF EXISTS "Finance staff read payment allocations" ON public.fee_payment_allocations;
DROP POLICY IF EXISTS "Finance staff read counters" ON public.finance_counters;
DROP POLICY IF EXISTS "Finance ledger read scoped" ON public.student_finance_ledger;
DROP POLICY IF EXISTS "Finance audit read scoped" ON public.finance_audit_log;
DROP POLICY IF EXISTS "Cashier sessions read scoped" ON public.cashier_sessions;

ALTER TABLE public.fee_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_voucher_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_finance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashier_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance staff read vouchers"
  ON public.fee_vouchers
  FOR SELECT TO authenticated
  USING (public.is_finance_staff(auth.uid()) OR public.is_student_owner(student_id));

CREATE POLICY "Finance staff read voucher lines"
  ON public.fee_voucher_lines
  FOR SELECT TO authenticated
  USING (
    public.is_finance_staff(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.fee_vouchers v
      WHERE v.id = voucher_id
        AND public.is_student_owner(v.student_id)
    )
  );

CREATE POLICY "Finance staff read payments"
  ON public.fee_payments
  FOR SELECT TO authenticated
  USING (public.is_finance_staff(auth.uid()) OR public.is_student_owner(student_id));

CREATE POLICY "Finance staff read payment allocations"
  ON public.fee_payment_allocations
  FOR SELECT TO authenticated
  USING (
    public.is_finance_staff(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.fee_payments p
      WHERE p.id = payment_id
        AND public.is_student_owner(p.student_id)
    )
  );

CREATE POLICY "Finance staff read counters"
  ON public.finance_counters
  FOR SELECT TO authenticated
  USING (public.is_finance_admin(auth.uid()));

CREATE POLICY "Finance ledger read scoped"
  ON public.student_finance_ledger
  FOR SELECT TO authenticated
  USING (public.is_finance_staff(auth.uid()) OR public.is_student_owner(student_id));

CREATE POLICY "Finance audit read scoped"
  ON public.finance_audit_log
  FOR SELECT TO authenticated
  USING (public.is_finance_admin(auth.uid()));

CREATE POLICY "Cashier sessions read scoped"
  ON public.cashier_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_finance_admin(auth.uid())
    OR cashier_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.prevent_finance_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Finance ledger entries are immutable. Use reversal RPCs for corrections.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_finance_ledger_update ON public.student_finance_ledger;
CREATE TRIGGER trg_prevent_finance_ledger_update
  BEFORE UPDATE OR DELETE ON public.student_finance_ledger
  FOR EACH ROW EXECUTE FUNCTION public.prevent_finance_ledger_mutation();

CREATE OR REPLACE FUNCTION public.prevent_finance_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Finance audit log is immutable.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_finance_audit_update ON public.finance_audit_log;
CREATE TRIGGER trg_prevent_finance_audit_update
  BEFORE UPDATE OR DELETE ON public.finance_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_finance_audit_mutation();

CREATE OR REPLACE FUNCTION public.prevent_duplicate_open_voucher_line()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  IF NEW.installment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT student_id INTO v_student_id
  FROM public.fee_vouchers
  WHERE id = NEW.voucher_id;

  IF EXISTS (
    SELECT 1
    FROM public.fee_voucher_lines l
    JOIN public.fee_vouchers v ON v.id = l.voucher_id
    WHERE l.installment_id = NEW.installment_id
      AND v.status IN ('issued', 'partial')
      AND l.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
  ) THEN
    RAISE EXCEPTION 'This fee head already has an open voucher.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.student_fee_installments i
    WHERE i.id = NEW.installment_id
      AND i.student_id <> v_student_id
  ) THEN
    RAISE EXCEPTION 'Voucher line installment does not belong to voucher student.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_open_voucher_line ON public.fee_voucher_lines;
CREATE TRIGGER trg_prevent_duplicate_open_voucher_line
  BEFORE INSERT OR UPDATE ON public.fee_voucher_lines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_open_voucher_line();

CREATE OR REPLACE FUNCTION public.create_fee_voucher(
  p_student_id UUID,
  p_due_date DATE,
  p_notes TEXT DEFAULT NULL,
  p_source public.voucher_source DEFAULT 'manual',
  p_lines JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_voucher_id UUID;
  v_voucher_number TEXT;
  v_line JSONB;
  v_installment_id UUID;
  v_amount NUMERIC;
  v_label TEXT;
  v_sort INT := 0;
  v_total NUMERIC := 0;
  v_inst RECORD;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;
  IF NOT public.is_finance_staff(v_user) THEN
    RAISE EXCEPTION 'Only finance staff can create vouchers.';
  END IF;
  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Voucher due date is required.';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Voucher lines are required.';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_installment_id := NULLIF(v_line->>'installmentId', '')::UUID;
    v_label := NULLIF(TRIM(COALESCE(v_line->>'label', '')), '');
    v_amount := COALESCE((v_line->>'amount')::NUMERIC, 0);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'Voucher line amount must be greater than zero.';
    END IF;
    IF v_label IS NULL THEN
      RAISE EXCEPTION 'Voucher line label is required.';
    END IF;
    IF v_installment_id IS NOT NULL THEN
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
      IF v_amount > (v_inst.amount - v_inst.paid_amount) + 0.01 THEN
        RAISE EXCEPTION 'Voucher line exceeds installment balance.';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.fee_voucher_lines l
        JOIN public.fee_vouchers v ON v.id = l.voucher_id
        WHERE l.installment_id = v_installment_id
          AND v.status IN ('issued', 'partial')
      ) THEN
        RAISE EXCEPTION '% already has an open voucher.', v_inst.label;
      END IF;
    END IF;
    v_total := v_total + v_amount;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Voucher total must be greater than zero.';
  END IF;

  v_voucher_number := public.next_finance_number('voucher');

  INSERT INTO public.fee_vouchers (
    voucher_number,
    student_id,
    source,
    total_amount,
    due_date,
    notes,
    status,
    created_by
  )
  VALUES (
    v_voucher_number,
    p_student_id,
    COALESCE(p_source, 'manual'),
    v_total,
    p_due_date,
    p_notes,
    'issued',
    v_user
  )
  RETURNING id INTO v_voucher_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_sort := v_sort + 1;
    INSERT INTO public.fee_voucher_lines (
      voucher_id,
      installment_id,
      label,
      amount,
      sort_order
    )
    VALUES (
      v_voucher_id,
      NULLIF(v_line->>'installmentId', '')::UUID,
      TRIM(v_line->>'label'),
      (v_line->>'amount')::NUMERIC,
      v_sort
    );
  END LOOP;

  INSERT INTO public.finance_audit_log (actor_id, action, entity_type, entity_id, student_id, after_data, notes)
  VALUES (
    v_user,
    'voucher_created',
    'fee_vouchers',
    v_voucher_id,
    p_student_id,
    jsonb_build_object('voucher_number', v_voucher_number, 'total_amount', v_total, 'due_date', p_due_date),
    p_notes
  );

  RETURN v_voucher_id;
END;
$$;

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
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;
  IF NOT public.is_finance_admin(v_user) THEN
    RAISE EXCEPTION 'Only finance admin can create fines, late fees, or adjustments.';
  END IF;
  IF p_entry_type NOT IN ('fine', 'late_fee', 'adjustment') THEN
    RAISE EXCEPTION 'Only fine, late_fee, or adjustment charges can be created with this function.';
  END IF;
  IF trim(COALESCE(p_label, '')) = '' THEN
    RAISE EXCEPTION 'Charge label is required.';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Charge amount must be greater than zero.';
  END IF;

  SELECT id INTO v_fee_plan_id
  FROM public.student_fee_plans
  WHERE student_id = p_student_id
  LIMIT 1;

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
  v_session RECORD;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;
  IF NOT public.is_finance_staff(v_user) THEN
    RAISE EXCEPTION 'Only finance staff can record payments.';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;
  IF trim(COALESCE(p_receipt_number, '')) = '' THEN
    RAISE EXCEPTION 'Receipt number is required.';
  END IF;
  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Payment allocations must include at least one installment.';
  END IF;

  IF p_voucher_id IS NOT NULL THEN
    SELECT * INTO v_voucher
    FROM public.fee_vouchers
    WHERE id = p_voucher_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Voucher not found.';
    END IF;
    IF v_voucher.student_id <> p_student_id THEN
      RAISE EXCEPTION 'Voucher does not belong to this student.';
    END IF;
    IF v_voucher.status NOT IN ('issued', 'partial') THEN
      RAISE EXCEPTION 'Only issued or partial vouchers can receive payments.';
    END IF;
    IF p_amount > (v_voucher.total_amount - v_voucher.paid_amount) + 0.01 THEN
      RAISE EXCEPTION 'Payment exceeds voucher balance.';
    END IF;
  END IF;

  IF p_payment_method = 'cash' THEN
    IF p_cashier_session_id IS NULL THEN
      RAISE EXCEPTION 'Open cashier session is required for cash payments.';
    END IF;
    SELECT * INTO v_session
    FROM public.cashier_sessions
    WHERE id = p_cashier_session_id
    FOR UPDATE;
    IF NOT FOUND OR v_session.status <> 'open' THEN
      RAISE EXCEPTION 'Cashier session is not open.';
    END IF;
    IF v_session.cashier_id <> v_user AND NOT public.is_finance_admin(v_user) THEN
      RAISE EXCEPTION 'Cash payment must use your own open cashier session.';
    END IF;
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
    IF p_voucher_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.fee_voucher_lines
      WHERE voucher_id = p_voucher_id
        AND installment_id = v_installment_id
    ) THEN
      RAISE EXCEPTION 'Allocation installment is not linked to this voucher.';
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

  IF p_cashier_session_id IS NOT NULL AND p_payment_method = 'cash' THEN
    UPDATE public.cashier_sessions
    SET expected_cash = expected_cash + p_amount, updated_at = now()
    WHERE id = p_cashier_session_id AND status = 'open';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cashier session cash total could not be updated.';
    END IF;
  END IF;

  INSERT INTO public.finance_audit_log (actor_id, action, entity_type, entity_id, student_id, after_data, notes)
  VALUES (
    v_user,
    'payment_recorded',
    'fee_payments',
    v_payment_id,
    p_student_id,
    jsonb_build_object('amount', p_amount, 'receipt_number', p_receipt_number, 'voucher_id', p_voucher_id, 'cashier_session_id', p_cashier_session_id),
    p_notes
  );

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_fee_voucher(
  p_voucher_id UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_before public.fee_vouchers%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;
  IF NOT public.is_finance_admin(v_user) THEN
    RAISE EXCEPTION 'Only finance admin can cancel vouchers.';
  END IF;
  IF trim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Cancellation reason is required.';
  END IF;

  SELECT * INTO v_before
  FROM public.fee_vouchers
  WHERE id = p_voucher_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher not found.';
  END IF;
  IF v_before.status = 'paid' OR v_before.paid_amount > 0 THEN
    RAISE EXCEPTION 'Paid or partially paid vouchers cannot be cancelled. Reverse payment first.';
  END IF;
  IF v_before.status = 'cancelled' THEN
    RETURN p_voucher_id;
  END IF;

  UPDATE public.fee_vouchers
  SET status = 'cancelled', notes = COALESCE(notes || E'\n', '') || 'Cancelled: ' || p_reason
  WHERE id = p_voucher_id;

  INSERT INTO public.finance_audit_log (actor_id, action, entity_type, entity_id, student_id, before_data, after_data, notes)
  VALUES (
    v_user,
    'voucher_cancelled',
    'fee_vouchers',
    p_voucher_id,
    v_before.student_id,
    to_jsonb(v_before),
    jsonb_build_object('status', 'cancelled'),
    p_reason
  );

  RETURN p_voucher_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_finance_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_student_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_fee_voucher(UUID, DATE, TEXT, public.voucher_source, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_student_finance_charge(UUID, public.finance_ledger_entry_type, TEXT, NUMERIC, public.fee_component_type, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_fee_payment(UUID, NUMERIC, TEXT, public.payment_method, TIMESTAMPTZ, TEXT, UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_fee_voucher(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
