-- Fix BUG-05: Separate admission number sequences by program type
-- BS and Inter students in the same year will no longer collide on roll_number

-- Drop existing policies and function
DROP POLICY IF EXISTS "Authenticated admission counters" ON public.admission_number_counters;
DROP POLICY IF EXISTS "Finance and admission staff manage admission counters" ON public.admission_number_counters;
DROP FUNCTION IF EXISTS public.next_admission_number(UUID);

-- Drop old table and recreate with composite key
DROP TABLE IF EXISTS public.admission_number_counters;

CREATE TABLE public.admission_number_counters (
  academic_session_id UUID NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  program_type TEXT NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  PRIMARY KEY (academic_session_id, program_type)
);

ALTER TABLE public.admission_number_counters ENABLE ROW LEVEL SECURITY;

-- Restore proper RLS (from 20261014070000)
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

-- New function with program_type parameter
CREATE OR REPLACE FUNCTION public.next_admission_number(p_session_id UUID, p_program_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INT;
  v_next INT;
  v_prefix TEXT;
BEGIN
  -- Get session start year
  SELECT start_year INTO v_year FROM public.academic_sessions WHERE id = p_session_id;
  IF v_year IS NULL THEN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
  END IF;

  -- Set prefix based on program type
  v_prefix := CASE p_program_type
    WHEN 'bs' THEN 'BS'
    WHEN 'intermediate' THEN 'ICS'
    ELSE 'ADM'
  END;

  -- Increment counter per session + program_type
  INSERT INTO public.admission_number_counters (academic_session_id, program_type, last_number)
  VALUES (p_session_id, p_program_type, 1)
  ON CONFLICT (academic_session_id, program_type) DO UPDATE
    SET last_number = admission_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN format('%s-%s-%s', v_prefix, v_year, lpad(v_next::text, 5, '0'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_admission_number(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
