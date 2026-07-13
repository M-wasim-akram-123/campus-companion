-- Campus Incharge: assign sections (not whole classes) for student visibility.

ALTER TABLE public.campus_incharge_assignments
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.sections(id) ON DELETE CASCADE;

-- Migrate existing class-level assignments to all sections in those classes.
INSERT INTO public.campus_incharge_assignments (user_id, section_id)
SELECT DISTINCT a.user_id, s.id
FROM public.campus_incharge_assignments a
JOIN public.sections s ON s.class_id = a.class_id
WHERE a.section_id IS NULL
  AND a.class_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.campus_incharge_assignments x
    WHERE x.user_id = a.user_id
      AND x.section_id = s.id
  );

DELETE FROM public.campus_incharge_assignments
WHERE section_id IS NULL;

ALTER TABLE public.campus_incharge_assignments
  DROP CONSTRAINT IF EXISTS campus_incharge_assignments_user_id_class_id_key;

DROP INDEX IF EXISTS idx_campus_incharge_assignments_class;

ALTER TABLE public.campus_incharge_assignments
  DROP COLUMN IF EXISTS class_id;

ALTER TABLE public.campus_incharge_assignments
  ALTER COLUMN section_id SET NOT NULL;

ALTER TABLE public.campus_incharge_assignments
  DROP CONSTRAINT IF EXISTS campus_incharge_assignments_user_id_section_id_key;

ALTER TABLE public.campus_incharge_assignments
  ADD CONSTRAINT campus_incharge_assignments_user_id_section_id_key UNIQUE (user_id, section_id);

CREATE INDEX IF NOT EXISTS idx_campus_incharge_assignments_section
  ON public.campus_incharge_assignments (section_id);

CREATE OR REPLACE FUNCTION public.campus_incharge_can_view_student(_user_id UUID, _student_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.campus_incharge_assignments a
      ON a.section_id = s.section_id
     AND a.user_id = _user_id
    WHERE s.id = _student_id
      AND s.section_id IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.campus_incharge_can_view_student(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
