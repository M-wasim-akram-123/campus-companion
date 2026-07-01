-- Sub Admission Officer: follow-up assignment + RLS (run after 20260620120000_sub_admission_officer_enum.sql)

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS follow_up_assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follow_up_assigned_at TIMESTAMPTZ;

UPDATE public.inquiries
SET follow_up_assigned_at = COALESCE(follow_up_assigned_at, updated_at, created_at)
WHERE follow_up_assigned_to IS NOT NULL
  AND follow_up_assigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inquiries_follow_up_assigned_to
  ON public.inquiries (follow_up_assigned_to);

CREATE OR REPLACE FUNCTION public.is_sub_admission_officer(_user_id UUID)
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
      AND role::TEXT = 'sub_admission_officer'
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_inquiries(_user_id UUID)
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
      AND role::TEXT IN ('super_admin', 'admission_officer', 'receptionist')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_sub_admission_officer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_inquiries(UUID) TO authenticated;

DROP POLICY IF EXISTS "Authenticated inquiries" ON public.inquiries;

CREATE POLICY "Inquiry managers full access" ON public.inquiries
  FOR ALL TO authenticated
  USING (public.can_manage_inquiries(auth.uid()))
  WITH CHECK (public.can_manage_inquiries(auth.uid()));

CREATE POLICY "Sub officer view assigned follow-ups" ON public.inquiries
  FOR SELECT TO authenticated
  USING (
    public.is_sub_admission_officer(auth.uid())
    AND follow_up_assigned_to = auth.uid()
  );

CREATE POLICY "Sub officer update assigned follow-ups" ON public.inquiries
  FOR UPDATE TO authenticated
  USING (
    public.is_sub_admission_officer(auth.uid())
    AND follow_up_assigned_to = auth.uid()
  )
  WITH CHECK (
    public.is_sub_admission_officer(auth.uid())
    AND follow_up_assigned_to = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.enforce_sub_officer_inquiry_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_sub_admission_officer(auth.uid()) AND NOT public.can_manage_inquiries(auth.uid()) THEN
    IF NEW.full_name IS DISTINCT FROM OLD.full_name
      OR NEW.father_name IS DISTINCT FROM OLD.father_name
      OR NEW.phone IS DISTINCT FROM OLD.phone
      OR NEW.email IS DISTINCT FROM OLD.email
      OR NEW.gender IS DISTINCT FROM OLD.gender
      OR NEW.program_id IS DISTINCT FROM OLD.program_id
      OR NEW.academic_session_id IS DISTINCT FROM OLD.academic_session_id
      OR NEW.class_id IS DISTINCT FROM OLD.class_id
      OR NEW.preferred_section_id IS DISTINCT FROM OLD.preferred_section_id
      OR NEW.matric_school IS DISTINCT FROM OLD.matric_school
      OR NEW.matric_marks_obtained IS DISTINCT FROM OLD.matric_marks_obtained
      OR NEW.matric_marks_total IS DISTINCT FROM OLD.matric_marks_total
      OR NEW.guardian_name IS DISTINCT FROM OLD.guardian_name
      OR NEW.guardian_phone IS DISTINCT FROM OLD.guardian_phone
      OR NEW.guardian_occupation IS DISTINCT FROM OLD.guardian_occupation
      OR NEW.guardian_details IS DISTINCT FROM OLD.guardian_details
      OR NEW.notes IS DISTINCT FROM OLD.notes
      OR NEW.photo_url IS DISTINCT FROM OLD.photo_url
      OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
      OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
      OR NEW.follow_up_assigned_to IS DISTINCT FROM OLD.follow_up_assigned_to
      OR NEW.follow_up_assigned_at IS DISTINCT FROM OLD.follow_up_assigned_at
      OR NEW.converted_by IS DISTINCT FROM OLD.converted_by
      OR NEW.converted_at IS DISTINCT FROM OLD.converted_at
      OR NEW.converted_student_id IS DISTINCT FROM OLD.converted_student_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Sub admission officers can only update inquiry status and follow-up date';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
      AND NEW.status::TEXT NOT IN ('follow_up', 'interested', 'lost')
    THEN
      RAISE EXCEPTION 'Sub admission officers cannot set this inquiry status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sub_officer_inquiry_update ON public.inquiries;
CREATE TRIGGER trg_enforce_sub_officer_inquiry_update
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sub_officer_inquiry_update();

DROP POLICY IF EXISTS "Sub officer view inquiry interactions" ON public.inquiry_interactions;
CREATE POLICY "Sub officer view inquiry interactions" ON public.inquiry_interactions
  FOR SELECT TO authenticated
  USING (
    public.is_sub_admission_officer(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.inquiries i
      WHERE i.id = inquiry_id
        AND i.follow_up_assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Sub officer insert inquiry interactions" ON public.inquiry_interactions;
CREATE POLICY "Sub officer insert inquiry interactions" ON public.inquiry_interactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_sub_admission_officer(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.inquiries i
      WHERE i.id = inquiry_id
        AND i.follow_up_assigned_to = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
