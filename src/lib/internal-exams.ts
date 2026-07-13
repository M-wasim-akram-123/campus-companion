import { supabase } from "@/integrations/supabase/client";
import { currentAcademicYearStart, ordinalYearLabel } from "@/lib/academic";

export type InternalTestStatus = "draft" | "published";

export type SeriesSectionOption = {
  id: string;
  name: string;
  gender: "boys" | "girls";
};

export type InternalTestSeries = {
  id: string;
  academic_session_id: string;
  academic_year_start: number;
  class_year_level: number;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  academic_sessions?: { label?: string } | null;
};

export type InternalTest = {
  id: string;
  series_id: string | null;
  academic_session_id: string;
  academic_year_start: number;
  class_year_level: number;
  section_id: string | null;
  subject_name: string;
  test_name: string;
  test_date: string;
  max_marks: number;
  passing_marks: number | null;
  teacher_name: string | null;
  paper_received: boolean;
  status: InternalTestStatus;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  academic_sessions?: { label?: string } | null;
  sections?: { name?: string; gender?: string } | null;
  internal_test_series?: { name?: string } | null;
};

export type InternalTestMark = {
  id: string;
  internal_test_id: string;
  student_id: string;
  marks_obtained: number | null;
  is_absent: boolean;
  remarks: string | null;
  entered_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InternalTestStudentRow = {
  studentId: string;
  rollNumber: string;
  fullName: string;
  fatherName: string;
  sectionLabel: string;
  markId: string | null;
  marksObtained: number | null;
  isAbsent: boolean;
  remarks: string | null;
};

export type StudentPublishedResult = {
  testId: string;
  subjectName: string;
  testName: string;
  testDate: string;
  maxMarks: number;
  marksObtained: number | null;
  isAbsent: boolean;
  academicYearStart: number;
  classYearLevel: number;
};

export type StudentPublishedSeriesGroup = {
  seriesName: string;
  classYearLevel: number;
  academicYearStart: number;
  subjects: StudentPublishedResult[];
};

export type StudentUpcomingTest = {
  testId: string;
  seriesName: string;
  subjectName: string;
  testDate: string;
  maxMarks: number;
  teacherName: string | null;
  classYearLevel: number;
};

export type StudentUpcomingSeriesGroup = {
  seriesName: string;
  classYearLevel: number;
  subjects: StudentUpcomingTest[];
};

export type InternalTestFilters = {
  sessionId?: string;
  academicYearStart?: number;
  classYearLevel?: number;
  subjectName?: string;
  status?: InternalTestStatus;
  seriesId?: string;
};

export type InternalTestSeriesFilters = {
  sessionId?: string;
  academicYearStart?: number;
  classYearLevel?: number;
};

export type CreateInternalTestSeriesInput = {
  academic_session_id: string;
  academic_year_start?: number;
  class_year_level: number;
  name: string;
  section_ids: string[];
};

export type CreateSeriesSubjectInput = {
  series_id: string;
  subject_name: string;
  test_date: string;
  max_marks: number;
  passing_marks?: number | null;
  teacher_name?: string | null;
  paper_received?: boolean;
};

export type UpdateSeriesSubjectInput = {
  subject_name?: string;
  test_date?: string;
  max_marks?: number;
  passing_marks?: number | null;
  teacher_name?: string | null;
  paper_received?: boolean;
};

function throwErr(error: { message?: string }) {
  throw new Error(error.message ?? "Request failed");
}

export async function fetchSectionsForClassYear(
  sessionId: string,
  classYearLevel: number,
): Promise<SeriesSectionOption[]> {
  const { data: classes, error: classErr } = await supabase
    .from("classes")
    .select("id")
    .eq("year_level", classYearLevel);
  if (classErr) throwErr(classErr);
  const classIds = (classes ?? []).map((c) => c.id);
  if (!classIds.length) return [];

  const { data, error } = await supabase
    .from("sections")
    .select("id, name, gender")
    .eq("session_id", sessionId)
    .in("class_id", classIds)
    .order("gender")
    .order("name");
  if (error) throwErr(error);
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    gender: s.gender as "boys" | "girls",
  }));
}

