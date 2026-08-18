-- BS ERP/LMS Phase 1 foundation.
-- Depends on 20260724150000_lms_roles.sql.

DO $$ BEGIN
  CREATE TYPE public.lms_semester_status AS ENUM (
    'preparing', 'admission_open', 'running', 'closed', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.lms_course_status AS ENUM ('active', 'inactive', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.lms_employment_type AS ENUM ('permanent', 'visiting', 'contract');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.lms_pay_basis AS ENUM ('fixed_salary', 'lecture_wise', 'hourly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.lms_shift AS ENUM ('morning', 'evening', 'weekend');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.lms_enrollment_status AS ENUM (
    'active', 'completed', 'withdrawn', 'failed', 'frozen'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.lms_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  hod_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  semester_count INT NOT NULL DEFAULT 8 CHECK (semester_count BETWEEN 1 AND 16),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lms_departments_name_unique UNIQUE (name),
  CONSTRAINT lms_departments_code_unique UNIQUE (code),
  CONSTRAINT lms_departments_code_format CHECK (code = upper(code) AND code ~ '^[A-Z0-9-]{2,12}$')
);

CREATE TABLE IF NOT EXISTS public.lms_department_programs (
  department_id UUID NOT NULL REFERENCES public.lms_departments(id) ON DELETE CASCADE,
  program_id UUID NOT NULL UNIQUE REFERENCES public.programs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (department_id, program_id)
);

CREATE TABLE IF NOT EXISTS public.lms_semester_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.lms_departments(id) ON DELETE CASCADE,
  semester_number INT NOT NULL CHECK (semester_number BETWEEN 1 AND 16),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, semester_number)
);

CREATE TABLE IF NOT EXISTS public.lms_semester_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.lms_departments(id) ON DELETE RESTRICT,
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
  academic_session_id UUID NOT NULL REFERENCES public.academic_sessions(id) ON DELETE RESTRICT,
  semester_number INT NOT NULL CHECK (semester_number BETWEEN 1 AND 16),
  name TEXT NOT NULL,
  status public.lms_semester_status NOT NULL DEFAULT 'preparing',
  start_date DATE,
  end_date DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, academic_session_id, semester_number),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.lms_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.lms_departments(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  credit_hours NUMERIC(4,1) NOT NULL CHECK (credit_hours > 0 AND credit_hours <= 12),
  theory_hours NUMERIC(4,1) NOT NULL DEFAULT 0 CHECK (theory_hours >= 0),
  lab_hours NUMERIC(4,1) NOT NULL DEFAULT 0 CHECK (lab_hours >= 0),
  lecture_count INT NOT NULL DEFAULT 0 CHECK (lecture_count >= 0),
  lab_count INT NOT NULL DEFAULT 0 CHECK (lab_count >= 0),
  recommended_book TEXT,
  author TEXT,
  publisher TEXT,
  course_outline TEXT,
  learning_outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status public.lms_course_status NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, code),
  CHECK (code = upper(code) AND length(trim(code)) >= 2),
  CHECK (jsonb_typeof(learning_outcomes) = 'array')
);

CREATE TABLE IF NOT EXISTS public.lms_course_prerequisites (
  course_id UUID NOT NULL REFERENCES public.lms_courses(id) ON DELETE CASCADE,
  prerequisite_course_id UUID NOT NULL REFERENCES public.lms_courses(id) ON DELETE RESTRICT,
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, prerequisite_course_id),
  CHECK (course_id <> prerequisite_course_id)
);

CREATE TABLE IF NOT EXISTS public.lms_curriculum_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.lms_courses(id) ON DELETE RESTRICT,
  semester_number INT NOT NULL CHECK (semester_number BETWEEN 1 AND 16),
  is_elective BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, course_id)
);

