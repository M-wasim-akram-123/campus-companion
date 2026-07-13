-- Quick repair: sync installment status with existing bad debt ledger entries.
-- Run this if Finance dashboard outstanding still includes written-off bad debt.

UPDATE public.student_fee_installments i
SET status = 'written_off'
FROM public.student_finance_ledger l
WHERE l.installment_id = i.id
  AND l.entry_type = 'bad_debt'
  AND i.status IS DISTINCT FROM 'written_off';
