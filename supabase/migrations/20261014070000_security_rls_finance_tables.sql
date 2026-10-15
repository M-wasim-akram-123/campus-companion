-- Security fix: Replace permissive RLS policies with role-scoped ones for finance and student tables
-- Addresses BUG-01 and BUG-12 from QA report

-- Helper function for student ownership if not exists
CREATE OR REPLACE FUNCTION public.student_belongs_to_user(p_student_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students
    WHERE id = p_student_id AND user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.student_belongs_to_user(UUID, UUID) TO authenticated;

-- ============================================================================
-- FEE VOUCHERS: Finance staff manage, students read own
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated fee vouchers" ON public.fee_vouchers;

CREATE POLICY "Finance staff manage fee vouchers"
  ON public.fee_vouchers
  FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()))
  WITH CHECK (public.is_finance_staff(auth.uid()));

CREATE POLICY "Students read own fee vouchers"
  ON public.fee_vouchers
  FOR SELECT TO authenticated
  USING (public.student_belongs_to_user(student_id, auth.uid()));

-- ============================================================================
-- FEE VOUCHER LINES: Finance staff manage, students read own
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated fee voucher lines" ON public.fee_voucher_lines;

CREATE POLICY "Finance staff manage fee voucher lines"
  ON public.fee_voucher_lines
  FOR ALL TO authenticated
  USING (
    public.is_finance_staff(auth.uid())
  )
  WITH CHECK (
    public.is_finance_staff(auth.uid())
  );

CREATE POLICY "Students read own fee voucher lines"
  ON public.fee_voucher_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fee_vouchers v
      WHERE v.id = fee_voucher_lines.voucher_id
        AND public.student_belongs_to_user(v.student_id, auth.uid())
    )
  );

-- ============================================================================
-- FEE PAYMENTS: Finance staff manage, students read own
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated fee payments" ON public.fee_payments;

CREATE POLICY "Finance staff manage fee payments"
  ON public.fee_payments
  FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()))
  WITH CHECK (public.is_finance_staff(auth.uid()));

CREATE POLICY "Students read own fee payments"
  ON public.fee_payments
  FOR SELECT TO authenticated
  USING (public.student_belongs_to_user(student_id, auth.uid()));

-- ============================================================================
-- FEE PAYMENT ALLOCATIONS: Finance staff manage, students read own
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated fee payment allocations" ON public.fee_payment_allocations;

CREATE POLICY "Finance staff manage fee payment allocations"
  ON public.fee_payment_allocations
  FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()))
  WITH CHECK (public.is_finance_staff(auth.uid()));

CREATE POLICY "Students read own fee payment allocations"
  ON public.fee_payment_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fee_payments p
      WHERE p.id = fee_payment_allocations.payment_id
        AND public.student_belongs_to_user(p.student_id, auth.uid())
    )
  );

-- ============================================================================
-- FINANCE COUNTERS: Finance staff only
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated finance counters" ON public.finance_counters;

CREATE POLICY "Finance staff manage finance counters"
  ON public.finance_counters
  FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()))
  WITH CHECK (public.is_finance_staff(auth.uid()));

-- ============================================================================
-- ADMISSION FEE POLICIES: Finance admins manage, all authenticated read
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated fee policies" ON public.admission_fee_policies;

CREATE POLICY "Finance admins manage fee policies"
  ON public.admission_fee_policies
  FOR ALL TO authenticated
  USING (public.is_finance_admin(auth.uid()))
  WITH CHECK (public.is_finance_admin(auth.uid()));

CREATE POLICY "Authenticated users read fee policies"
  ON public.admission_fee_policies
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- FEE POLICY COMPONENTS: Finance admins manage, all authenticated read
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated fee components" ON public.fee_policy_components;

CREATE POLICY "Finance admins manage fee components"
  ON public.fee_policy_components
  FOR ALL TO authenticated
  USING (public.is_finance_admin(auth.uid()))
  WITH CHECK (public.is_finance_admin(auth.uid()));

CREATE POLICY "Authenticated users read fee components"
  ON public.fee_policy_components
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- FEE SCHOLARSHIP SLABS: Finance admins manage, all authenticated read
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated scholarship slabs" ON public.fee_scholarship_slabs;

