-- Patch: student mobile portal profile editing and read-only fee visibility.
-- Run after patch-student-documents.sql.

CREATE OR REPLACE FUNCTION public.student_update_own_profile(
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_guardian_name TEXT DEFAULT NULL,
  p_guardian_phone TEXT DEFAULT NULL,
  p_guardian_occupation TEXT DEFAULT NULL,
  p_guardian_details TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_student_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  SELECT id INTO v_student_id
  FROM public.students
  WHERE user_id = v_user
  LIMIT 1;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'No student profile is linked with this login.';
  END IF;

  UPDATE public.students
  SET
    phone = NULLIF(TRIM(COALESCE(p_phone, '')), ''),
    email = NULLIF(TRIM(COALESCE(p_email, '')), ''),
    address = NULLIF(TRIM(COALESCE(p_address, '')), ''),
    guardian_name = NULLIF(TRIM(COALESCE(p_guardian_name, '')), ''),
    guardian_phone = NULLIF(TRIM(COALESCE(p_guardian_phone, '')), ''),
    guardian_occupation = NULLIF(TRIM(COALESCE(p_guardian_occupation, '')), ''),
    guardian_details = NULLIF(TRIM(COALESCE(p_guardian_details, '')), ''),
    updated_at = now()
  WHERE id = v_student_id;

  INSERT INTO public.student_document_audit_log (student_id, actor_id, action, notes)
  VALUES (v_student_id, v_user, 'student_profile_updated', 'Student updated allowed mobile profile fields');

  RETURN v_student_id;
END;
$$;

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can read own profile" ON public.students;
CREATE POLICY "Students can read own profile"
  ON public.students
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_document_staff(auth.uid()));

DROP POLICY IF EXISTS "Students can read own installments" ON public.student_fee_installments;
CREATE POLICY "Students can read own installments"
  ON public.student_fee_installments
  FOR SELECT TO authenticated
  USING (
    public.is_document_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id
        AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can read own payments" ON public.fee_payments;
CREATE POLICY "Students can read own payments"
  ON public.fee_payments
  FOR SELECT TO authenticated
  USING (
    public.is_document_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id
        AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can read own ledger" ON public.student_finance_ledger;
CREATE POLICY "Students can read own ledger"
  ON public.student_finance_ledger
  FOR SELECT TO authenticated
  USING (
    public.is_document_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id
        AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can read own vouchers" ON public.fee_vouchers;
CREATE POLICY "Students can read own vouchers"
  ON public.fee_vouchers
  FOR SELECT TO authenticated
  USING (
    public.is_document_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_id
        AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can read own voucher lines" ON public.fee_voucher_lines;
CREATE POLICY "Students can read own voucher lines"
  ON public.fee_voucher_lines
  FOR SELECT TO authenticated
  USING (
    public.is_document_staff(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.fee_vouchers v
      JOIN public.students s ON s.id = v.student_id
      WHERE v.id = voucher_id
        AND s.user_id = auth.uid()
    )
  );

GRANT EXECUTE ON FUNCTION public.student_update_own_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
