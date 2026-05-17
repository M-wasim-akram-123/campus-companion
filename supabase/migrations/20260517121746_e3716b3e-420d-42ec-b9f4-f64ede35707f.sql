
-- ============ ENUMS ============
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

-- ============ PROFILES ============
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

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- security-definer role-check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Authenticated read own roles" ON public.user_roles FOR SELECT
  TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "Super admin manages roles" ON public.user_roles FOR ALL
  TO authenticated USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- ============ ACADEMIC STRUCTURE ============
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

-- helper: is staff (any role except plain student)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin','admission_officer','finance_officer','receptionist','teacher')
  )
$$;

-- ============ INQUIRIES ============
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

-- ============ STUDENTS ============
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

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_inquiries_updated BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + assign default 'receptionist' role if first user is super_admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ STORAGE ============
INSERT INTO storage.buckets (id, name, public) VALUES ('student-photos','student-photos', true);

CREATE POLICY "Student photos publicly readable" ON storage.objects FOR SELECT
  USING (bucket_id = 'student-photos');
CREATE POLICY "Staff upload student photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-photos' AND public.is_staff(auth.uid()));
CREATE POLICY "Staff update student photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'student-photos' AND public.is_staff(auth.uid()));

-- ============ SEED ============
INSERT INTO public.programs (id, name, type, duration_years) VALUES
  (gen_random_uuid(),'Intermediate (FSc/ICS)','intermediate',2),
  (gen_random_uuid(),'BS Program','bs',4);

INSERT INTO public.classes (program_id, name, year_level)
  SELECT id, '1st Year', 1 FROM public.programs WHERE type='intermediate'
  UNION ALL SELECT id, '2nd Year', 2 FROM public.programs WHERE type='intermediate'
  UNION ALL SELECT id, 'BS Year 1', 1 FROM public.programs WHERE type='bs'
  UNION ALL SELECT id, 'BS Year 2', 2 FROM public.programs WHERE type='bs'
  UNION ALL SELECT id, 'BS Year 3', 3 FROM public.programs WHERE type='bs'
  UNION ALL SELECT id, 'BS Year 4', 4 FROM public.programs WHERE type='bs';

INSERT INTO public.sections (class_id, name, capacity)
  SELECT id, 'A', 50 FROM public.classes
  UNION ALL SELECT id, 'B', 50 FROM public.classes;
