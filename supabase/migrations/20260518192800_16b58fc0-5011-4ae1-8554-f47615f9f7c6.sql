DROP VIEW IF EXISTS public.finance_monthly_collection;
DROP VIEW IF EXISTS public.finance_section_summary;
DROP VIEW IF EXISTS public.finance_defaulters;
DROP VIEW IF EXISTS public.finance_upcoming_month;

CREATE VIEW public.finance_monthly_collection
WITH (security_invoker = true) AS
SELECT date_trunc('month', paid_at) AS month,
       COUNT(*) AS payment_count,
       SUM(amount)::NUMERIC(14,2) AS total_collected
FROM public.fee_payments
GROUP BY 1
ORDER BY 1 DESC;

CREATE VIEW public.finance_section_summary
WITH (security_invoker = true) AS
SELECT s.id AS section_id, s.name AS section_name, c.name AS class_name, p.name AS program_name,
       COUNT(DISTINCT st.id) AS student_count,
       COALESCE(SUM(i.amount), 0)::NUMERIC(14,2) AS total_billed,
       COALESCE(SUM(i.paid_amount), 0)::NUMERIC(14,2) AS total_collected,
       COALESCE(SUM(i.amount - i.paid_amount), 0)::NUMERIC(14,2) AS outstanding
FROM public.sections s
LEFT JOIN public.classes c ON c.id = s.class_id
LEFT JOIN public.programs p ON p.id = c.program_id
LEFT JOIN public.students st ON st.section_id = s.id AND st.status = 'active'
LEFT JOIN public.student_fee_installments i ON i.student_id = st.id
GROUP BY s.id, s.name, c.name, p.name;

CREATE VIEW public.finance_defaulters
WITH (security_invoker = true) AS
SELECT st.id AS student_id, st.full_name, st.roll_number, st.phone, st.guardian_phone,
       sec.name AS section_name, cls.name AS class_name, pr.name AS program_name,
       COUNT(i.id) AS overdue_count,
       SUM(i.amount - i.paid_amount)::NUMERIC(14,2) AS overdue_amount,
       MIN(i.due_date) AS earliest_due
FROM public.student_fee_installments i
JOIN public.students st ON st.id = i.student_id
LEFT JOIN public.sections sec ON sec.id = st.section_id
LEFT JOIN public.classes cls  ON cls.id = st.class_id
LEFT JOIN public.programs pr  ON pr.id = st.program_id
WHERE i.status <> 'paid' AND (i.amount - i.paid_amount) > 0 AND i.due_date < CURRENT_DATE
GROUP BY st.id, st.full_name, st.roll_number, st.phone, st.guardian_phone, sec.name, cls.name, pr.name;

CREATE VIEW public.finance_upcoming_month
WITH (security_invoker = true) AS
SELECT date_trunc('month', i.due_date) AS month,
       COUNT(*) AS installment_count,
       SUM(i.amount - i.paid_amount)::NUMERIC(14,2) AS expected_amount
FROM public.student_fee_installments i
WHERE i.status <> 'paid' AND (i.amount - i.paid_amount) > 0
  AND i.due_date >= date_trunc('month', CURRENT_DATE)
  AND i.due_date <  date_trunc('month', CURRENT_DATE) + INTERVAL '6 months'
GROUP BY 1
ORDER BY 1;

GRANT SELECT ON public.finance_monthly_collection, public.finance_section_summary,
              public.finance_defaulters, public.finance_upcoming_month TO authenticated;
NOTIFY pgrst, 'reload schema';