CREATE TABLE IF NOT EXISTS public.lms_teacher_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.lms_departments(id) ON DELETE SET NULL,
  employee_code TEXT UNIQUE,
  photo_path TEXT,
  qualification TEXT,
  experience_years NUMERIC(4,1) NOT NULL DEFAULT 0 CHECK (experience_years >= 0),
  specialization TEXT,
  cnic TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  employment_type public.lms_employment_type NOT NULL DEFAULT 'permanent',
  pay_basis public.lms_pay_basis NOT NULL DEFAULT 'fixed_salary',
  fixed_salary NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fixed_salary >= 0),
  per_lecture_rate NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (per_lecture_rate >= 0),
  hourly_rate NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  hired_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lms_class_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_instance_id UUID NOT NULL REFERENCES public.lms_semester_instances(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  shift public.lms_shift NOT NULL DEFAULT 'morning',
  room TEXT,
  capacity INT NOT NULL DEFAULT 50 CHECK (capacity > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (semester_instance_id, name)
);

CREATE TABLE IF NOT EXISTS public.lms_course_offerings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_instance_id UUID NOT NULL REFERENCES public.lms_semester_instances(id) ON DELETE CASCADE,
  class_group_id UUID NOT NULL REFERENCES public.lms_class_groups(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.lms_courses(id) ON DELETE RESTRICT,
  section_code TEXT,
  capacity INT CHECK (capacity IS NULL OR capacity > 0),
  status public.lms_course_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_group_id, course_id)
);

CREATE TABLE IF NOT EXISTS public.lms_teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES public.lms_course_offerings(id) ON DELETE CASCADE,
  teacher_user_id UUID NOT NULL REFERENCES public.lms_teacher_profiles(user_id) ON DELETE RESTRICT,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offering_id, teacher_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_teacher_assignment_primary
  ON public.lms_teacher_assignments (offering_id)
  WHERE is_primary;

CREATE TABLE IF NOT EXISTS public.lms_student_semester_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  semester_instance_id UUID NOT NULL REFERENCES public.lms_semester_instances(id) ON DELETE RESTRICT,
  class_group_id UUID REFERENCES public.lms_class_groups(id) ON DELETE SET NULL,
  registration_number TEXT,
  status public.lms_enrollment_status NOT NULL DEFAULT 'active',
  enrolled_on DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_on DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, semester_instance_id)
);

