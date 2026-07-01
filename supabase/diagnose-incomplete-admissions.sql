-- Diagnose admissions that exist as students but are missing finance setup.
-- Run in Supabase SQL editor. This does not change data.

SELECT
  s.id,
  s.roll_number,
  s.full_name,
  s.status,
  s.created_at,
  COALESCE(p.plan_count, 0) AS fee_plan_count,
  COALESCE(i.installment_count, 0) AS installment_count,
  COALESCE(i.total_payable, 0) AS total_payable,
  COALESCE(i.total_paid_on_installments, 0) AS total_paid_on_installments,
  COALESCE(pay.payment_count, 0) AS payment_count,
  COALESCE(pay.total_payments, 0) AS total_payments
FROM public.students s
LEFT JOIN (
  SELECT student_id, COUNT(*) AS plan_count
  FROM public.student_fee_plans
  GROUP BY student_id
) p ON p.student_id = s.id
LEFT JOIN (
  SELECT
    student_id,
    COUNT(*) AS installment_count,
    SUM(amount) AS total_payable,
    SUM(paid_amount) AS total_paid_on_installments
  FROM public.student_fee_installments
  GROUP BY student_id
) i ON i.student_id = s.id
LEFT JOIN (
  SELECT student_id, COUNT(*) AS payment_count, SUM(amount) AS total_payments
  FROM public.fee_payments
  GROUP BY student_id
) pay ON pay.student_id = s.id
WHERE COALESCE(p.plan_count, 0) = 0
   OR COALESCE(i.installment_count, 0) = 0
   OR COALESCE(i.total_payable, 0) = 0
ORDER BY s.created_at DESC;
