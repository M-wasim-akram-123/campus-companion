-- =============================================================================
-- FRESH SUPABASE PROJECT — run this ONCE in SQL Editor (before anything else)
--
-- Your error "public.app_role does not exist" means the base schema was never
-- applied. RUN-IN-YOUR-SUPABASE.sql only patches an existing database.
--
-- Order for a new project:
--   1. This file (BOOTSTRAP-FRESH-SUPABASE.sql)
--   2. create-admin.sql  OR  assign-super-admin.sql (if you already have a user)
--   3. Log in at /login — do not rely on /signup while testing (429 rate limits)
-- =============================================================================

-- ============ MIGRATION 20260517121746 — base schema ============

CREATE TYPE public.app_role AS ENUM (
  'super_admin','admission_officer','finance_officer','receptionist','teacher','student'
);

CREATE TYPE public.inquiry_status AS ENUM (
  'new','follow_up','interested','converted','lost'
);

CREATE TYPE public.student_status AS ENUM (
  'active','inactive','graduated','dropped'
);

CREATE TYPE public.program_type AS ENUM ('intermediate','bs');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Authenticated read own roles" ON public.user_roles FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Super admin manages roles" ON public.user_roles FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type public.program_type NOT NULL,
  duration_years INT NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  year_level INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INT DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read programs" ON public.programs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin manage programs" ON public.programs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Authenticated read classes" ON public.classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin manage classes" ON public.classes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Authenticated read sections" ON public.sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin manage sections" ON public.sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin','admission_officer','finance_officer','receptionist','teacher')
  )
$$;

CREATE TABLE public.inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  program_id UUID REFERENCES public.programs(id),
  photo_url TEXT,
  notes TEXT,
  status public.inquiry_status NOT NULL DEFAULT 'new',
  follow_up_date DATE,
  created_by UUID REFERENCES auth.users(id),
  converted_student_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view inquiries" ON public.inquiries FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff insert inquiries" ON public.inquiries FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff update inquiries" ON public.inquiries FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff delete inquiries" ON public.inquiries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  roll_number TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  father_name TEXT,
  cnic TEXT,
  date_of_birth DATE,
  gender TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  photo_url TEXT,
  program_id UUID REFERENCES public.programs(id),
  class_id UUID REFERENCES public.classes(id),
  section_id UUID REFERENCES public.sections(id),
  session TEXT,
  admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.student_status NOT NULL DEFAULT 'active',
  inquiry_id UUID REFERENCES public.inquiries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view students" ON public.students FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Staff insert students" ON public.students FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff update students" ON public.students FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "Super admin delete students" ON public.students FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inquiries_updated BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.raw_user_meta_data->>'phone');

  SELECT COUNT(*) INTO v_count FROM public.user_roles;
  IF v_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO storage.buckets (id, name, public) VALUES ('student-photos','student-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Student photos publicly readable" ON storage.objects FOR SELECT
  USING (bucket_id = 'student-photos');
CREATE POLICY "Staff upload student photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-photos' AND public.is_staff(auth.uid()));
CREATE POLICY "Staff update student photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'student-photos' AND public.is_staff(auth.uid()));

INSERT INTO public.programs (id, name, type, duration_years) VALUES
  (gen_random_uuid(), 'Intermediate (FSc/ICS)', 'intermediate', 2);

INSERT INTO public.classes (program_id, name, year_level)
  SELECT id, '1st Year', 1 FROM public.programs WHERE type = 'intermediate'
  UNION ALL
  SELECT id, '2nd Year', 2 FROM public.programs WHERE type = 'intermediate';

-- ============ MIGRATION 20260517121814 — function grants + storage ============

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated;

DROP POLICY IF EXISTS "Student photos publicly readable" ON storage.objects;
CREATE POLICY "Staff read student photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'student-photos' AND public.is_staff(auth.uid()));

UPDATE storage.buckets SET public = false WHERE id = 'student-photos';

-- ============ MIGRATION 20260518120000 — matric + section RLS ============

ALTER TABLE public.inquiries
  ADD COLUMN matric_school TEXT,
  ADD COLUMN matric_marks_obtained NUMERIC(6,2),
  ADD COLUMN matric_marks_total NUMERIC(6,2),
  ADD COLUMN preferred_section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  ADD COLUMN father_name TEXT,
  ADD COLUMN gender TEXT,
  ADD COLUMN assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.students
  ADD COLUMN matric_school TEXT,
  ADD COLUMN matric_marks_obtained NUMERIC(6,2),
  ADD COLUMN matric_marks_total NUMERIC(6,2);

DROP POLICY IF EXISTS "Super admin manage sections" ON public.sections;
CREATE POLICY "Staff manage sections" ON public.sections FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  );

-- ============ MIGRATION 20260519120000 — sessions + gendered sections ============

CREATE TYPE public.section_gender AS ENUM ('boys', 'girls');