export async function fetchSeriesSections(seriesId: string): Promise<SeriesSectionOption[]> {
  const { data, error } = await supabase
    .from("internal_test_series_sections")
    .select("sections(id, name, gender)")
    .eq("series_id", seriesId);
  if (error) throwErr(error);

  return (data ?? [])
    .map((row) => row.sections as { id: string; name: string; gender: string } | null)
    .filter((s): s is { id: string; name: string; gender: string } => !!s)
    .map((s) => ({
      id: s.id,
      name: s.name,
      gender: s.gender as "boys" | "girls",
    }))
    .sort((a, b) => a.gender.localeCompare(b.gender) || a.name.localeCompare(b.name));
}

export function formatSeriesSectionLabel(section: SeriesSectionOption): string {
  return `${section.gender === "girls" ? "Girls" : "Boys"} — ${section.name}`;
}

export async function fetchInternalTestSeries(
  filters: InternalTestSeriesFilters = {},
): Promise<InternalTestSeries[]> {
  let query = supabase
    .from("internal_test_series")
    .select("*, academic_sessions(label)")
    .order("created_at", { ascending: false });

  if (filters.sessionId) query = query.eq("academic_session_id", filters.sessionId);
  if (filters.academicYearStart != null) {
    query = query.eq("academic_year_start", filters.academicYearStart);
  }
  if (filters.classYearLevel != null) query = query.eq("class_year_level", filters.classYearLevel);

  const { data, error } = await query;
  if (error) throwErr(error);
  return (data ?? []) as InternalTestSeries[];
}

export async function fetchInternalTestSeriesById(id: string): Promise<InternalTestSeries | null> {
  const { data, error } = await supabase
    .from("internal_test_series")
    .select("*, academic_sessions(label)")
    .eq("id", id)
    .maybeSingle();
  if (error) throwErr(error);
  return (data as InternalTestSeries | null) ?? null;
}

export async function createInternalTestSeries(
  input: CreateInternalTestSeriesInput,
  createdBy?: string | null,
): Promise<InternalTestSeries> {
  if (!input.section_ids.length) {
    throw new Error("Select at least one boys or girls section for this series.");
  }

  const { data, error } = await supabase
    .from("internal_test_series")
    .insert({
      academic_session_id: input.academic_session_id,
      academic_year_start: input.academic_year_start ?? currentAcademicYearStart(),
      class_year_level: input.class_year_level,
      name: input.name.trim(),
      created_by: createdBy ?? null,
    })
    .select("*, academic_sessions(label)")
    .single();
  if (error) throwErr(error);

  const sectionRows = input.section_ids.map((sectionId) => ({
    series_id: data.id,
    section_id: sectionId,
  }));
  const { error: sectionErr } = await supabase.from("internal_test_series_sections").insert(sectionRows);
  if (sectionErr) throwErr(sectionErr);

  return data as InternalTestSeries;
}

export async function fetchTestsForSeries(seriesId: string): Promise<InternalTest[]> {
  return fetchInternalTests({ seriesId });
}

export async function fetchInternalTests(filters: InternalTestFilters = {}): Promise<InternalTest[]> {
  let query = supabase
    .from("internal_tests")
    .select("*, academic_sessions(label), sections(name, gender), internal_test_series(name)")
    .order("test_date", { ascending: true })
    .order("subject_name", { ascending: true });

  if (filters.sessionId) query = query.eq("academic_session_id", filters.sessionId);
  if (filters.academicYearStart != null) {
    query = query.eq("academic_year_start", filters.academicYearStart);
  }
  if (filters.classYearLevel != null) query = query.eq("class_year_level", filters.classYearLevel);
  if (filters.seriesId) query = query.eq("series_id", filters.seriesId);
  if (filters.subjectName?.trim()) {
    query = query.ilike("subject_name", `%${filters.subjectName.trim()}%`);
  }
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throwErr(error);
  return (data ?? []) as InternalTest[];
}

