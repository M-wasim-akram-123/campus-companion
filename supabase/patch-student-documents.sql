-- Patch: student document collection, review, and private storage.
-- Run in Supabase SQL editor before testing the student document workflow.

DO $$
BEGIN
  CREATE TYPE public.student_document_type AS ENUM (
    'cnic_b_form',
    'guardian_cnic',
    'domicile',
    'matric_result_card',
    'other_supporting'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.student_document_status AS ENUM (
    'pending_review',
    'approved',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_login_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS student_login_created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_user_id_unique
  ON public.students(user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.student_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  document_type public.student_document_type NOT NULL,
  status public.student_document_status NOT NULL DEFAULT 'pending_review',
  file_path TEXT NOT NULL,
  original_file_name TEXT,
  mime_type TEXT,
  file_size BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_documents_student_type
  ON public.student_documents(student_id, document_type);
CREATE INDEX IF NOT EXISTS idx_student_documents_status
  ON public.student_documents(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_documents_one_open_per_type
  ON public.student_documents(student_id, document_type)
  WHERE status IN ('pending_review', 'approved');

CREATE TABLE IF NOT EXISTS public.student_document_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES public.student_documents(id) ON DELETE SET NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_document_audit_student
  ON public.student_document_audit_log(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_document_audit_document
  ON public.student_document_audit_log(document_id, created_at DESC);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-documents',
  'student-documents',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[];

CREATE OR REPLACE FUNCTION public.is_document_staff(_user_id UUID)
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
      AND role::TEXT IN ('super_admin','admission_officer','hr','finance_admin','finance_officer')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.students
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_student_document_owner(_student_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students
    WHERE id = _student_id
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_upload_student_document(
  p_student_id UUID,
  p_document_type public.student_document_type
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_student_document_owner(p_student_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_documents
      WHERE student_id = p_student_id
        AND document_type = p_document_type
        AND status IN ('pending_review', 'approved')
    );
$$;

CREATE OR REPLACE FUNCTION public.submit_student_document(
  p_document_type public.student_document_type,
  p_file_path TEXT,
  p_original_file_name TEXT DEFAULT NULL,
  p_mime_type TEXT DEFAULT NULL,
  p_file_size BIGINT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_student_id UUID;
  v_document_id UUID;
  v_version INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  SELECT id INTO v_student_id
  FROM public.students
  WHERE user_id = v_user
  LIMIT 1;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'No student profile is linked with this login.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_documents
    WHERE student_id = v_student_id
      AND document_type = p_document_type
      AND status IN ('pending_review', 'approved')
  ) THEN
    RAISE EXCEPTION 'This document is already submitted or approved.';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.student_documents
  WHERE student_id = v_student_id
    AND document_type = p_document_type;

  INSERT INTO public.student_documents (
    student_id,
    document_type,
    status,
    file_path,
    original_file_name,
    mime_type,
    file_size,
    uploaded_by,
    version
  )
  VALUES (
    v_student_id,
    p_document_type,
    'pending_review',
    p_file_path,
    p_original_file_name,
    p_mime_type,
    p_file_size,
    v_user,
    v_version
  )
  RETURNING id INTO v_document_id;

  INSERT INTO public.student_document_audit_log (document_id, student_id, actor_id, action, after_data)
  VALUES (
    v_document_id,
    v_student_id,
    v_user,
    'submitted',
    jsonb_build_object('document_type', p_document_type, 'file_path', p_file_path, 'version', v_version)
  );

  RETURN v_document_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_student_document(
  p_document_id UUID,
  p_status public.student_document_status,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_before public.student_documents%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be logged in.';
  END IF;

  IF NOT public.is_document_staff(v_user) THEN
    RAISE EXCEPTION 'Only staff can review student documents.';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Review status must be approved or rejected.';
  END IF;

  SELECT * INTO v_before
  FROM public.student_documents
  WHERE id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found.';
  END IF;

  IF v_before.status = 'approved' THEN
    RAISE EXCEPTION 'Approved documents are locked.';
  END IF;

  IF p_status = 'rejected' AND NULLIF(TRIM(COALESCE(p_rejection_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Rejection reason is required.';
  END IF;

  UPDATE public.student_documents
  SET
    status = p_status,
    reviewed_by = v_user,
    reviewed_at = now(),
    rejection_reason = CASE WHEN p_status = 'rejected' THEN p_rejection_reason ELSE NULL END,
    updated_at = now()
  WHERE id = p_document_id;

  INSERT INTO public.student_document_audit_log (
    document_id,
    student_id,
    actor_id,
    action,
    before_data,
    after_data,
    notes
  )
  VALUES (
    p_document_id,
    v_before.student_id,
    v_user,
    CASE WHEN p_status = 'approved' THEN 'approved' ELSE 'rejected' END,
    to_jsonb(v_before),
    jsonb_build_object('status', p_status, 'reviewed_by', v_user, 'reviewed_at', now()),
    p_rejection_reason
  );

  RETURN p_document_id;
END;
$$;

ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_document_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Student documents readable by owner or staff" ON public.student_documents;
CREATE POLICY "Student documents readable by owner or staff"
  ON public.student_documents
  FOR SELECT TO authenticated
  USING (
    public.is_document_staff(auth.uid())
    OR public.is_student_document_owner(student_id)
  );

DROP POLICY IF EXISTS "Student documents inserted by owner" ON public.student_documents;
CREATE POLICY "Student documents inserted by owner"
  ON public.student_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_student_document_owner(student_id)
    AND uploaded_by = auth.uid()
    AND status = 'pending_review'
    AND public.can_upload_student_document(student_id, document_type)
  );

DROP POLICY IF EXISTS "Student documents reviewed by staff" ON public.student_documents;
CREATE POLICY "Student documents reviewed by staff"
  ON public.student_documents
  FOR UPDATE TO authenticated
  USING (public.is_document_staff(auth.uid()))
  WITH CHECK (public.is_document_staff(auth.uid()));

DROP POLICY IF EXISTS "Student document audit readable by staff" ON public.student_document_audit_log;
CREATE POLICY "Student document audit readable by staff"
  ON public.student_document_audit_log
  FOR SELECT TO authenticated
  USING (public.is_document_staff(auth.uid()));

DROP POLICY IF EXISTS "Student document audit inserted by system users" ON public.student_document_audit_log;
CREATE POLICY "Student document audit inserted by system users"
  ON public.student_document_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR public.is_document_staff(auth.uid()));

DROP POLICY IF EXISTS "Student document storage select" ON storage.objects;
CREATE POLICY "Student document storage select"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND (
      public.is_document_staff(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.student_documents sd
        WHERE sd.file_path = name
          AND public.is_student_document_owner(sd.student_id)
      )
    )
  );

DROP POLICY IF EXISTS "Student document storage insert" ON storage.objects;
CREATE POLICY "Student document storage insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'student-documents'
    AND (storage.foldername(name))[1] = 'students'
    AND (storage.foldername(name))[2] = public.current_student_id()::TEXT
    AND (storage.foldername(name))[3] IN (
      'cnic_b_form',
      'guardian_cnic',
      'domicile',
      'matric_result_card',
      'other_supporting'
    )
    AND public.can_upload_student_document(
      public.current_student_id(),
      ((storage.foldername(name))[3])::public.student_document_type
    )
  );

DROP POLICY IF EXISTS "Student document storage staff update" ON storage.objects;
CREATE POLICY "Student document storage staff update"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'student-documents' AND public.is_document_staff(auth.uid()))
  WITH CHECK (bucket_id = 'student-documents' AND public.is_document_staff(auth.uid()));

DROP POLICY IF EXISTS "Student document storage staff delete" ON storage.objects;
CREATE POLICY "Student document storage staff delete"
  ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'student-documents' AND public.is_document_staff(auth.uid()));

GRANT EXECUTE ON FUNCTION public.is_document_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_student_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_student_document_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_student_document(UUID, public.student_document_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_student_document(public.student_document_type, TEXT, TEXT, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_student_document(UUID, public.student_document_status, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