CREATE TABLE public.academic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  start_year INT NOT NULL,
  end_year INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (label)
);

ALTER TABLE public.academic_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read sessions" ON public.academic_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff manage sessions" ON public.academic_sessions FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  );

INSERT INTO public.academic_sessions (label, start_year, end_year, is_active)
VALUES ('2025-2026', 2025, 2026, true)
ON CONFLICT (label) DO NOTHING;

UPDATE public.students SET section_id = NULL WHERE section_id IS NOT NULL;
UPDATE public.inquiries SET preferred_section_id = NULL WHERE preferred_section_id IS NOT NULL;
DELETE FROM public.sections;

ALTER TABLE public.sections
  ADD COLUMN session_id UUID REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  ADD COLUMN gender public.section_gender NOT NULL DEFAULT 'boys';

ALTER TABLE public.sections
  ALTER COLUMN session_id SET NOT NULL;

ALTER TABLE public.sections
  DROP CONSTRAINT IF EXISTS sections_class_id_name_key;

ALTER TABLE public.sections
  ADD CONSTRAINT sections_class_session_gender_name_key
  UNIQUE (class_id, session_id, gender, name);

CREATE INDEX idx_sections_class_session_gender ON public.sections (class_id, session_id, gender);

ALTER TABLE public.students
  ADD COLUMN academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Super admin manage programs" ON public.programs;
CREATE POLICY "Staff manage programs" ON public.programs FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  );

DROP POLICY IF EXISTS "Super admin manage classes" ON public.classes;
CREATE POLICY "Staff manage classes" ON public.classes FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admission_officer')
  );

DELETE FROM public.classes
WHERE program_id IN (SELECT id FROM public.programs WHERE type = 'bs' AND name = 'BS Program');

DELETE FROM public.programs WHERE type = 'bs' AND name = 'BS Program';

-- ============ MIGRATION 20260520120000 — staff manage academic ============

DROP POLICY IF EXISTS "Staff manage sessions" ON public.academic_sessions;
CREATE POLICY "Staff manage sessions" ON public.academic_sessions FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage programs" ON public.programs;
CREATE POLICY "Staff manage programs" ON public.programs FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage classes" ON public.classes;
CREATE POLICY "Staff manage classes" ON public.classes FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage sections" ON public.sections;
CREATE POLICY "Staff manage sections" ON public.sections FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ============ MIGRATION 20260521120000 — dev-friendly RLS (any logged-in user) ============

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(UUID) TO authenticated;

DROP POLICY IF EXISTS "Staff view inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Staff insert inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Staff update inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Staff delete inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Authenticated inquiries" ON public.inquiries;
CREATE POLICY "Authenticated inquiries" ON public.inquiries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Staff view students" ON public.students;
DROP POLICY IF EXISTS "Staff insert students" ON public.students;
DROP POLICY IF EXISTS "Staff update students" ON public.students;
DROP POLICY IF EXISTS "Super admin delete students" ON public.students;
DROP POLICY IF EXISTS "Authenticated students" ON public.students;
CREATE POLICY "Authenticated students" ON public.students
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Super admin manage programs" ON public.programs;
DROP POLICY IF EXISTS "Staff manage programs" ON public.programs;
DROP POLICY IF EXISTS "Authenticated manage programs" ON public.programs;
CREATE POLICY "Authenticated manage programs" ON public.programs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Super admin manage classes" ON public.classes;
DROP POLICY IF EXISTS "Staff manage classes" ON public.classes;
DROP POLICY IF EXISTS "Authenticated manage classes" ON public.classes;
CREATE POLICY "Authenticated manage classes" ON public.classes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Super admin manage sections" ON public.sections;
DROP POLICY IF EXISTS "Staff manage sections" ON public.sections;
DROP POLICY IF EXISTS "Authenticated manage sections" ON public.sections;
CREATE POLICY "Authenticated manage sections" ON public.sections
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Staff manage sessions" ON public.academic_sessions;
DROP POLICY IF EXISTS "Authenticated read sessions" ON public.academic_sessions;
DROP POLICY IF EXISTS "Authenticated manage sessions" ON public.academic_sessions;
CREATE POLICY "Authenticated manage sessions" ON public.academic_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read own roles" ON public.user_roles;
CREATE POLICY "Authenticated read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Staff read student photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff upload student photos" ON storage.objects;
DROP POLICY IF EXISTS "Staff update student photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read student photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload student photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update student photos" ON storage.objects;

CREATE POLICY "Authenticated read student photos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'student-photos');
CREATE POLICY "Authenticated upload student photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'student-photos');
CREATE POLICY "Authenticated update student photos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'student-photos');

NOTIFY pgrst, 'reload schema';

-- Done. Next:
--   1. create-admin.sql  (or fix-admin-login.sql if user already exists)
--   2. Log in at /login with admin@college.edu.pk / SuperAdmin@2026
