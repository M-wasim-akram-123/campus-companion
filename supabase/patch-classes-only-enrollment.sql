-- Classes-only students: attend classes but do not sit board exams from this college.
-- Fees must clear within 2–3 months of admission.

DO $$ BEGIN
  CREATE TYPE public.student_enrollment_type AS ENUM ('regular', 'classes_only');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS enrollment_type public.student_enrollment_type NOT NULL DEFAULT 'regular';

ALTER TABLE public.student_fee_plans
  ADD COLUMN IF NOT EXISTS enrollment_type public.student_enrollment_type NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS fee_clearance_months INTEGER
    CHECK (fee_clearance_months IS NULL OR fee_clearance_months BETWEEN 2 AND 3),
  ADD COLUMN IF NOT EXISTS classes_fee_total NUMERIC(12, 2)
    CHECK (classes_fee_total IS NULL OR classes_fee_total >= 0);

CREATE INDEX IF NOT EXISTS idx_students_enrollment_type
  ON public.students (enrollment_type);

NOTIFY pgrst, 'reload schema';