CREATE TABLE IF NOT EXISTS public.lms_course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_enrollment_id UUID NOT NULL REFERENCES public.lms_student_semester_enrollments(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.lms_course_offerings(id) ON DELETE RESTRICT,
  status public.lms_enrollment_status NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (semester_enrollment_id, offering_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_semesters_department_status
  ON public.lms_semester_instances (department_id, status);
CREATE INDEX IF NOT EXISTS idx_lms_courses_department_status
  ON public.lms_courses (department_id, status);
CREATE INDEX IF NOT EXISTS idx_lms_class_groups_semester
  ON public.lms_class_groups (semester_instance_id);
CREATE INDEX IF NOT EXISTS idx_lms_offerings_semester
  ON public.lms_course_offerings (semester_instance_id);
CREATE INDEX IF NOT EXISTS idx_lms_teacher_assignments_teacher
  ON public.lms_teacher_assignments (teacher_user_id);
CREATE INDEX IF NOT EXISTS idx_lms_semester_enrollments_student
  ON public.lms_student_semester_enrollments (student_id);
CREATE INDEX IF NOT EXISTS idx_lms_course_enrollments_offering
  ON public.lms_course_enrollments (offering_id);

CREATE OR REPLACE FUNCTION public.lms_validate_semester_instance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_type TEXT;
  v_department_semesters INT;
  v_department_name TEXT;
  v_existing_department UUID;
  v_program_id UUID;
  v_year INT;
BEGIN
  SELECT semester_count, name
  INTO v_department_semesters, v_department_name
  FROM public.lms_departments
  WHERE id = NEW.department_id AND is_active;
  IF v_department_semesters IS NULL THEN
    RAISE EXCEPTION 'Department is not active.';
  END IF;

  -- In this installation a BS department is also its BS program. Keep the
  -- legacy programs row internal so admissions/students remain compatible.
  IF NEW.program_id IS NULL THEN
    SELECT dp.program_id INTO v_program_id
    FROM public.lms_department_programs dp
    WHERE dp.department_id = NEW.department_id
    ORDER BY dp.created_at
    LIMIT 1;

    IF v_program_id IS NULL THEN
      SELECT p.id INTO v_program_id
      FROM public.programs p
      WHERE p.type::TEXT = 'bs'
        AND regexp_replace(lower(trim(p.name)), '^bs[[:space:]-]+', '') =
            regexp_replace(lower(trim(v_department_name)), '^bs[[:space:]-]+', '')
      ORDER BY p.created_at
      LIMIT 1;
    END IF;

    IF v_program_id IS NULL THEN
      INSERT INTO public.programs (name, type, duration_years)
      VALUES (v_department_name, 'bs', greatest(1, ceil(v_department_semesters / 2.0)::INT))
      RETURNING id INTO v_program_id;

      FOR v_year IN 1..greatest(1, ceil(v_department_semesters / 2.0)::INT) LOOP
        INSERT INTO public.classes (program_id, name, year_level)
        VALUES (v_program_id, 'BS Year ' || v_year, v_year);
      END LOOP;
    END IF;

    INSERT INTO public.lms_department_programs (department_id, program_id)
    VALUES (NEW.department_id, v_program_id)
    ON CONFLICT (program_id) DO NOTHING;

    NEW.program_id := v_program_id;
  END IF;

  SELECT type::TEXT INTO v_program_type FROM public.programs WHERE id = NEW.program_id;
  IF v_program_type IS DISTINCT FROM 'bs' THEN
    RAISE EXCEPTION 'LMS semesters can only be created for BS programs.';
  END IF;

  IF NEW.semester_number > v_department_semesters THEN
    RAISE EXCEPTION 'Semester number exceeds the department semester count.';
  END IF;

  SELECT department_id INTO v_existing_department
  FROM public.lms_department_programs
  WHERE program_id = NEW.program_id;
  IF v_existing_department IS NOT NULL AND v_existing_department <> NEW.department_id THEN
    RAISE EXCEPTION 'This BS program is already linked to another department.';
  END IF;

  INSERT INTO public.lms_department_programs (department_id, program_id)
  VALUES (NEW.department_id, NEW.program_id)
  ON CONFLICT (program_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lms_validate_semester_instance ON public.lms_semester_instances;
CREATE TRIGGER trg_lms_validate_semester_instance
  BEFORE INSERT OR UPDATE OF department_id, program_id, semester_number
  ON public.lms_semester_instances
  FOR EACH ROW EXECUTE FUNCTION public.lms_validate_semester_instance();

CREATE OR REPLACE FUNCTION public.lms_validate_course_offering()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_semester_department UUID;
  v_group_semester UUID;
  v_course_department UUID;
BEGIN
  SELECT department_id INTO v_semester_department
  FROM public.lms_semester_instances WHERE id = NEW.semester_instance_id;
  SELECT semester_instance_id INTO v_group_semester
  FROM public.lms_class_groups WHERE id = NEW.class_group_id;
  SELECT department_id INTO v_course_department
  FROM public.lms_courses WHERE id = NEW.course_id;

  IF v_group_semester IS DISTINCT FROM NEW.semester_instance_id THEN
    RAISE EXCEPTION 'Class group does not belong to the selected semester.';
  END IF;
  IF v_course_department IS DISTINCT FROM v_semester_department THEN
    RAISE EXCEPTION 'Course and semester must belong to the same department.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lms_validate_course_offering ON public.lms_course_offerings;
CREATE TRIGGER trg_lms_validate_course_offering
  BEFORE INSERT OR UPDATE OF semester_instance_id, class_group_id, course_id
  ON public.lms_course_offerings
  FOR EACH ROW EXECUTE FUNCTION public.lms_validate_course_offering();

-- Keep existing staff checks correct for the new roles.
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
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
      AND role::TEXT <> 'student'
  )
$$;

-- Text role checks avoid CREATE failures when an app_role enum value is missing.
CREATE OR REPLACE FUNCTION public.has_role_name(_user_id UUID, _role TEXT)
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
      AND role::TEXT = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.lms_is_academic_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role_name(_user_id, 'super_admin')
    OR public.has_role_name(_user_id, 'academic_coordinator')
    OR public.has_role_name(_user_id, 'registrar')
$$;

CREATE OR REPLACE FUNCTION public.lms_manages_department(_user_id UUID, _department_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.lms_is_academic_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.lms_departments
      WHERE id = _department_id AND hod_user_id = _user_id
    )
$$;

CREATE OR REPLACE FUNCTION public.lms_teaches_offering(_user_id UUID, _offering_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lms_teacher_assignments
    WHERE teacher_user_id = _user_id AND offering_id = _offering_id
  )
$$;

CREATE OR REPLACE FUNCTION public.lms_student_owns_semester_enrollment(
  _user_id UUID,
  _semester_enrollment_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lms_student_semester_enrollments se
    JOIN public.students s ON s.id = se.student_id
    WHERE se.id = _semester_enrollment_id AND s.user_id = _user_id
  )
$$;

-- Generic updated_at trigger helper already exists in the base schema.
DROP TRIGGER IF EXISTS trg_lms_departments_updated ON public.lms_departments;
CREATE TRIGGER trg_lms_departments_updated
  BEFORE UPDATE ON public.lms_departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_lms_semester_templates_updated ON public.lms_semester_templates;
CREATE TRIGGER trg_lms_semester_templates_updated
  BEFORE UPDATE ON public.lms_semester_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_lms_semester_instances_updated ON public.lms_semester_instances;
CREATE TRIGGER trg_lms_semester_instances_updated
  BEFORE UPDATE ON public.lms_semester_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_lms_courses_updated ON public.lms_courses;
CREATE TRIGGER trg_lms_courses_updated
  BEFORE UPDATE ON public.lms_courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_lms_teacher_profiles_updated ON public.lms_teacher_profiles;
CREATE TRIGGER trg_lms_teacher_profiles_updated
  BEFORE UPDATE ON public.lms_teacher_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.lms_protect_teacher_compensation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.has_role_name(auth.uid(), 'super_admin')
     OR public.has_role_name(auth.uid(), 'hr') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.fixed_salary <> 0 OR NEW.per_lecture_rate <> 0 OR NEW.hourly_rate <> 0 THEN
      RAISE EXCEPTION 'Only HR or Super Admin can set teacher compensation.';
    END IF;
  ELSIF
    NEW.pay_basis IS DISTINCT FROM OLD.pay_basis
    OR NEW.fixed_salary IS DISTINCT FROM OLD.fixed_salary
    OR NEW.per_lecture_rate IS DISTINCT FROM OLD.per_lecture_rate
    OR NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate
  THEN
    RAISE EXCEPTION 'Only HR or Super Admin can change teacher compensation.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lms_protect_teacher_compensation ON public.lms_teacher_profiles;
CREATE TRIGGER trg_lms_protect_teacher_compensation
  BEFORE INSERT OR UPDATE ON public.lms_teacher_profiles
  FOR EACH ROW EXECUTE FUNCTION public.lms_protect_teacher_compensation();

DROP TRIGGER IF EXISTS trg_lms_class_groups_updated ON public.lms_class_groups;
CREATE TRIGGER trg_lms_class_groups_updated
  BEFORE UPDATE ON public.lms_class_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_lms_course_offerings_updated ON public.lms_course_offerings;
CREATE TRIGGER trg_lms_course_offerings_updated
  BEFORE UPDATE ON public.lms_course_offerings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_lms_semester_enrollments_updated ON public.lms_student_semester_enrollments;
CREATE TRIGGER trg_lms_semester_enrollments_updated
  BEFORE UPDATE ON public.lms_student_semester_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lms_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_department_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_semester_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_semester_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_course_prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_curriculum_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_teacher_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_course_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_student_semester_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_course_enrollments ENABLE ROW LEVEL SECURITY;

-- Catalog reads are available to authenticated users; mutations remain scoped.
DROP POLICY IF EXISTS "LMS authenticated read departments" ON public.lms_departments;
DROP POLICY IF EXISTS "LMS admin manage departments" ON public.lms_departments;
DROP POLICY IF EXISTS "LMS authenticated read department programs" ON public.lms_department_programs;
DROP POLICY IF EXISTS "LMS admin manage department programs" ON public.lms_department_programs;
DROP POLICY IF EXISTS "LMS authenticated read semester templates" ON public.lms_semester_templates;
DROP POLICY IF EXISTS "LMS managers manage semester templates" ON public.lms_semester_templates;
DROP POLICY IF EXISTS "LMS authenticated read semester instances" ON public.lms_semester_instances;
DROP POLICY IF EXISTS "LMS managers manage semester instances" ON public.lms_semester_instances;
DROP POLICY IF EXISTS "LMS authenticated read courses" ON public.lms_courses;
DROP POLICY IF EXISTS "LMS managers manage courses" ON public.lms_courses;
DROP POLICY IF EXISTS "LMS authenticated read prerequisites" ON public.lms_course_prerequisites;
DROP POLICY IF EXISTS "LMS managers manage prerequisites" ON public.lms_course_prerequisites;
DROP POLICY IF EXISTS "LMS authenticated read curriculum" ON public.lms_curriculum_courses;
DROP POLICY IF EXISTS "LMS admin manage curriculum" ON public.lms_curriculum_courses;
DROP POLICY IF EXISTS "LMS staff read teacher profiles" ON public.lms_teacher_profiles;
DROP POLICY IF EXISTS "LMS managers manage teacher profiles" ON public.lms_teacher_profiles;
DROP POLICY IF EXISTS "LMS authenticated read class groups" ON public.lms_class_groups;
DROP POLICY IF EXISTS "LMS managers manage class groups" ON public.lms_class_groups;
DROP POLICY IF EXISTS "LMS authenticated read offerings" ON public.lms_course_offerings;
DROP POLICY IF EXISTS "LMS managers manage offerings" ON public.lms_course_offerings;
DROP POLICY IF EXISTS "LMS staff read teacher assignments" ON public.lms_teacher_assignments;
DROP POLICY IF EXISTS "LMS managers manage teacher assignments" ON public.lms_teacher_assignments;
DROP POLICY IF EXISTS "LMS scoped read semester enrollments" ON public.lms_student_semester_enrollments;
DROP POLICY IF EXISTS "LMS managers manage semester enrollments" ON public.lms_student_semester_enrollments;
DROP POLICY IF EXISTS "LMS scoped read course enrollments" ON public.lms_course_enrollments;
DROP POLICY IF EXISTS "LMS managers manage course enrollments" ON public.lms_course_enrollments;

CREATE POLICY "LMS authenticated read departments" ON public.lms_departments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "LMS admin manage departments" ON public.lms_departments
  FOR ALL TO authenticated
  USING (public.lms_is_academic_admin(auth.uid()))
  WITH CHECK (public.lms_is_academic_admin(auth.uid()));

CREATE POLICY "LMS authenticated read department programs" ON public.lms_department_programs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "LMS admin manage department programs" ON public.lms_department_programs
  FOR ALL TO authenticated
  USING (public.lms_manages_department(auth.uid(), department_id))
  WITH CHECK (public.lms_manages_department(auth.uid(), department_id));

CREATE POLICY "LMS authenticated read semester templates" ON public.lms_semester_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "LMS managers manage semester templates" ON public.lms_semester_templates
  FOR ALL TO authenticated
  USING (public.lms_manages_department(auth.uid(), department_id))
  WITH CHECK (public.lms_manages_department(auth.uid(), department_id));

CREATE POLICY "LMS authenticated read semester instances" ON public.lms_semester_instances
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "LMS managers manage semester instances" ON public.lms_semester_instances
  FOR ALL TO authenticated
  USING (public.lms_manages_department(auth.uid(), department_id))
  WITH CHECK (public.lms_manages_department(auth.uid(), department_id));

CREATE POLICY "LMS authenticated read courses" ON public.lms_courses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "LMS managers manage courses" ON public.lms_courses
  FOR ALL TO authenticated
  USING (public.lms_manages_department(auth.uid(), department_id))
  WITH CHECK (public.lms_manages_department(auth.uid(), department_id));

CREATE POLICY "LMS authenticated read prerequisites" ON public.lms_course_prerequisites
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "LMS managers manage prerequisites" ON public.lms_course_prerequisites
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lms_courses c
      WHERE c.id = course_id
        AND public.lms_manages_department(auth.uid(), c.department_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lms_courses c
      WHERE c.id = course_id
        AND public.lms_manages_department(auth.uid(), c.department_id)
    )
  );

CREATE POLICY "LMS authenticated read curriculum" ON public.lms_curriculum_courses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "LMS admin manage curriculum" ON public.lms_curriculum_courses
  FOR ALL TO authenticated
  USING (public.lms_is_academic_admin(auth.uid()))
  WITH CHECK (public.lms_is_academic_admin(auth.uid()));

CREATE POLICY "LMS staff read teacher profiles" ON public.lms_teacher_profiles
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR user_id = auth.uid());
DROP POLICY IF EXISTS "LMS managers manage teacher profiles" ON public.lms_teacher_profiles;
CREATE POLICY "LMS managers manage teacher profiles" ON public.lms_teacher_profiles
  FOR ALL TO authenticated
  USING (
    public.lms_is_academic_admin(auth.uid())
    OR public.has_role_name(auth.uid(), 'hr')
    OR (department_id IS NOT NULL AND public.lms_manages_department(auth.uid(), department_id))
  )
  WITH CHECK (
    public.lms_is_academic_admin(auth.uid())
    OR public.has_role_name(auth.uid(), 'hr')
    OR (department_id IS NOT NULL AND public.lms_manages_department(auth.uid(), department_id))
  );

