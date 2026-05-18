-- Matric / prior education on inquiries and students
ALTER TABLE public.inquiries
  ADD COLUMN matric_school TEXT,
  ADD COLUMN matric_marks_obtained NUMERIC(6,2),
  ADD COLUMN matric_marks_total NUMERIC(6,2),
  ADD COLUMN preferred_section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL;

ALTER TABLE public.students
  ADD COLUMN matric_school TEXT,
  ADD COLUMN matric_marks_obtained NUMERIC(6,2),
  ADD COLUMN matric_marks_total NUMERIC(6,2);

-- Admission officers can manage sections (not only super_admin)
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