export async function fetchInternalTestById(id: string): Promise<InternalTest | null> {
  const { data, error } = await supabase
    .from("internal_tests")
    .select("*, academic_sessions(label), sections(name, gender), internal_test_series(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throwErr(error);
  return (data as InternalTest | null) ?? null;
}

export type CreateInternalTestInput = {
  academic_session_id: string;
  academic_year_start?: number;
  class_year_level: number;
  section_id?: string | null;
  subject_name: string;
  test_name: string;
  test_date: string;
  max_marks: number;
  passing_marks?: number | null;
};

export async function createSeriesSubjectTest(
  input: CreateSeriesSubjectInput,
  createdBy?: string | null,
): Promise<InternalTest> {
  const series = await fetchInternalTestSeriesById(input.series_id);
  if (!series) throw new Error("Test series not found.");

  const { data, error } = await supabase
    .from("internal_tests")
    .insert({
      series_id: series.id,
      academic_session_id: series.academic_session_id,
      academic_year_start: series.academic_year_start,
      class_year_level: series.class_year_level,
      section_id: null,
      subject_name: input.subject_name.trim(),
      test_name: series.name,
      test_date: input.test_date,
      max_marks: input.max_marks,
      passing_marks: input.passing_marks ?? null,
      teacher_name: input.teacher_name?.trim() || null,
      paper_received: input.paper_received ?? false,
      status: "draft",
      created_by: createdBy ?? null,
    })
    .select("*, academic_sessions(label), sections(name, gender), internal_test_series(name)")
    .single();
  if (error) throwErr(error);
  return data as InternalTest;
}

export async function updateSeriesSubjectTest(
  id: string,
  input: UpdateSeriesSubjectInput,
): Promise<InternalTest> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.subject_name) patch.subject_name = input.subject_name.trim();
  if (input.test_date) patch.test_date = input.test_date;
  if (input.max_marks != null) patch.max_marks = input.max_marks;
  if (input.passing_marks !== undefined) patch.passing_marks = input.passing_marks;
  if (input.teacher_name !== undefined) patch.teacher_name = input.teacher_name?.trim() || null;
  if (input.paper_received !== undefined) patch.paper_received = input.paper_received;

  const { data, error } = await supabase
    .from("internal_tests")
    .update(patch)
    .eq("id", id)
    .eq("status", "draft")
    .select("*, academic_sessions(label), sections(name, gender), internal_test_series(name)")
    .single();
  if (error) throwErr(error);
  return data as InternalTest;
}

export async function createInternalTest(
  input: CreateInternalTestInput,
  createdBy?: string | null,
): Promise<InternalTest> {
  const { data, error } = await supabase
    .from("internal_tests")
    .insert({
      academic_session_id: input.academic_session_id,
      academic_year_start: input.academic_year_start ?? currentAcademicYearStart(),
      class_year_level: input.class_year_level,
      section_id: input.section_id ?? null,
      subject_name: input.subject_name.trim(),
      test_name: input.test_name.trim(),
      test_date: input.test_date,
      max_marks: input.max_marks,
      passing_marks: input.passing_marks ?? null,
      status: "draft",
      created_by: createdBy ?? null,
    })
    .select("*, academic_sessions(label), sections(name, gender)")
    .single();
  if (error) throwErr(error);
  return data as InternalTest;
}

export async function updateInternalTest(
  id: string,
  input: Partial<CreateInternalTestInput>,
): Promise<InternalTest> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.academic_session_id) patch.academic_session_id = input.academic_session_id;
  if (input.academic_year_start != null) patch.academic_year_start = input.academic_year_start;
  if (input.class_year_level != null) patch.class_year_level = input.class_year_level;
  if (input.section_id !== undefined) patch.section_id = input.section_id;
  if (input.subject_name) patch.subject_name = input.subject_name.trim();
  if (input.test_name) patch.test_name = input.test_name.trim();
  if (input.test_date) patch.test_date = input.test_date;
  if (input.max_marks != null) patch.max_marks = input.max_marks;
  if (input.passing_marks !== undefined) patch.passing_marks = input.passing_marks;

  const { data, error } = await supabase
    .from("internal_tests")
    .update(patch)
    .eq("id", id)
    .eq("status", "draft")
    .select("*, academic_sessions(label), sections(name, gender)")
    .single();
  if (error) throwErr(error);
  return data as InternalTest;
}

export function describeTestStudentScope(test: InternalTest, sectionId?: string | null): string {
  const parts = [
    test.academic_sessions?.label ?? "selected session",
    ordinalYearLabel(test.class_year_level),
    sectionId ? "selected section" : sectionLabel(test),
    "status: active",
  ];
  return parts.join(" · ");
}

