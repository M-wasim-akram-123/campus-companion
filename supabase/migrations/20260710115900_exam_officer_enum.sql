-- exam_officer must be committed before internal_exams migration uses it.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'exam_officer';