CREATE POLICY "Finance admins manage scholarship slabs"
  ON public.fee_scholarship_slabs
  FOR ALL TO authenticated
  USING (public.is_finance_admin(auth.uid()))
  WITH CHECK (public.is_finance_admin(auth.uid()));

CREATE POLICY "Authenticated users read scholarship slabs"
  ON public.fee_scholarship_slabs
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- STUDENT FEE PLANS: Finance staff manage, students read own
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated student fee plans" ON public.student_fee_plans;

CREATE POLICY "Finance staff manage student fee plans"
  ON public.student_fee_plans
  FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()))
  WITH CHECK (public.is_finance_staff(auth.uid()));

CREATE POLICY "Students read own fee plans"
  ON public.student_fee_plans
  FOR SELECT TO authenticated
  USING (public.student_belongs_to_user(student_id, auth.uid()));

-- ============================================================================
-- STUDENT FEE INSTALLMENTS: Finance staff manage, students read own
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated student installments" ON public.student_fee_installments;

CREATE POLICY "Finance staff manage student installments"
  ON public.student_fee_installments
  FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()))
  WITH CHECK (public.is_finance_staff(auth.uid()));

CREATE POLICY "Students read own installments"
  ON public.student_fee_installments
  FOR SELECT TO authenticated
  USING (public.student_belongs_to_user(student_id, auth.uid()));

-- ============================================================================
-- ADMISSION NUMBER COUNTERS: Finance staff and admission officers
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated admission counters" ON public.admission_number_counters;

CREATE POLICY "Finance and admission staff manage admission counters"
  ON public.admission_number_counters
  FOR ALL TO authenticated
  USING (
    public.is_finance_staff(auth.uid())
    OR public.has_role(auth.uid(), 'admission_officer')
    OR public.has_role(auth.uid(), 'sub_admission_officer')
  )
  WITH CHECK (
    public.is_finance_staff(auth.uid())
    OR public.has_role(auth.uid(), 'admission_officer')
    OR public.has_role(auth.uid(), 'sub_admission_officer')
  );

-- ============================================================================
-- STUDENT FINANCE LEDGER: Finance staff manage, students read own
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated student finance ledger" ON public.student_finance_ledger;

CREATE POLICY "Finance staff manage student finance ledger"
  ON public.student_finance_ledger
  FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()))
  WITH CHECK (public.is_finance_staff(auth.uid()));

CREATE POLICY "Students read own finance ledger"
  ON public.student_finance_ledger
  FOR SELECT TO authenticated
  USING (public.student_belongs_to_user(student_id, auth.uid()));

-- ============================================================================
-- FINANCE AUDIT LOG: Finance staff only (read only for non-super-admin)
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated finance audit log" ON public.finance_audit_log;

CREATE POLICY "Finance staff read audit log"
  ON public.finance_audit_log
  FOR SELECT TO authenticated
  USING (public.is_finance_staff(auth.uid()));

CREATE POLICY "Super admin manage audit log"
  ON public.finance_audit_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================================
-- CASHIER SESSIONS: Cashiers and finance admins only
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated cashier sessions" ON public.cashier_sessions;

CREATE POLICY "Cashiers manage own sessions"
  ON public.cashier_sessions
  FOR ALL TO authenticated
  USING (
    cashier_id = auth.uid()
    OR public.has_role(auth.uid(), 'finance_admin')
    OR public.has_role(auth.uid(), 'finance_officer')
    OR public.has_role(auth.uid(), 'bs_finance_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    cashier_id = auth.uid()
    OR public.has_role(auth.uid(), 'finance_admin')
    OR public.has_role(auth.uid(), 'finance_officer')
    OR public.has_role(auth.uid(), 'bs_finance_admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- ============================================================================
-- SESSION FINANCE BUDGETS: Finance admins only, not public
-- ============================================================================

DROP POLICY IF EXISTS "session_finance_budgets_all" ON public.session_finance_budgets;

CREATE POLICY "Finance admins manage session budgets"
  ON public.session_finance_budgets
  FOR ALL TO authenticated
  USING (public.is_finance_admin(auth.uid()))
  WITH CHECK (public.is_finance_admin(auth.uid()));

CREATE POLICY "Finance staff read session budgets"
  ON public.session_finance_budgets
  FOR SELECT TO authenticated
  USING (public.is_finance_staff(auth.uid()));

-- Revoke any grants to public/anon roles on finance tables
REVOKE ALL ON public.session_finance_budgets FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
