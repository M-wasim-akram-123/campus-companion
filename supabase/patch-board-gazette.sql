-- Board result gazettes (import a new PDF each exam year)

CREATE TABLE IF NOT EXISTS public.board_gazette_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_code TEXT NOT NULL DEFAULT 'bise_multan',
  exam_level TEXT NOT NULL CHECK (exam_level IN ('ssc', 'hssc')),
  exam_session TEXT NOT NULL DEFAULT '1st_annual',
  exam_year INTEGER NOT NULL,
  label TEXT NOT NULL,
  marks_total INTEGER NOT NULL DEFAULT 1100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  source_file TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (board_code, exam_level, exam_session, exam_year)
);

CREATE TABLE IF NOT EXISTS public.board_gazette_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.board_gazette_imports(id) ON DELETE CASCADE,
  roll_number TEXT NOT NULL,
  candidate_name TEXT,
  marks_obtained INTEGER,
  result_status TEXT NOT NULL DEFAULT 'passed'
    CHECK (result_status IN ('passed', 'failed', 'absent', 'incomplete')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (import_id, roll_number)
);

CREATE INDEX IF NOT EXISTS idx_board_gazette_results_import_roll
  ON public.board_gazette_results (import_id, roll_number);

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS board_roll_number TEXT,
  ADD COLUMN IF NOT EXISTS board_gazette_import_id UUID
    REFERENCES public.board_gazette_imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inquiries_board_gazette_import
  ON public.inquiries (board_gazette_import_id);

ALTER TABLE public.board_gazette_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_gazette_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read board gazette imports" ON public.board_gazette_imports;
CREATE POLICY "Staff read board gazette imports" ON public.board_gazette_imports
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff read board gazette results" ON public.board_gazette_results;
CREATE POLICY "Staff read board gazette results" ON public.board_gazette_results
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

NOTIFY pgrst, 'reload schema';
