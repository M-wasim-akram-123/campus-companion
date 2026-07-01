-- Patch: admission-office payment collection.
-- Admission office can receive the admission payment without opening a cashier session.
-- Normal finance/cashier cash collection should continue using record_fee_payment.

CREATE OR REPLACE FUNCTION public.is_admission_payment_staff(_user_id UUID)
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
      AND role::TEXT IN ('super_admin', 'admission_officer', 'receptionist', 'finance_admin', 'finance_officer')
  );
$$;

CREATE OR REPLACE FUNCTION public.record_admission_fee_payment(
  p_student_id UUID,
  p_amount NUMERIC,
  p_receipt_number TEXT,
  p_payment_method public.payment_method,
  p_paid_at TIMESTAMPTZ DEFAULT now(),
  p_notes TEXT DEFAULT NULL,
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
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;
  IF NOT public.is_admission_payment_staff(v_user) THEN
    RAISE EXCEPTION 'Only admission or finance staff can record admission payments.';
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
    p_amount,
    p_payment_method,
    COALESCE(p_paid_at, now()),
    COALESCE(p_notes, 'Received by admission office.'),
    v_user,
    NULL
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
      v_payment_id,
      'payment',
      v_inst.component_type,
      'Admission payment - ' || v_inst.label,
      v_alloc_amount,
      COALESCE(p_paid_at::DATE, CURRENT_DATE),
      p_notes,
      v_user
    );
  END LOOP;

  INSERT INTO public.finance_audit_log (actor_id, action, entity_type, entity_id, student_id, after_data, notes)
  VALUES (
    v_user,
    'admission_payment_recorded',
    'fee_payments',
    v_payment_id,
    p_student_id,
    jsonb_build_object('amount', p_amount, 'receipt_number', p_receipt_number, 'payment_method', p_payment_method),
    p_notes
  );

  RETURN v_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admission_payment_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_admission_fee_payment(UUID, NUMERIC, TEXT, public.payment_method, TIMESTAMPTZ, TEXT, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
