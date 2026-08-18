-- Intermediate subject catalog, section/subject teachers, scoped marks entry,
-- and per-section completion. BS LMS remains separate.

CREATE TABLE IF NOT EXISTS public.intermediate_teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_user_id, section_id)
);

CREATE TABLE IF NOT EXISTS public.intermediate_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intermediate_subjects_code_format
    CHECK (code = upper(code) AND code ~ '^[A-Z0-9-]{2,20}$'),
  CONSTRAINT intermediate_subjects_code_unique UNIQUE (code),
  CONSTRAINT intermediate_subjects_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.intermediate_section_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.intermediate_subjects(id) ON DELETE RESTRICT,
  teacher_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (section_id, subject_id)
);

ALTER TABLE public.internal_tests
  ADD COLUMN IF NOT EXISTS subject_id UUID
    REFERENCES public.intermediate_subjects(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_tests_series_subject_id
  ON public.internal_tests (series_id, subject_id)
  WHERE series_id IS NOT NULL AND section_id IS NULL AND subject_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.internal_test_section_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_test_id UUID NOT NULL REFERENCES public.internal_tests(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.intermediate_subjects(id) ON DELETE RESTRICT,
  teacher_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  teacher_name_snapshot TEXT NOT NULL,
  paper_received BOOLEAN NOT NULL DEFAULT false,
  marks_completed BOOLEAN NOT NULL DEFAULT false,
  marks_completed_at TIMESTAMPTZ,
  marks_completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (internal_test_id, section_id)
);

CREATE TABLE IF NOT EXISTS public.student_academic_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('test_published', 'mark_corrected', 'series_closed')
  ),
  internal_test_id UUID REFERENCES public.internal_tests(id) ON DELETE SET NULL,
  series_id UUID REFERENCES public.internal_test_series(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES public.intermediate_subjects(id) ON DELETE SET NULL,
  section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  teacher_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  academic_session_id UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  academic_year_start INT,
  class_year_level INT,
  subject_name TEXT NOT NULL,
  test_name TEXT NOT NULL,
  marks_obtained NUMERIC(8, 2),
  max_marks NUMERIC(8, 2),
  passing_marks NUMERIC(8, 2),
  is_absent BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_academic_ledger_publish_once
  ON public.student_academic_ledger (student_id, internal_test_id, event_type)
  WHERE event_type = 'test_published';
CREATE INDEX IF NOT EXISTS idx_student_academic_ledger_student_date
  ON public.student_academic_ledger (student_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_academic_ledger_teacher_subject
  ON public.student_academic_ledger (teacher_user_id, subject_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_academic_ledger_session_year
  ON public.student_academic_ledger (
    academic_session_id,
    academic_year_start,
    class_year_level
  );

CREATE INDEX IF NOT EXISTS idx_intermediate_section_subjects_teacher
  ON public.intermediate_section_subjects (teacher_user_id);
CREATE INDEX IF NOT EXISTS idx_intermediate_section_subjects_section
  ON public.intermediate_section_subjects (section_id);
CREATE INDEX IF NOT EXISTS idx_intermediate_section_subjects_subject
  ON public.intermediate_section_subjects (subject_id);
CREATE INDEX IF NOT EXISTS idx_internal_test_section_meta_teacher
  ON public.internal_test_section_meta (teacher_user_id);
CREATE INDEX IF NOT EXISTS idx_internal_test_section_meta_test
  ON public.internal_test_section_meta (internal_test_id);

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
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.teacher_user_id AND role::TEXT = 'teacher'
  ) INTO v_has_teacher_role;

  IF NOT v_has_teacher_role THEN
    RAISE EXCEPTION 'Selected user must have the Teacher role.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_intermediate_section_subject
  ON public.intermediate_section_subjects;
CREATE TRIGGER trg_validate_intermediate_section_subject
  BEFORE INSERT OR UPDATE OF section_id, teacher_user_id
  ON public.intermediate_section_subjects
  FOR EACH ROW EXECUTE FUNCTION public.validate_intermediate_section_subject();

CREATE OR REPLACE FUNCTION public.sync_intermediate_teacher_section_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_teacher UUID;
  v_old_section UUID;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    INSERT INTO public.intermediate_teacher_assignments (teacher_user_id, section_id)
    VALUES (NEW.teacher_user_id, NEW.section_id)
    ON CONFLICT (teacher_user_id, section_id) DO NOTHING;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_teacher := OLD.teacher_user_id;
    v_old_section := OLD.section_id;

    IF TG_OP = 'DELETE'
       OR OLD.teacher_user_id IS DISTINCT FROM NEW.teacher_user_id
       OR OLD.section_id IS DISTINCT FROM NEW.section_id THEN
      DELETE FROM public.intermediate_teacher_assignments a
      WHERE a.teacher_user_id = v_old_teacher
        AND a.section_id = v_old_section
        AND NOT EXISTS (
          SELECT 1
          FROM public.intermediate_section_subjects x
          WHERE x.teacher_user_id = v_old_teacher
            AND x.section_id = v_old_section
        );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_intermediate_teacher_section_scope
  ON public.intermediate_section_subjects;
CREATE TRIGGER trg_sync_intermediate_teacher_section_scope
  AFTER INSERT OR UPDATE OR DELETE
  ON public.intermediate_section_subjects
  FOR EACH ROW EXECUTE FUNCTION public.sync_intermediate_teacher_section_scope();

CREATE OR REPLACE FUNCTION public.prepare_internal_test_section_meta()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_expected INT;
  v_assigned INT;
BEGIN
  IF NEW.series_id IS NULL OR NEW.section_id IS NOT NULL OR NEW.subject_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_expected
  FROM public.internal_test_series_sections
  WHERE series_id = NEW.series_id;

  SELECT count(*) INTO v_assigned
  FROM public.internal_test_series_sections ss
  JOIN public.intermediate_section_subjects iss
    ON iss.section_id = ss.section_id
   AND iss.subject_id = NEW.subject_id
  WHERE ss.series_id = NEW.series_id;

  IF v_expected = 0 THEN
    RAISE EXCEPTION 'Add sections to this test series first.';
  END IF;

  IF v_assigned <> v_expected THEN
    RAISE EXCEPTION
      'Assign this subject and its teacher to every participating section before adding the paper.';
  END IF;

  INSERT INTO public.internal_test_section_meta (
    internal_test_id,
    section_id,
    subject_id,
    teacher_user_id,
    teacher_name_snapshot
  )
  SELECT
    NEW.id,
    ss.section_id,
    NEW.subject_id,
    iss.teacher_user_id,
    COALESCE(NULLIF(trim(p.full_name), ''), 'Teacher')
  FROM public.internal_test_series_sections ss
  JOIN public.intermediate_section_subjects iss
    ON iss.section_id = ss.section_id
   AND iss.subject_id = NEW.subject_id
  LEFT JOIN public.profiles p ON p.id = iss.teacher_user_id
  WHERE ss.series_id = NEW.series_id
  ON CONFLICT (internal_test_id, section_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prepare_internal_test_section_meta ON public.internal_tests;
CREATE TRIGGER trg_prepare_internal_test_section_meta
  AFTER INSERT ON public.internal_tests
  FOR EACH ROW EXECUTE FUNCTION public.prepare_internal_test_section_meta();

CREATE OR REPLACE FUNCTION public.reset_internal_test_section_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test_id UUID;
  v_student_id UUID;
  v_section_id UUID;
BEGIN
  v_test_id := COALESCE(NEW.internal_test_id, OLD.internal_test_id);
  v_student_id := COALESCE(NEW.student_id, OLD.student_id);

  IF NOT public.internal_test_is_draft(v_test_id) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT section_id INTO v_section_id
  FROM public.students
  WHERE id = v_student_id;

  UPDATE public.internal_test_section_meta
  SET
    marks_completed = false,
    marks_completed_at = NULL,
    marks_completed_by = NULL,
    updated_at = now()
  WHERE internal_test_id = v_test_id
    AND section_id = v_section_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_internal_test_section_completion
  ON public.internal_test_marks;
CREATE TRIGGER trg_reset_internal_test_section_completion
  AFTER INSERT OR UPDATE OR DELETE
  ON public.internal_test_marks
  FOR EACH ROW EXECUTE FUNCTION public.reset_internal_test_section_completion();

CREATE OR REPLACE FUNCTION public.teacher_assigned_to_test_section(
  p_user_id UUID,
  p_test_id UUID,
  p_section_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_test_section_meta m
    WHERE m.internal_test_id = p_test_id
      AND m.section_id = p_section_id
      AND m.teacher_user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_manage_internal_mark(
  p_user_id UUID,
  p_test_id UUID,
  p_student_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.internal_test_section_meta m
      ON m.section_id = s.section_id
     AND m.internal_test_id = p_test_id
     AND m.teacher_user_id = p_user_id
    JOIN public.internal_tests t
      ON t.id = p_test_id
     AND t.status = 'draft'
    WHERE s.id = p_student_id
      AND s.academic_session_id = t.academic_session_id
  );
$$;

CREATE OR REPLACE FUNCTION public.complete_internal_test_section(
  p_test_id UUID,
  p_section_id UUID
)
RETURNS public.internal_test_section_meta
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta public.internal_test_section_meta;
  v_missing INT;
BEGIN
  IF NOT public.is_exam_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only exam staff can complete section mark sheets.';
  END IF;

  IF NOT public.internal_test_is_draft(p_test_id) THEN
    RAISE EXCEPTION 'Only draft tests can be completed.';
  END IF;

  SELECT count(*)
  INTO v_missing
  FROM public.students s
  JOIN public.internal_tests t ON t.id = p_test_id
  WHERE s.section_id = p_section_id
    AND s.academic_session_id = t.academic_session_id
    AND s.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.internal_test_marks mark
      WHERE mark.internal_test_id = p_test_id
        AND mark.student_id = s.id
    );

  IF v_missing > 0 THEN
    RAISE EXCEPTION '% active student(s) still need marks or an absent entry.', v_missing;
  END IF;

  UPDATE public.internal_test_section_meta
  SET
    marks_completed = true,
    marks_completed_at = now(),
    marks_completed_by = auth.uid(),
    updated_at = now()
  WHERE internal_test_id = p_test_id
    AND section_id = p_section_id
  RETURNING * INTO v_meta;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test section assignment not found.';
  END IF;

  RETURN v_meta;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_internal_test(p_test_id UUID)
RETURNS public.internal_tests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.internal_tests;
  v_pending INT;
BEGIN
  IF NOT public.is_exam_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only exam staff can publish results.';
  END IF;

  SELECT * INTO v_test
  FROM public.internal_tests
  WHERE id = p_test_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test not found.';
  END IF;
  IF v_test.status <> 'draft' THEN
    RAISE EXCEPTION 'Test is already published.';
  END IF;

  SELECT count(*) INTO v_pending
  FROM public.internal_test_section_meta
  WHERE internal_test_id = p_test_id
    AND NOT marks_completed;

  IF EXISTS (
    SELECT 1 FROM public.internal_test_section_meta
    WHERE internal_test_id = p_test_id
  ) AND v_pending > 0 THEN
    RAISE EXCEPTION '% section mark sheet(s) are not completed.', v_pending;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.internal_test_marks WHERE internal_test_id = p_test_id
  ) THEN
    RAISE EXCEPTION 'Enter marks before publishing.';
  END IF;

  UPDATE public.internal_tests
  SET status = 'published', published_at = now(), updated_at = now()
  WHERE id = p_test_id
  RETURNING * INTO v_test;

  INSERT INTO public.student_academic_ledger (
    student_id,
    event_type,
    internal_test_id,
    series_id,
    subject_id,
    section_id,
    teacher_user_id,
    academic_session_id,
    academic_year_start,
    class_year_level,
    subject_name,
    test_name,
    marks_obtained,
    max_marks,
    passing_marks,
    is_absent,
    metadata,
    recorded_by
  )
  SELECT
    mark.student_id,
    'test_published',
    v_test.id,
    v_test.series_id,
    v_test.subject_id,
    student.section_id,
    meta.teacher_user_id,
    v_test.academic_session_id,
    v_test.academic_year_start,
    v_test.class_year_level,
    v_test.subject_name,
    v_test.test_name,
    mark.marks_obtained,
    v_test.max_marks,
    v_test.passing_marks,
    mark.is_absent,
    jsonb_build_object(
      'academic_session_id', v_test.academic_session_id,
      'academic_year_start', v_test.academic_year_start,
      'class_year_level', v_test.class_year_level,
      'teacher_name', meta.teacher_name_snapshot,
      'remarks', mark.remarks
    ),
    auth.uid()
  FROM public.internal_test_marks mark
  JOIN public.students student ON student.id = mark.student_id
  LEFT JOIN public.internal_test_section_meta meta
    ON meta.internal_test_id = v_test.id
   AND meta.section_id = student.section_id
  WHERE mark.internal_test_id = v_test.id
  ON CONFLICT (student_id, internal_test_id, event_type)
    WHERE event_type = 'test_published'
  DO NOTHING;

  RETURN v_test;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_published_mark_correction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test public.internal_tests;
  v_section_id UUID;
  v_meta public.internal_test_section_meta;
BEGIN
  SELECT * INTO v_test
  FROM public.internal_tests
  WHERE id = NEW.internal_test_id;

  IF v_test.status <> 'published'
     OR (
       OLD.marks_obtained IS NOT DISTINCT FROM NEW.marks_obtained
       AND OLD.is_absent IS NOT DISTINCT FROM NEW.is_absent
       AND OLD.remarks IS NOT DISTINCT FROM NEW.remarks
     ) THEN
    RETURN NEW;
  END IF;

  SELECT section_id INTO v_section_id
  FROM public.students
  WHERE id = NEW.student_id;

  SELECT * INTO v_meta
  FROM public.internal_test_section_meta
  WHERE internal_test_id = NEW.internal_test_id
    AND section_id = v_section_id;

  INSERT INTO public.student_academic_ledger (
    student_id,
    event_type,
    internal_test_id,
    series_id,
    subject_id,
    section_id,
    teacher_user_id,
    academic_session_id,
    academic_year_start,
    class_year_level,
    subject_name,
    test_name,
    marks_obtained,
    max_marks,
    passing_marks,
    is_absent,
    metadata,
    recorded_by
  )
  VALUES (
    NEW.student_id,
    'mark_corrected',
    v_test.id,
    v_test.series_id,
    v_test.subject_id,
    v_section_id,
    v_meta.teacher_user_id,
    v_test.academic_session_id,
    v_test.academic_year_start,
    v_test.class_year_level,
    v_test.subject_name,
    v_test.test_name,
    NEW.marks_obtained,
    v_test.max_marks,
    v_test.passing_marks,
    NEW.is_absent,
    jsonb_build_object(
      'old_marks', OLD.marks_obtained,
      'new_marks', NEW.marks_obtained,
      'old_absent', OLD.is_absent,
      'new_absent', NEW.is_absent,
      'old_remarks', OLD.remarks,
      'new_remarks', NEW.remarks,
      'teacher_name', v_meta.teacher_name_snapshot
    ),
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_published_mark_correction
  ON public.internal_test_marks;
CREATE TRIGGER trg_record_published_mark_correction
  AFTER UPDATE ON public.internal_test_marks
  FOR EACH ROW EXECUTE FUNCTION public.record_published_mark_correction();

CREATE OR REPLACE FUNCTION public.protect_student_academic_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Academic ledger entries are immutable.';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_student_academic_ledger
  ON public.student_academic_ledger;
CREATE TRIGGER trg_protect_student_academic_ledger
  BEFORE UPDATE OR DELETE ON public.student_academic_ledger
  FOR EACH ROW EXECUTE FUNCTION public.protect_student_academic_ledger();

ALTER TABLE public.intermediate_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intermediate_section_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_test_section_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_academic_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read Intermediate subjects"
  ON public.intermediate_subjects;
CREATE POLICY "Authenticated read Intermediate subjects"
  ON public.intermediate_subjects FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Exam staff manage Intermediate subjects"
  ON public.intermediate_subjects;
CREATE POLICY "Exam staff manage Intermediate subjects"
  ON public.intermediate_subjects FOR ALL TO authenticated
  USING (public.is_exam_staff(auth.uid()))
  WITH CHECK (public.is_exam_staff(auth.uid()));

DROP POLICY IF EXISTS "Exam staff manage section subjects"
  ON public.intermediate_section_subjects;
CREATE POLICY "Exam staff manage section subjects"
  ON public.intermediate_section_subjects FOR ALL TO authenticated
  USING (public.is_exam_staff(auth.uid()))
  WITH CHECK (public.is_exam_staff(auth.uid()));

DROP POLICY IF EXISTS "Teachers read own section subjects"
  ON public.intermediate_section_subjects;

DROP POLICY IF EXISTS "Exam staff manage test section metadata"
  ON public.internal_test_section_meta;
CREATE POLICY "Exam staff manage test section metadata"
  ON public.internal_test_section_meta FOR ALL TO authenticated
  USING (public.is_exam_staff(auth.uid()))
  WITH CHECK (public.is_exam_staff(auth.uid()));

DROP POLICY IF EXISTS "Teachers read own test section metadata"
  ON public.internal_test_section_meta;

DROP POLICY IF EXISTS "Students read own test section metadata"
  ON public.internal_test_section_meta;
CREATE POLICY "Students read own test section metadata"
  ON public.internal_test_section_meta FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.students s
      WHERE s.user_id = auth.uid()
        AND s.section_id = internal_test_section_meta.section_id
        AND s.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Exam staff read academic ledger"
  ON public.student_academic_ledger;
CREATE POLICY "Exam staff read academic ledger"
  ON public.student_academic_ledger FOR SELECT TO authenticated
  USING (public.is_exam_staff(auth.uid()));

DROP POLICY IF EXISTS "Broad staff read academic ledger"
  ON public.student_academic_ledger;
CREATE POLICY "Broad staff read academic ledger"
  ON public.student_academic_ledger FOR SELECT TO authenticated
  USING (public.has_broad_student_access(auth.uid()));

DROP POLICY IF EXISTS "Campus incharge read assigned academic ledger"
  ON public.student_academic_ledger;
CREATE POLICY "Campus incharge read assigned academic ledger"
  ON public.student_academic_ledger FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'campus_incharge')
    AND public.campus_incharge_can_view_student(auth.uid(), student_id)
  );

DROP POLICY IF EXISTS "Teachers read assigned academic ledger"
  ON public.student_academic_ledger;

DROP POLICY IF EXISTS "Students read own academic ledger"
  ON public.student_academic_ledger;
CREATE POLICY "Students read own academic ledger"
  ON public.student_academic_ledger FOR SELECT TO authenticated
  USING (public.student_belongs_to_user(student_id, auth.uid()));

DROP POLICY IF EXISTS "Teachers read assigned tests" ON public.internal_tests;
DROP POLICY IF EXISTS "Teachers read assigned series" ON public.internal_test_series;
DROP POLICY IF EXISTS "Teachers read assigned series sections"
  ON public.internal_test_series_sections;
DROP POLICY IF EXISTS "Teachers read assigned marks" ON public.internal_test_marks;
DROP POLICY IF EXISTS "Teachers manage assigned draft marks"
  ON public.internal_test_marks;
REVOKE EXECUTE ON FUNCTION public.complete_internal_test_section(UUID, UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.publish_internal_test(UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.teacher_assigned_to_test_section(UUID, UUID, UUID)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.teacher_can_manage_internal_mark(UUID, UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_internal_test_section(UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_internal_test(UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_assigned_to_test_section(UUID, UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_manage_internal_mark(UUID, UUID, UUID)
  TO authenticated;

INSERT INTO public.intermediate_subjects (code, name)
VALUES
  ('ENG', 'English'),
  ('URD', 'Urdu'),
  ('ISL', 'Islamiyat'),
  ('PST', 'Pakistan Studies'),
  ('MATH', 'Mathematics'),
  ('PHY', 'Physics'),
  ('CHEM', 'Chemistry'),
  ('BIO', 'Biology'),
  ('CS', 'Computer Science'),
  ('STAT', 'Statistics')
ON CONFLICT (code) DO NOTHING;

-- Preserve already-published Intermediate results in the new academic ledger.
INSERT INTO public.student_academic_ledger (
  student_id,
  event_type,
  internal_test_id,
  series_id,
  subject_id,
  section_id,
  teacher_user_id,
  academic_session_id,
  academic_year_start,
  class_year_level,
  subject_name,
  test_name,
  marks_obtained,
  max_marks,
  passing_marks,
  is_absent,
  metadata,
  recorded_by,
  recorded_at
)
SELECT
  mark.student_id,
  'test_published',
  test.id,
  test.series_id,
  test.subject_id,
  student.section_id,
  meta.teacher_user_id,
  test.academic_session_id,
  test.academic_year_start,
  test.class_year_level,
  test.subject_name,
  test.test_name,
  mark.marks_obtained,
  test.max_marks,
  test.passing_marks,
  mark.is_absent,
  jsonb_build_object(
    'teacher_name', COALESCE(meta.teacher_name_snapshot, test.teacher_name),
    'remarks', mark.remarks,
    'backfilled', true
  ),
  test.created_by,
  COALESCE(test.published_at, mark.updated_at)
FROM public.internal_test_marks mark
JOIN public.internal_tests test ON test.id = mark.internal_test_id
JOIN public.students student ON student.id = mark.student_id
LEFT JOIN public.internal_test_section_meta meta
  ON meta.internal_test_id = test.id
 AND meta.section_id = student.section_id
WHERE test.status = 'published'
ON CONFLICT (student_id, internal_test_id, event_type)
  WHERE event_type = 'test_published'
DO NOTHING;

NOTIFY pgrst, 'reload schema';