export async function listStudentsForTest(
  test: InternalTest,
  sectionId?: string | null,
): Promise<InternalTestStudentRow[]> {
  const effectiveSectionId = sectionId ?? test.section_id;
  if (!effectiveSectionId) return [];

  let studentQuery = supabase
    .from("students")
    .select(
      "id, roll_number, full_name, father_name, section_id, admission_year_level, sections(name, gender, classes(year_level)), classes(year_level)",
    )
    .eq("academic_session_id", test.academic_session_id)
    .eq("status", "active")
    .eq("section_id", effectiveSectionId)
    .order("roll_number");

  const [{ data: students, error: stErr }, { data: marks, error: markErr }] = await Promise.all([
    studentQuery,
    supabase.from("internal_test_marks").select("*").eq("internal_test_id", test.id),
  ]);
  if (stErr) throwErr(stErr);
  if (markErr) throwErr(markErr);

  const markByStudent = new Map((marks ?? []).map((m) => [m.student_id, m as InternalTestMark]));

  return (students ?? []).map((st) => {
      const section = st.sections as { name?: string; gender?: string } | null;
      const mark = markByStudent.get(st.id);
      return {
        studentId: st.id,
        rollNumber: st.roll_number,
        fullName: st.full_name,
        fatherName: st.father_name ?? "—",
        sectionLabel: section
          ? `${section.gender === "girls" ? "Girls" : "Boys"} — ${section.name}`
          : "Unassigned",
        markId: mark?.id ?? null,
        marksObtained: mark?.marks_obtained != null ? Number(mark.marks_obtained) : null,
        isAbsent: mark?.is_absent ?? false,
        remarks: mark?.remarks ?? null,
      };
    });
}

export type SaveTestMarkRow = {
  studentId: string;
  marksObtained: number | null;
  isAbsent: boolean;
  remarks?: string | null;
};

export async function saveTestMarks(
  test: InternalTest,
  rows: SaveTestMarkRow[],
  enteredBy?: string | null,
): Promise<void> {
  if (test.status !== "draft") {
    throw new Error("Marks can only be saved while the test is in draft status.");
  }

  const maxMarks = Number(test.max_marks);
  const payload = rows
    .filter((row) => row.isAbsent || row.marksObtained != null)
    .map((row) => {
      if (!row.isAbsent) {
        const marks = Number(row.marksObtained);
        if (Number.isNaN(marks) || marks < 0) {
          throw new Error("Marks must be zero or greater.");
        }
        if (marks > maxMarks) {
          throw new Error(`Marks cannot exceed ${maxMarks}.`);
        }
      }
      return {
        internal_test_id: test.id,
        student_id: row.studentId,
        marks_obtained: row.isAbsent ? null : row.marksObtained,
        is_absent: row.isAbsent,
        remarks: row.remarks?.trim() || null,
        entered_by: enteredBy ?? null,
        updated_at: new Date().toISOString(),
      };
    });

  if (!payload.length) return;

  const { error } = await supabase
    .from("internal_test_marks")
    .upsert(payload, { onConflict: "internal_test_id,student_id" });
  if (error) throwErr(error);
}

