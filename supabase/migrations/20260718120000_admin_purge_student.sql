-- Allow admin admission delete when finance ledger is immutable.
-- See patch-admin-purge-student.sql for details.

CREATE OR REPLACE FUNCTION public.prevent_finance_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.allow_student_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Finance ledger entries are immutable. Use reversal RPCs for corrections.';
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_finance_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.allow_student_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Finance audit log is immutable.';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_purge_student(p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_inquiry_id UUID;
  v_name TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  IF NOT (
    public.has_role(v_user, 'super_admin')
    OR public.has_role(v_user, 'admission_officer')
    OR public.has_role(v_user, 'registrar')
  ) THEN
    RAISE EXCEPTION 'Only Super Admin, Admission Officer, or Registrar can delete admissions.';
  END IF;

  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'Student id is required.';
  END IF;

  SELECT inquiry_id, full_name
    INTO v_inquiry_id, v_name
  FROM public.students
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found.';
  END IF;

  IF v_inquiry_id IS NOT NULL THEN
    UPDATE public.inquiries
    SET
      status = 'interested',
      converted_student_id = NULL,
      converted_by = NULL,
      converted_at = NULL,
      updated_at = now()
    WHERE id = v_inquiry_id;
  END IF;

  PERFORM set_config('app.allow_student_purge', 'on', true);

  DELETE FROM public.students WHERE id = p_student_id;

  INSERT INTO public.finance_audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    student_id,
    notes,
    after_data
  ) VALUES (
    v_user,
    'admin_purge_student',
    'students',
    p_student_id,
    NULL,
    format('Purged admission for %s', COALESCE(v_name, p_student_id::text)),
    jsonb_build_object(
      'student_id', p_student_id,
      'full_name', v_name,
      'inquiry_id', v_inquiry_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_purge_student(UUID) TO authenticated;
