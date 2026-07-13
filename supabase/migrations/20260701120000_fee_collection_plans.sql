-- Fee collection plans for management-defined installment months.

CREATE TABLE IF NOT EXISTS public.fee_collection_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  collection_months SMALLINT[] NOT NULL CHECK (cardinality(collection_months) >= 1),
  due_day SMALLINT NOT NULL DEFAULT 10 CHECK (due_day BETWEEN 1 AND 28),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fee_collection_plans_months_valid CHECK (
    collection_months <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::SMALLINT[]
  )
);

CREATE INDEX IF NOT EXISTS idx_fee_collection_plans_active
  ON public.fee_collection_plans (is_active, sort_order);

ALTER TABLE public.student_fee_plans
  ADD COLUMN IF NOT EXISTS collection_plan_id UUID
    REFERENCES public.fee_collection_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_fee_plans_collection_plan
  ON public.student_fee_plans (collection_plan_id);

ALTER TABLE public.fee_collection_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated fee collection plans" ON public.fee_collection_plans;
CREATE POLICY "Authenticated fee collection plans" ON public.fee_collection_plans
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.fee_collection_plans (name, description, collection_months, due_day, sort_order)
SELECT
  'Plan A — Sep, Nov, Jan, Mar',
  'Four collections across the academic year',
  ARRAY[9, 11, 1, 3]::SMALLINT[],
  10,
  1
WHERE NOT EXISTS (SELECT 1 FROM public.fee_collection_plans LIMIT 1);

NOTIFY pgrst, 'reload schema';
