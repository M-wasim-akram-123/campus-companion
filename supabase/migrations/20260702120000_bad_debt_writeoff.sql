-- Write off remaining fee balances when a student leaves, drops, or is marked bad debt.

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_finance_ledger_installment_bad_debt
  ON public.student_finance_ledger (installment_id)
  WHERE entry_type = 'bad_debt' AND installment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.write_off_student_remaining_fees(
  p_student_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_inst RECORD;
  v_balance NUMERIC;
  v_total NUMERIC := 0;
  v_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Remaining fees written off.');
BEGIN
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'Student id is required.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = p_student_id) THEN
    RAISE EXCEPTION 'Student not found.';
  END IF;

  FOR v_inst IN
    SELECT *
    FROM public.student_fee_installments
    WHERE student_id = p_student_id
      AND status IS DISTINCT FROM 'written_off'
      AND amount > paid_amount
    ORDER BY sort_order
    FOR UPDATE
  LOOP
    v_balance := v_inst.amount - v_inst.paid_amount;
    IF v_balance <= 0 THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.student_finance_ledger
      WHERE installment_id = v_inst.id
        AND entry_type = 'bad_debt'
    ) THEN
      INSERT INTO public.student_finance_ledger (
        student_id,
        installment_id,
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
        v_inst.id,
        'bad_debt',
        v_inst.component_type,
        'Bad debt — ' || v_inst.label,
        v_balance,
        CURRENT_DATE,
        v_reason,
        v_user
      );
    END IF;

    UPDATE public.student_fee_installments
    SET status = 'written_off'
    WHERE id = v_inst.id;

    UPDATE public.fee_vouchers v
    SET
      status = 'cancelled',
      notes = COALESCE(v.notes || E'\n', '') || 'Cancelled: fees written off (' || v_reason || ')'
    FROM public.fee_voucher_lines l
    WHERE l.voucher_id = v.id
      AND l.installment_id = v_inst.id
      AND v.status IN ('draft', 'issued')
      AND v.paid_amount <= 0;

    v_total := v_total + v_balance;
  END LOOP;

  IF v_total > 0 THEN
    INSERT INTO public.finance_audit_log (actor_id, action, entity_type, entity_id, student_id, after_data, notes)
    VALUES (
      v_user,
      'fees_written_off',
      'students',
      p_student_id,
      p_student_id,
      jsonb_build_object('amount', v_total),
      v_reason
    );
  END IF;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.write_off_student_remaining_fees(UUID, TEXT) TO authenticated;

-- Backfill students already marked left, dropped, or bad debt.
DO $$
DECLARE
  v_student RECORD;
BEGIN
  FOR v_student IN
    SELECT id
    FROM public.students
    WHERE status IN ('left', 'dropped', 'bad_debt')
  LOOP
    PERFORM public.write_off_student_remaining_fees(
      v_student.id,
      'Backfill: remaining fees written off for terminal student status.'
    );
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- Repair: mark installments written off when bad debt ledger exists but status was not updated.
UPDATE public.student_fee_installments i
SET status = 'written_off'
FROM public.student_finance_ledger l
WHERE l.installment_id = i.id
  AND l.entry_type = 'bad_debt'
  AND i.status IS DISTINCT FROM 'written_off';
