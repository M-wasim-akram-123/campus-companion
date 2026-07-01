-- Campus Incharge: assign classes and restrict student/finance read access.

CREATE TABLE IF NOT EXISTS public.campus_incharge_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_campus_incharge_assignments_user
  ON public.campus_incharge_assignments (user_id);

CREATE INDEX IF NOT EXISTS idx_campus_incharge_assignments_class
  ON public.campus_incharge_assignments (class_id);

ALTER TABLE public.campus_incharge_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_broad_student_access(_user_id UUID)
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
      AND role::TEXT IN (
        'super_admin',
        'admission_officer',
        'registrar',
        'hr',
        'finance_admin',
        'finance_officer',
        'cashier',
        'receptionist',
        'teacher',
        'sub_admission_officer'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.campus_incharge_can_view_student(_user_id UUID, _student_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.campus_incharge_assignments a
      ON a.class_id = s.class_id
     AND a.user_id = _user_id
    WHERE s.id = _student_id
      AND s.class_id IS NOT NULL
  );
$$;

DROP POLICY IF EXISTS "Authenticated students" ON public.students;
DROP POLICY IF EXISTS "Broad staff manage students" ON public.students;
DROP POLICY IF EXISTS "Campus incharge read assigned students" ON public.students;

CREATE POLICY "Broad staff manage students"
  ON public.students
  FOR ALL TO authenticated
  USING (public.has_broad_student_access(auth.uid()))
  WITH CHECK (public.has_broad_student_access(auth.uid()));

CREATE POLICY "Campus incharge read assigned students"
  ON public.students
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'campus_incharge')
    AND public.campus_incharge_can_view_student(auth.uid(), id)
  );

DROP POLICY IF EXISTS "Super admin manage campus incharge assignments" ON public.campus_incharge_assignments;
CREATE POLICY "Super admin manage campus incharge assignments"
  ON public.campus_incharge_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Campus incharge read own assignments" ON public.campus_incharge_assignments;
CREATE POLICY "Campus incharge read own assignments"
  ON public.campus_incharge_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Finance read for assigned students (view-only oversight)
DROP POLICY IF EXISTS "Campus incharge read assigned installments" ON public.student_fee_installments;
CREATE POLICY "Campus incharge read assigned installments"
  ON public.student_fee_installments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'campus_incharge')
    AND public.campus_incharge_can_view_student(auth.uid(), student_id)
  );

DROP POLICY IF EXISTS "Campus incharge read assigned fee plans" ON public.student_fee_plans;
CREATE POLICY "Campus incharge read assigned fee plans"
  ON public.student_fee_plans
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'campus_incharge')
    AND public.campus_incharge_can_view_student(auth.uid(), student_id)
  );

DROP POLICY IF EXISTS "Campus incharge read assigned finance ledger" ON public.student_finance_ledger;
CREATE POLICY "Campus incharge read assigned finance ledger"
  ON public.student_finance_ledger
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'campus_incharge')
    AND public.campus_incharge_can_view_student(auth.uid(), student_id)
  );

DROP POLICY IF EXISTS "Campus incharge read assigned payments" ON public.fee_payments;
CREATE POLICY "Campus incharge read assigned payments"
  ON public.fee_payments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'campus_incharge')
    AND public.campus_incharge_can_view_student(auth.uid(), student_id)
  );

DROP POLICY IF EXISTS "Campus incharge read assigned vouchers" ON public.fee_vouchers;
CREATE POLICY "Campus incharge read assigned vouchers"
  ON public.fee_vouchers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'campus_incharge')
    AND public.campus_incharge_can_view_student(auth.uid(), student_id)
  );

DROP POLICY IF EXISTS "Campus incharge read assigned voucher lines" ON public.fee_voucher_lines;
CREATE POLICY "Campus incharge read assigned voucher lines"
  ON public.fee_voucher_lines
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'campus_incharge')
    AND EXISTS (
      SELECT 1
      FROM public.fee_vouchers v
      WHERE v.id = voucher_id
        AND public.campus_incharge_can_view_student(auth.uid(), v.student_id)
    )
  );

GRANT EXECUTE ON FUNCTION public.has_broad_student_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campus_incharge_can_view_student(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
