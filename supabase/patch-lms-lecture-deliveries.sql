-- LMS lecture delivery for salary:
-- Campus day offs, teacher leave, coordinator-verified theory/lab marks.

DO $$ BEGIN
  CREATE TYPE public.lms_lecture_session_type AS ENUM ('theory', 'lab');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Optional semester coordinator (who marks deliveries for that semester)
ALTER TABLE public.lms_semester_instances
  ADD COLUMN IF NOT EXISTS coordinator_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lms_semesters_coordinator
  ON public.lms_semester_instances (coordinator_user_id);

-- Campus-wide day offs (LMS owner)
CREATE TABLE IF NOT EXISTS public.lms_campus_day_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  off_date DATE NOT NULL UNIQUE,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Teacher leave dates (blocks delivery marks for that teacher)
CREATE TABLE IF NOT EXISTS public.lms_teacher_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id UUID NOT NULL REFERENCES public.lms_teacher_profiles(user_id) ON DELETE CASCADE,
  leave_date DATE NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_user_id, leave_date)
);

CREATE INDEX IF NOT EXISTS idx_lms_teacher_leaves_date
  ON public.lms_teacher_leaves (leave_date);

-- Coordinator-verified lecture deliveries (theory and lab count separately)
CREATE TABLE IF NOT EXISTS public.lms_lecture_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.lms_course_offerings(id) ON DELETE CASCADE,
  teacher_user_id UUID NOT NULL REFERENCES public.lms_teacher_profiles(user_id) ON DELETE CASCADE,
  delivery_date DATE NOT NULL,
  session_type public.lms_lecture_session_type NOT NULL,
  marked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offering_id, teacher_user_id, delivery_date, session_type)
);

CREATE INDEX IF NOT EXISTS idx_lms_lecture_deliveries_date
  ON public.lms_lecture_deliveries (delivery_date);
CREATE INDEX IF NOT EXISTS idx_lms_lecture_deliveries_teacher
  ON public.lms_lecture_deliveries (teacher_user_id);
CREATE INDEX IF NOT EXISTS idx_lms_lecture_deliveries_offering
  ON public.lms_lecture_deliveries (offering_id);