CREATE POLICY "LMS authenticated read class groups" ON public.lms_class_groups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "LMS managers manage class groups" ON public.lms_class_groups
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lms_semester_instances si
      WHERE si.id = semester_instance_id
        AND public.lms_manages_department(auth.uid(), si.department_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lms_semester_instances si
      WHERE si.id = semester_instance_id
        AND public.lms_manages_department(auth.uid(), si.department_id)
    )
  );

CREATE POLICY "LMS authenticated read offerings" ON public.lms_course_offerings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "LMS managers manage offerings" ON public.lms_course_offerings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lms_semester_instances si
      WHERE si.id = semester_instance_id
        AND public.lms_manages_department(auth.uid(), si.department_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lms_semester_instances si
      WHERE si.id = semester_instance_id
        AND public.lms_manages_department(auth.uid(), si.department_id)
    )
  );

CREATE POLICY "LMS staff read teacher assignments" ON public.lms_teacher_assignments
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR teacher_user_id = auth.uid());
CREATE POLICY "LMS managers manage teacher assignments" ON public.lms_teacher_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lms_course_offerings o
      JOIN public.lms_semester_instances si ON si.id = o.semester_instance_id
      WHERE o.id = offering_id
        AND public.lms_manages_department(auth.uid(), si.department_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lms_course_offerings o
      JOIN public.lms_semester_instances si ON si.id = o.semester_instance_id
      WHERE o.id = offering_id
        AND public.lms_manages_department(auth.uid(), si.department_id)
    )
  );

