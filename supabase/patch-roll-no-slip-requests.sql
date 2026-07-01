-- Roll no slip clearance: exception requests, approvals, and release tracking.

DO $$ BEGIN
  CREATE TYPE public.roll_no_slip_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'released',
    'settled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.roll_no_slip_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  status public.roll_no_slip_request_status NOT NULL DEFAULT 'pending',
  outstanding_amount_at_request NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (outstanding_amount_at_request >= 0),
  approved_amount NUMERIC(12, 2)
    CHECK (approved_amount IS NULL OR approved_amount >= 0),
  guarantor_name TEXT NOT NULL,
  guarantor_phone TEXT,
  promised_payment_date DATE,
  reason TEXT,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_notes TEXT,
  released_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  released_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roll_no_slip_requests_student
  ON public.roll_no_slip_requests (student_id);

CREATE INDEX IF NOT EXISTS idx_roll_no_slip_requests_status
  ON public.roll_no_slip_requests (status);

CREATE INDEX IF NOT EXISTS idx_roll_no_slip_requests_session
  ON public.roll_no_slip_requests (academic_session_id);

CREATE OR REPLACE FUNCTION public.has_roll_slip_access(_user_id UUID)
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
        'registrar',
        'finance_admin',
        'finance_officer'
      )
  );
$$;

ALTER TABLE public.roll_no_slip_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roll slip staff read" ON public.roll_no_slip_requests;
DROP POLICY IF EXISTS "Roll slip staff insert" ON public.roll_no_slip_requests;
DROP POLICY IF EXISTS "Roll slip staff update" ON public.roll_no_slip_requests;

CREATE POLICY "Roll slip staff read"
  ON public.roll_no_slip_requests
  FOR SELECT TO authenticated
  USING (public.has_roll_slip_access(auth.uid()));

CREATE POLICY "Roll slip staff insert"
  ON public.roll_no_slip_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_roll_slip_access(auth.uid())
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

CREATE POLICY "Roll slip staff update"
  ON public.roll_no_slip_requests
  FOR UPDATE TO authenticated
  USING (public.has_roll_slip_access(auth.uid()))
  WITH CHECK (public.has_roll_slip_access(auth.uid()));

NOTIFY pgrst, 'reload schema';
