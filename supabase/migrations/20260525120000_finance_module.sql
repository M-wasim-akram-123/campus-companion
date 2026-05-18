-- Finance: payments, vouchers (manual + auto), QR verification token

DO $$ BEGIN
  CREATE TYPE public.voucher_status AS ENUM ('draft', 'issued', 'partial', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash', 'bank', 'online', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.voucher_source AS ENUM ('manual', 'installment');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.fee_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number TEXT NOT NULL UNIQUE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status public.voucher_status NOT NULL DEFAULT 'issued',
  source public.voucher_source NOT NULL DEFAULT 'manual',
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  due_date DATE NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  qr_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fee_voucher_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES public.fee_vouchers(id) ON DELETE CASCADE,
  installment_id UUID REFERENCES public.student_fee_installments(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.fee_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  voucher_id UUID REFERENCES public.fee_vouchers(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fee_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.fee_payments(id) ON DELETE CASCADE,
  installment_id UUID REFERENCES public.student_fee_installments(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS public.finance_counters (
  counter_key TEXT PRIMARY KEY,
  year INT NOT NULL,
  last_number INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fee_vouchers_student ON public.fee_vouchers (student_id);
CREATE INDEX IF NOT EXISTS idx_fee_vouchers_status ON public.fee_vouchers (status);
CREATE INDEX IF NOT EXISTS idx_fee_vouchers_due ON public.fee_vouchers (due_date);
CREATE INDEX IF NOT EXISTS idx_fee_vouchers_qr ON public.fee_vouchers (qr_token);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON public.fee_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_paid_at ON public.fee_payments (paid_at);

ALTER TABLE public.fee_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_voucher_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated fee vouchers" ON public.fee_vouchers;
CREATE POLICY "Authenticated fee vouchers" ON public.fee_vouchers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated fee voucher lines" ON public.fee_voucher_lines;
CREATE POLICY "Authenticated fee voucher lines" ON public.fee_voucher_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated fee payments" ON public.fee_payments;
CREATE POLICY "Authenticated fee payments" ON public.fee_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated fee payment allocations" ON public.fee_payment_allocations;
CREATE POLICY "Authenticated fee payment allocations" ON public.fee_payment_allocations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated finance counters" ON public.finance_counters;
CREATE POLICY "Authenticated finance counters" ON public.finance_counters
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.next_finance_number(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y INT := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
  n INT;
BEGIN
  INSERT INTO public.finance_counters (counter_key, year, last_number)
  VALUES (p_key, y, 1)
  ON CONFLICT (counter_key) DO UPDATE
  SET
    last_number = CASE
      WHEN finance_counters.year = y THEN finance_counters.last_number + 1
      ELSE 1
    END,
    year = y
  RETURNING last_number INTO n;

  IF p_key = 'receipt' THEN
    RETURN 'RCP-' || y || '-' || lpad(n::TEXT, 5, '0');
  ELSIF p_key = 'voucher' THEN
    RETURN 'VCH-' || y || '-' || lpad(n::TEXT, 5, '0');
  END IF;
  RETURN p_key || '-' || y || '-' || lpad(n::TEXT, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_finance_number(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_fee_vouchers_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fee_vouchers_updated ON public.fee_vouchers;
CREATE TRIGGER trg_fee_vouchers_updated
  BEFORE UPDATE ON public.fee_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.trg_fee_vouchers_updated();

NOTIFY pgrst, 'reload schema';