CREATE POLICY "LMS scoped read semester enrollments" ON public.lms_student_semester_enrollments
  FOR SELECT TO authenticated
  USING (
    public.lms_is_academic_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.id = lms_student_semester_enrollments.student_id
        AND s.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.lms_course_enrollments ce
      JOIN public.lms_teacher_assignments ta ON ta.offering_id = ce.offering_id
      WHERE ce.semester_enrollment_id = lms_student_semester_enrollments.id
        AND ta.teacher_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.lms_semester_instances si
      WHERE si.id = lms_student_semester_enrollments.semester_instance_id
        AND public.lms_manages_department(auth.uid(), si.department_id)
    )
  );
CREATE POLICY "LMS managers manage semester enrollments" ON public.lms_student_semester_enrollments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lms_semester_instances si
      WHERE si.id = lms_student_semester_enrollments.semester_instance_id
        AND public.lms_manages_department(auth.uid(), si.department_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lms_semester_instances si
      WHERE si.id = lms_student_semester_enrollments.semester_instance_id
        AND public.lms_manages_department(auth.uid(), si.department_id)
    )
  );

CREATE POLICY "LMS scoped read course enrollments" ON public.lms_course_enrollments
  FOR SELECT TO authenticated
  USING (
    public.lms_student_owns_semester_enrollment(auth.uid(), lms_course_enrollments.semester_enrollment_id)
    OR public.lms_teaches_offering(auth.uid(), lms_course_enrollments.offering_id)
    OR EXISTS (
      SELECT 1
      FROM public.lms_course_offerings o
      JOIN public.lms_semester_instances si ON si.id = o.semester_instance_id
      WHERE o.id = lms_course_enrollments.offering_id
        AND public.lms_manages_department(auth.uid(), si.department_id)
    )
  );
