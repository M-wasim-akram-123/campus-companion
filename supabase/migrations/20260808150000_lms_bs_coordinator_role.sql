-- Add dedicated BS Coordinator role for lecture delivery marking.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'bs_coordinator';

-- Refresh helper: BS coordinators mark only semesters they are assigned to.
CREATE OR REPLACE FUNCTION public.lms_can_mark_deliveries_for_semester(
  _user_id UUID,
  _semester_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.lms_is_academic_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.lms_semester_instances si
      WHERE si.id = _semester_id
        AND public.lms_manages_department(_user_id, si.department_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.lms_semester_instances si
      WHERE si.id = _semester_id
        AND si.coordinator_user_id = _user_id
        AND public.has_role_name(_user_id, 'bs_coordinator')
    );
$$;

GRANT EXECUTE ON FUNCTION public.lms_can_mark_deliveries_for_semester(UUID, UUID) TO authenticated;