export async function publishInternalTest(testId: string): Promise<InternalTest> {
  const test = await fetchInternalTestById(testId);
  if (!test) throw new Error("Test not found.");
  if (test.status === "published") throw new Error("Test is already published.");

  const { count, error: countErr } = await supabase
    .from("internal_test_marks")
    .select("id", { count: "exact", head: true })
    .eq("internal_test_id", testId);
  if (countErr) throwErr(countErr);
  if (!count) {
    throw new Error("Enter at least one mark or absent record before publishing.");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("internal_tests")
    .update({ status: "published", published_at: now, updated_at: now })
    .eq("id", testId)
    .eq("status", "draft")
    .select("*, academic_sessions(label), sections(name, gender)")
    .single();
  if (error) throwErr(error);
  return data as InternalTest;
}

export async function fetchStudentPublishedResults(
  studentId: string,
): Promise<StudentPublishedResult[]> {
  const { data, error } = await supabase
    .from("internal_test_marks")
    .select(
      `
      marks_obtained,
      is_absent,
      internal_tests!inner(
        id,
        subject_name,
        test_name,
        test_date,
        max_marks,
        academic_year_start,
        class_year_level,
        status
      )
    `,
    )
    .eq("student_id", studentId)
    .eq("internal_tests.status", "published")
    .order("test_date", { referencedTable: "internal_tests", ascending: false });
  if (error) throwErr(error);

  return (data ?? []).map((row) => {
    const test = row.internal_tests as {
      id: string;
      subject_name: string;
      test_name: string;
      test_date: string;
      max_marks: number;
      academic_year_start: number;
      class_year_level: number;
    };
    return {
      testId: test.id,
      subjectName: test.subject_name,
      testName: test.test_name,
      testDate: test.test_date,
      maxMarks: Number(test.max_marks),
      marksObtained: row.marks_obtained != null ? Number(row.marks_obtained) : null,
      isAbsent: row.is_absent,
      academicYearStart: test.academic_year_start,
      classYearLevel: test.class_year_level,
    };
  });
}

export async function fetchStudentUpcomingSchedule(): Promise<StudentUpcomingTest[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("internal_tests")
    .select(
      `
      id,
      subject_name,
      test_name,
      test_date,
      max_marks,
      teacher_name,
      class_year_level,
      internal_test_series!inner(name)
    `,
    )
    .eq("status", "draft")
    .not("series_id", "is", null)
    .gte("test_date", today)
    .order("test_date", { ascending: true })
    .order("subject_name", { ascending: true });
  if (error) throwErr(error);

  return (data ?? []).map((row) => {
    const series = row.internal_test_series as { name?: string } | null;
    return {
      testId: row.id,
      seriesName: series?.name ?? row.test_name,
      subjectName: row.subject_name,
      testDate: row.test_date,
      maxMarks: Number(row.max_marks),
      teacherName: row.teacher_name ?? null,
      classYearLevel: row.class_year_level,
    };
  });
}

export function groupStudentUpcomingSchedule(
  items: StudentUpcomingTest[],
): StudentUpcomingSeriesGroup[] {
  const groups = new Map<string, StudentUpcomingSeriesGroup>();
  for (const row of items) {
    const key = row.seriesName;
    if (!groups.has(key)) {
      groups.set(key, {
        seriesName: row.seriesName,
        classYearLevel: row.classYearLevel,
        subjects: [],
      });
    }
    groups.get(key)!.subjects.push(row);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    subjects: [...group.subjects].sort(
      (a, b) => a.testDate.localeCompare(b.testDate) || a.subjectName.localeCompare(b.subjectName),
    ),
  }));
}

export function groupStudentPublishedResults(
  results: StudentPublishedResult[],
): StudentPublishedSeriesGroup[] {
  const groups = new Map<string, StudentPublishedSeriesGroup>();
  for (const row of results) {
    const key = `${row.testName}::${row.academicYearStart}::${row.classYearLevel}`;
    if (!groups.has(key)) {
      groups.set(key, {
        seriesName: row.testName,
        academicYearStart: row.academicYearStart,
        classYearLevel: row.classYearLevel,
        subjects: [],
      });
    }
    groups.get(key)!.subjects.push(row);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      subjects: [...group.subjects].sort(
        (a, b) => a.subjectName.localeCompare(b.subjectName) || a.testDate.localeCompare(b.testDate),
      ),
    }))
    .sort((a, b) => b.academicYearStart - a.academicYearStart || a.seriesName.localeCompare(b.seriesName));
}

export function sectionLabel(test: InternalTest): string {
  if (!test.section_id) return "All sections";
  const section = test.sections;
  if (!section?.name) return "Section";
  return `${section.gender === "girls" ? "Girls" : "Boys"} — ${section.name}`;
}

export function seriesName(test: InternalTest): string {
  return test.internal_test_series?.name ?? test.test_name;
}

export function academicYearLabel(yearStart: number): string {
  return `${yearStart}–${yearStart + 1}`;
}

export type SeriesProgress = {
  totalSubjects: number;
  papersPending: number;
  marksPending: number;
  published: number;
};

export function summarizeSeriesProgress(tests: InternalTest[]): SeriesProgress {
  const draft = tests.filter((t) => t.status === "draft");
  const uniqueSubjects = new Set(tests.map((t) => t.subject_name.trim().toLowerCase()));
  return {
    totalSubjects: uniqueSubjects.size || tests.length,
    papersPending: draft.filter((t) => !t.paper_received).length,
    marksPending: draft.length,
    published: tests.filter((t) => t.status === "published").length,
  };
}
