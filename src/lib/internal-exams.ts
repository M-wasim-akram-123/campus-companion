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
  subject_id: string | null;
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
  subject_id: string;
  test_date: string;
  max_marks: number;
  passing_marks?: number | null;
};

export type UpdateSeriesSubjectInput = {
  test_date?: string;
  max_marks?: number;
  passing_marks?: number | null;
};

export type InternalTestSectionMeta = {
  id: string;
  internal_test_id: string;
  section_id: string;
  subject_id: string;
  teacher_user_id: string;
  teacher_name_snapshot: string;
  paper_received: boolean;
  marks_completed: boolean;
  marks_completed_at: string | null;
  marks_completed_by: string | null;
  sections?: { name?: string; gender?: string } | null;
};

function throwErr(error: { message?: string }) {
  const message = error.message ?? "Request failed";
  if (/idx_internal_test_series_unique_name/i.test(message)) {
    throw new Error("A test series with this name already exists for that class and year.");
  }
  if (/unique_internal_tests_series_subject/i.test(message)) {
    throw new Error("This subject is already announced in the series.");
  }
  throw new Error(message);
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

  await announceSeriesAssignedSubjects(data.id, createdBy);
  return data as InternalTestSeries;
}

export async function updateInternalTestSeries(
  seriesId: string,
  input: CreateInternalTestSeriesInput,
): Promise<InternalTestSeries> {
  if (!input.section_ids.length) {
    throw new Error("Select at least one boys or girls section for this series.");
  }

  const uniqueSectionIds = [...new Set(input.section_ids)];
  const currentSections = await fetchSeriesSections(seriesId);
  const currentIds = currentSections.map((s) => s.id);
  const removedIds = currentIds.filter((id) => !uniqueSectionIds.includes(id));

  if (removedIds.length) {
    const { data: blocked, error: blockedErr } = await supabase
      .from("internal_test_section_meta")
      .select("id, section_id, internal_tests!inner(series_id)")
      .eq("internal_tests.series_id", seriesId)
      .in("section_id", removedIds)
      .limit(1);
    if (blockedErr) throwErr(blockedErr);
    if (blocked?.length) {
      throw new Error(
        "Cannot remove a section that already has subject papers or marks. Keep those sections or delete the papers first.",
      );
    }
  }

  const { data, error } = await supabase
    .from("internal_test_series")
    .update({
      academic_session_id: input.academic_session_id,
      academic_year_start: input.academic_year_start ?? currentAcademicYearStart(),
      class_year_level: input.class_year_level,
      name: input.name.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", seriesId)
    .select("*, academic_sessions(label)")
    .single();
  if (error) throwErr(error);

  const addedIds = uniqueSectionIds.filter((id) => !currentIds.includes(id));
  if (addedIds.length) {
    const { error: addErr } = await supabase.from("internal_test_series_sections").insert(
      addedIds.map((sectionId) => ({ series_id: seriesId, section_id: sectionId })),
    );
    if (addErr) throwErr(addErr);
  }
  if (removedIds.length) {
    const { error: removeErr } = await supabase
      .from("internal_test_series_sections")
      .delete()
      .eq("series_id", seriesId)
      .in("section_id", removedIds);
    if (removeErr) throwErr(removeErr);
  }

  const { error: testsErr } = await supabase
    .from("internal_tests")
    .update({
      academic_session_id: data.academic_session_id,
      academic_year_start: data.academic_year_start,
      class_year_level: data.class_year_level,
      test_name: data.name,
      updated_at: new Date().toISOString(),
    })
    .eq("series_id", seriesId);
  if (testsErr) throwErr(testsErr);

  await announceSeriesAssignedSubjects(seriesId, data.created_by);
  return data as InternalTestSeries;
}

export async function deleteInternalTestSeries(seriesId: string): Promise<void> {
  const { error } = await supabase.from("internal_test_series").delete().eq("id", seriesId);
  if (error) throwErr(error);
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

export async function fetchInternalTestSectionMeta(
  testId: string,
): Promise<InternalTestSectionMeta[]> {
  const { data, error } = await supabase
    .from("internal_test_section_meta")
    .select("*, sections(name, gender)")
    .eq("internal_test_id", testId)
    .order("teacher_name_snapshot");
  if (error) throwErr(error);
  return (data ?? []) as InternalTestSectionMeta[];
}

export async function fetchSeriesTestSectionMeta(
  seriesId: string,
): Promise<InternalTestSectionMeta[]> {
  const { data, error } = await supabase
    .from("internal_test_section_meta")
    .select("*, sections(name, gender), internal_tests!inner(series_id)")
    .eq("internal_tests.series_id", seriesId)
    .order("teacher_name_snapshot");
  if (error) throwErr(error);
  return (data ?? []) as InternalTestSectionMeta[];
}

export async function setInternalTestSectionPaperReceived(
  metaId: string,
  paperReceived: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("internal_test_section_meta")
    .update({
      paper_received: paperReceived,
      updated_at: new Date().toISOString(),
    })
    .eq("id", metaId);
  if (error) throwErr(error);
}

export async function completeInternalTestSection(
  testId: string,
  sectionId: string,
): Promise<void> {
  const { error } = await supabase.rpc("complete_internal_test_section", {
    p_test_id: testId,
    p_section_id: sectionId,
  });
  if (error) throwErr(error);
}

export type CreateInternalTestInput = {
  academic_session_id: string;
  academic_year_start?: number;
  class_year_level: number;
  section_id?: string | null;
  subject_id?: string | null;
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

  const { data: subject, error: subjectError } = await supabase
    .from("intermediate_subjects")
    .select("id, name, is_active")
    .eq("id", input.subject_id)
    .single();
  if (subjectError) throwErr(subjectError);
  if (!subject.is_active) throw new Error("Selected subject is inactive.");

  const { data, error } = await supabase
    .from("internal_tests")
    .insert({
      series_id: series.id,
      subject_id: subject.id,
      academic_session_id: series.academic_session_id,
      academic_year_start: series.academic_year_start,
      class_year_level: series.class_year_level,
      section_id: null,
      subject_name: subject.name,
      test_name: series.name,
      test_date: input.test_date,
      max_marks: input.max_marks,
      passing_marks: input.passing_marks ?? null,
      teacher_name: null,
      paper_received: false,
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
  if (input.test_date) patch.test_date = input.test_date;
  if (input.max_marks != null) patch.max_marks = input.max_marks;
  if (input.passing_marks !== undefined) patch.passing_marks = input.passing_marks;

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
  if (input.subject_id && input.section_id) {
    const { data, error } = await supabase.rpc("create_teacher_class_test", {
      p_academic_session_id: input.academic_session_id,
      p_academic_year_start: input.academic_year_start ?? currentAcademicYearStart(),
      p_class_year_level: input.class_year_level,
      p_section_id: input.section_id,
      p_subject_id: input.subject_id,
      p_test_name: input.test_name.trim(),
      p_test_date: input.test_date,
      p_max_marks: input.max_marks,
      p_passing_marks: input.passing_marks ?? null,
    });
    if (error) throwErr(error);
    const created = data as InternalTest;
    const hydrated = await fetchInternalTestById(created.id);
    return hydrated ?? created;
  }

  const { data, error } = await supabase
    .from("internal_tests")
    .insert({
      academic_session_id: input.academic_session_id,
      academic_year_start: input.academic_year_start ?? currentAcademicYearStart(),
      class_year_level: input.class_year_level,
      section_id: input.section_id ?? null,
      subject_id: input.subject_id ?? null,
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
  if (input.subject_id !== undefined) patch.subject_id = input.subject_id;
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
  const { data, error } = await supabase.rpc("publish_internal_test", {
    p_test_id: testId,
  });
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
      internal_test_series!inner(name),
      internal_test_section_meta(teacher_name_snapshot)
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
    const sectionMeta = row.internal_test_section_meta as
      | { teacher_name_snapshot?: string }[]
      | null;
    return {
      testId: row.id,
      seriesName: series?.name ?? row.test_name,
      subjectName: row.subject_name,
      testDate: row.test_date,
      maxMarks: Number(row.max_marks),
      teacherName: sectionMeta?.[0]?.teacher_name_snapshot ?? row.teacher_name ?? null,
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
  notIncluded: number;
};

type SeriesActivityMeta = Pick<
  InternalTestSectionMeta,
  "internal_test_id" | "paper_received" | "marks_completed"
>;

export function testHasSeriesActivity(
  test: InternalTest,
  meta: SeriesActivityMeta[] = [],
  testsWithMarks?: Set<string>,
): boolean {
  if (test.status === "published") return true;
  if (testsWithMarks?.has(test.id)) return true;
  if (test.paper_received) return true;
  return meta.some(
    (row) =>
      row.internal_test_id === test.id && (row.paper_received || row.marks_completed),
  );
}

export function summarizeSeriesProgress(
  tests: InternalTest[],
  meta: SeriesActivityMeta[] = [],
  testsWithMarks?: Set<string>,
): SeriesProgress {
  const uniqueSubjects = new Set(tests.map((t) => t.subject_name.trim().toLowerCase()));
  const published = tests.filter((t) => t.status === "published").length;
  const draft = tests.filter((t) => t.status === "draft");
  const activeDraft = draft.filter((t) => testHasSeriesActivity(t, meta, testsWithMarks));
  const notIncluded = draft.length - activeDraft.length;
  return {
    totalSubjects: uniqueSubjects.size || tests.length,
    papersPending: activeDraft.filter((t) => {
      const rows = meta.filter((row) => row.internal_test_id === t.id);
      return rows.length ? rows.some((row) => !row.paper_received) : !t.paper_received;
    }).length,
    marksPending: activeDraft.length,
    published,
    notIncluded,
  };
}

export function seriesCompletionPercent(progress: SeriesProgress): number {
  const inPlay = progress.totalSubjects - progress.notIncluded;
  return inPlay > 0 ? Math.round((progress.published / inPlay) * 100) : 0;
}

type CatalogSubjectRow = { id: string; name: string; is_active: boolean };

function catalogSubjectFromJoin(
  value: CatalogSubjectRow | CatalogSubjectRow[] | null,
): CatalogSubjectRow | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function announceSeriesAssignedSubjects(
  seriesId: string,
  createdBy?: string | null,
): Promise<{ created: number; subjects: number }> {
  const series = await fetchInternalTestSeriesById(seriesId);
  if (!series) throw new Error("Test series not found.");

  const sections = await fetchSeriesSections(seriesId);
  if (!sections.length) return { created: 0, subjects: 0 };

  const { data: assignments, error: assignErr } = await supabase
    .from("intermediate_section_subjects")
    .select("section_id, subject_id, teacher_user_id, intermediate_subjects(id, name, is_active)")
    .in(
      "section_id",
      sections.map((section) => section.id),
    );
  if (assignErr) throwErr(assignErr);

  const subjectById = new Map<string, { id: string; name: string }>();
  for (const row of assignments ?? []) {
    const subject = catalogSubjectFromJoin(
      row.intermediate_subjects as CatalogSubjectRow | CatalogSubjectRow[] | null,
    );
    if (!subject || subject.is_active === false) continue;
    if (!subjectById.has(subject.id)) {
      subjectById.set(subject.id, { id: subject.id, name: subject.name });
    }
  }

  const existing = await fetchTestsForSeries(seriesId);
  const existingSubjectIds = new Set(
    existing.map((test) => test.subject_id).filter((id): id is string => Boolean(id)),
  );

  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  for (const subject of subjectById.values()) {
    if (existingSubjectIds.has(subject.id)) continue;
    await createSeriesSubjectTest(
      {
        series_id: seriesId,
        subject_id: subject.id,
        test_date: today,
        max_marks: 50,
      },
      createdBy,
    );
    created += 1;
  }

  await syncMissingSeriesSectionMeta(seriesId);
  return { created, subjects: subjectById.size };
}

async function syncMissingSeriesSectionMeta(seriesId: string): Promise<void> {
  const [tests, sections] = await Promise.all([
    fetchTestsForSeries(seriesId),
    fetchSeriesSections(seriesId),
  ]);
  const subjectTests = tests.filter((test) => test.subject_id && !test.section_id);
  if (!subjectTests.length || !sections.length) return;

  const { data: assignments, error: assignErr } = await supabase
    .from("intermediate_section_subjects")
    .select("section_id, subject_id, teacher_user_id")
    .in(
      "section_id",
      sections.map((section) => section.id),
    )
    .in(
      "subject_id",
      subjectTests.map((test) => test.subject_id as string),
    );
  if (assignErr) throwErr(assignErr);

  const existingMeta = await fetchSeriesTestSectionMeta(seriesId);
  const have = new Set(
    existingMeta.map((row) => `${row.internal_test_id}:${row.section_id}`),
  );

  const teacherIds = [
    ...new Set(
      (assignments ?? [])
        .map((row) => row.teacher_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const nameById = new Map<string, string>();
  if (teacherIds.length) {
    const { data: profiles, error: profileErr } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", teacherIds);
    if (profileErr) throwErr(profileErr);
    for (const profile of profiles ?? []) {
      nameById.set(profile.id, profile.full_name?.trim() || "Teacher");
    }
  }

  const rows = [];
  for (const test of subjectTests) {
    for (const assignment of assignments ?? []) {
      if (assignment.subject_id !== test.subject_id) continue;
      const key = `${test.id}:${assignment.section_id}`;
      if (have.has(key)) continue;
      rows.push({
        internal_test_id: test.id,
        section_id: assignment.section_id,
        subject_id: test.subject_id as string,
        teacher_user_id: assignment.teacher_user_id,
        teacher_name_snapshot: nameById.get(assignment.teacher_user_id) ?? "Teacher",
      });
    }
  }

  if (!rows.length) return;
  const { error } = await supabase.from("internal_test_section_meta").upsert(rows, {
    onConflict: "internal_test_id,section_id",
    ignoreDuplicates: true,
  });
  if (error) throwErr(error);
}
