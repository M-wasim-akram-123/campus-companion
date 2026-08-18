-- Fix Intermediate subject assignment validation.
-- The trigger queried user_roles as the current user, so exam officers could
-- not see another account's Teacher role and the save failed incorrectly.

CREATE OR REPLACE FUNCTION public.validate_intermediate_section_subject()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_type TEXT;
  v_has_teacher_role BOOLEAN;
BEGIN
  SELECT p.type::TEXT
  INTO v_program_type
  FROM public.sections s
  JOIN public.classes c ON c.id = s.class_id
  JOIN public.programs p ON p.id = c.program_id
  WHERE s.id = NEW.section_id;

  IF v_program_type IS DISTINCT FROM 'intermediate' THEN
    RAISE EXCEPTION 'Subjects can only be assigned to Intermediate sections.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = NEW.teacher_user_id
      AND role::TEXT = 'teacher'
  ) INTO v_has_teacher_role;

  IF NOT v_has_teacher_role THEN
    RAISE EXCEPTION 'Selected user must have the Teacher role.';
  END IF;

  RETURN NEW;
END;
$$;