CREATE OR REPLACE FUNCTION public.lms_is_salary_staff(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role_name(_user_id, 'super_admin')
    OR public.has_role_name(_user_id, 'hod')
    OR public.has_role_name(_user_id, 'academic_coordinator')
    OR public.has_role_name(_user_id, 'registrar')
    OR public.has_role_name(_user_id, 'exam_officer')
    OR public.has_role_name(_user_id, 'hr');
$$;

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

CREATE OR REPLACE FUNCTION public.lms_validate_lecture_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_semester_id UUID;
  v_semester_status public.lms_semester_status;
  v_assigned BOOLEAN;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.lms_campus_day_offs WHERE off_date = NEW.delivery_date
  ) THEN
    RAISE EXCEPTION 'Cannot mark lecture on a campus day off.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.lms_teacher_leaves
    WHERE teacher_user_id = NEW.teacher_user_id
      AND leave_date = NEW.delivery_date
  ) THEN
    RAISE EXCEPTION 'Cannot mark lecture: teacher is on leave that day.';
  END IF;

  SELECT o.semester_instance_id, si.status
  INTO v_semester_id, v_semester_status
  FROM public.lms_course_offerings o
  JOIN public.lms_semester_instances si ON si.id = o.semester_instance_id
  WHERE o.id = NEW.offering_id;

  IF v_semester_id IS NULL THEN
    RAISE EXCEPTION 'Course offering not found.';
  END IF;

  IF v_semester_status NOT IN ('running', 'admission_open') THEN
    RAISE EXCEPTION 'Lectures can only be marked while the semester is running.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.lms_teacher_assignments
    WHERE offering_id = NEW.offering_id
      AND teacher_user_id = NEW.teacher_user_id
  ) INTO v_assigned;

  IF NOT v_assigned THEN
    RAISE EXCEPTION 'Teacher is not assigned to this course offering.';
  END IF;

  IF NOT public.lms_can_mark_deliveries_for_semester(auth.uid(), v_semester_id) THEN
    RAISE EXCEPTION 'Not allowed to mark lecture deliveries for this semester.';
  END IF;

  NEW.marked_by := COALESCE(NEW.marked_by, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lms_validate_lecture_delivery ON public.lms_lecture_deliveries;
CREATE TRIGGER trg_lms_validate_lecture_delivery
  BEFORE INSERT OR UPDATE OF offering_id, teacher_user_id, delivery_date, session_type
  ON public.lms_lecture_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.lms_validate_lecture_delivery();

ALTER TABLE public.lms_campus_day_offs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_teacher_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_lecture_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "LMS salary staff read day offs" ON public.lms_campus_day_offs;
DROP POLICY IF EXISTS "LMS salary staff manage day offs" ON public.lms_campus_day_offs;
DROP POLICY IF EXISTS "LMS salary staff read teacher leaves" ON public.lms_teacher_leaves;
DROP POLICY IF EXISTS "LMS salary staff manage teacher leaves" ON public.lms_teacher_leaves;
DROP POLICY IF EXISTS "LMS read lecture deliveries" ON public.lms_lecture_deliveries;
DROP POLICY IF EXISTS "LMS mark lecture deliveries" ON public.lms_lecture_deliveries;
DROP POLICY IF EXISTS "LMS delete lecture deliveries" ON public.lms_lecture_deliveries;

CREATE POLICY "LMS salary staff read day offs" ON public.lms_campus_day_offs
  FOR SELECT TO authenticated
  USING (public.lms_is_salary_staff(auth.uid()) OR public.lms_is_academic_admin(auth.uid()));

CREATE POLICY "LMS salary staff manage day offs" ON public.lms_campus_day_offs
  FOR ALL TO authenticated
  USING (public.lms_is_salary_staff(auth.uid()))
  WITH CHECK (public.lms_is_salary_staff(auth.uid()));

CREATE POLICY "LMS salary staff read teacher leaves" ON public.lms_teacher_leaves
  FOR SELECT TO authenticated
  USING (
    public.lms_is_salary_staff(auth.uid())
    OR teacher_user_id = auth.uid()
  );

CREATE POLICY "LMS salary staff manage teacher leaves" ON public.lms_teacher_leaves
  FOR ALL TO authenticated
  USING (public.lms_is_salary_staff(auth.uid()))
  WITH CHECK (public.lms_is_salary_staff(auth.uid()));

CREATE POLICY "LMS read lecture deliveries" ON public.lms_lecture_deliveries
  FOR SELECT TO authenticated
  USING (
    public.lms_is_salary_staff(auth.uid())
    OR teacher_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.lms_course_offerings o
      WHERE o.id = offering_id
        AND public.lms_can_mark_deliveries_for_semester(auth.uid(), o.semester_instance_id)
    )
  );

CREATE POLICY "LMS mark lecture deliveries" ON public.lms_lecture_deliveries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lms_course_offerings o
      WHERE o.id = offering_id
        AND public.lms_can_mark_deliveries_for_semester(auth.uid(), o.semester_instance_id)
    )
  );

CREATE POLICY "LMS update lecture deliveries" ON public.lms_lecture_deliveries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lms_course_offerings o
      WHERE o.id = offering_id
        AND public.lms_can_mark_deliveries_for_semester(auth.uid(), o.semester_instance_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lms_course_offerings o
      WHERE o.id = offering_id
        AND public.lms_can_mark_deliveries_for_semester(auth.uid(), o.semester_instance_id)
    )
  );

CREATE POLICY "LMS delete lecture deliveries" ON public.lms_lecture_deliveries
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lms_course_offerings o
      WHERE o.id = offering_id
        AND public.lms_can_mark_deliveries_for_semester(auth.uid(), o.semester_instance_id)
    )
  );

GRANT EXECUTE ON FUNCTION public.lms_is_salary_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lms_can_mark_deliveries_for_semester(UUID, UUID) TO authenticated;