CREATE POLICY "LMS managers manage course enrollments" ON public.lms_course_enrollments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lms_course_offerings o
      JOIN public.lms_semester_instances si ON si.id = o.semester_instance_id
      WHERE o.id = lms_course_enrollments.offering_id
        AND public.lms_manages_department(auth.uid(), si.department_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lms_course_offerings o
      JOIN public.lms_semester_instances si ON si.id = o.semester_instance_id
      WHERE o.id = lms_course_enrollments.offering_id
        AND public.lms_manages_department(auth.uid(), si.department_id)
    )
  );

CREATE OR REPLACE FUNCTION public.lms_set_semester_status(
  p_semester_id UUID,
  p_status public.lms_semester_status
)
RETURNS public.lms_semester_instances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_semester public.lms_semester_instances;
BEGIN
  SELECT * INTO v_semester
  FROM public.lms_semester_instances
  WHERE id = p_semester_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Semester not found.';
  END IF;

  IF NOT public.lms_manages_department(auth.uid(), v_semester.department_id) THEN
    RAISE EXCEPTION 'You cannot manage this department semester.';
  END IF;

  IF v_semester.status = 'archived' AND p_status <> 'archived' THEN
    RAISE EXCEPTION 'Archived semesters cannot be reopened.';
  END IF;

  UPDATE public.lms_semester_instances
  SET
    status = p_status,
    closed_at = CASE WHEN p_status = 'closed' THEN now() ELSE closed_at END,
    closed_by = CASE WHEN p_status = 'closed' THEN auth.uid() ELSE closed_by END
  WHERE id = p_semester_id
  RETURNING * INTO v_semester;

  RETURN v_semester;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lms_set_semester_status(UUID, public.lms_semester_status)
  TO authenticated;

-- Starter departments and courses. Linking programs remains an explicit admin action.
INSERT INTO public.lms_departments (name, code, semester_count)
VALUES
  ('Computer Science', 'CS', 8),
  ('Software Engineering', 'SE', 8),
  ('Information Technology', 'IT', 8),
  ('Artificial Intelligence', 'AI', 8),
  ('Business Administration', 'BBA', 8)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.lms_semester_templates (department_id, semester_number, name)
SELECT d.id, n, 'Semester ' || n
FROM public.lms_departments d
CROSS JOIN generate_series(1, d.semester_count) AS n
ON CONFLICT (department_id, semester_number) DO NOTHING;

INSERT INTO public.lms_courses (
  department_id, code, name, credit_hours, theory_hours, lab_hours,
  lecture_count, lab_count, learning_outcomes
)
SELECT id, 'CS-101', 'Introduction to Computing', 3, 2, 1, 32, 16,
  '["Explain core computing concepts","Use basic productivity and development tools"]'::jsonb
FROM public.lms_departments
WHERE code = 'CS'
ON CONFLICT (department_id, code) DO NOTHING;

INSERT INTO public.lms_courses (
  department_id, code, name, credit_hours, theory_hours, lab_hours,
  lecture_count, lab_count, learning_outcomes
)
SELECT id, 'SE-101', 'Introduction to Software Engineering', 3, 3, 0, 48, 0,
  '["Describe software life-cycle models","Apply basic requirements techniques"]'::jsonb
FROM public.lms_departments
WHERE code = 'SE'
ON CONFLICT (department_id, code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
