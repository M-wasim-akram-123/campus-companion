import { supabase } from "@/integrations/supabase/client";

type AcademicLedgerRow = {
  id: string;
  student_id: string;
  event_type: string;
  internal_test_id: string | null;
  series_id: string | null;
  subject_id: string | null;
  section_id: string | null;
  teacher_user_id: string | null;
  academic_session_id: string | null;
  academic_year_start: number | null;
  class_year_level: number | null;
  subject_name: string;
  test_name: string;
  marks_obtained: number | null;
  max_marks: number | null;
  passing_marks: number | null;
  is_absent: boolean;
  metadata: unknown;
  recorded_at: string;
  students?: { full_name?: string; roll_number?: string } | null;
  sections?: { name?: string; gender?: string } | null;
};

export type AcademicPerformanceRow = {
  key: string;
  label: string;
  detail: string;
  assessments: number;
  records: number;
  absent: number;
  averagePercent: number;
  passPercent: number;
};

export type IntermediateReportData = {
  assessmentCount: number;
  studentCount: number;
  overallAverage: number;
  absenceRate: number;
  teacherSubject: AcademicPerformanceRow[];
  sections: AcademicPerformanceRow[];
  students: AcademicPerformanceRow[];
};

export type StudentAcademicLedgerEntry = {
  id: string;
  eventType: string;
  subjectName: string;
  testName: string;
  marksObtained: number | null;
  maxMarks: number | null;
  isAbsent: boolean;
  teacherName: string | null;
  recordedAt: string;
};

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

function metadataTeacher(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).teacher_name;
  return typeof value === "string" && value.trim() ? value : null;
}

function currentResults(rows: AcademicLedgerRow[]): AcademicLedgerRow[] {
  const current = new Map<string, AcademicLedgerRow>();
  for (const row of [...rows].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))) {
    if (!row.internal_test_id) continue;
    current.set(`${row.student_id}:${row.internal_test_id}`, row);
  }
  return [...current.values()];
}

function aggregate(
  rows: AcademicLedgerRow[],
  keyFor: (row: AcademicLedgerRow) => string,
  labelsFor: (row: AcademicLedgerRow) => { label: string; detail: string },
): AcademicPerformanceRow[] {
  const groups = new Map<
    string,
    {
      label: string;
      detail: string;
      tests: Set<string>;
      records: number;
      absent: number;
      percentTotal: number;
      percentCount: number;
      passed: number;
      passCount: number;
    }
  >();

  for (const row of rows) {
    const key = keyFor(row);
    const labels = labelsFor(row);
    if (!groups.has(key)) {
      groups.set(key, {
        ...labels,
        tests: new Set(),
        records: 0,
        absent: 0,
        percentTotal: 0,
        percentCount: 0,
        passed: 0,
        passCount: 0,
      });
    }
    const group = groups.get(key)!;
    if (row.internal_test_id) group.tests.add(row.internal_test_id);
    group.records += 1;
    if (row.is_absent) {
      group.absent += 1;
      continue;
    }
    if (row.marks_obtained == null || !row.max_marks) continue;

    const percent = (Number(row.marks_obtained) / Number(row.max_marks)) * 100;
    group.percentTotal += percent;
    group.percentCount += 1;
    const passing =
      row.passing_marks != null
        ? Number(row.marks_obtained) >= Number(row.passing_marks)
        : percent >= 40;
    group.passCount += 1;
    if (passing) group.passed += 1;
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      detail: group.detail,
      assessments: group.tests.size,
      records: group.records,
      absent: group.absent,
      averagePercent: group.percentCount
        ? Math.round((group.percentTotal / group.percentCount) * 10) / 10
        : 0,
      passPercent: group.passCount
        ? Math.round((group.passed / group.passCount) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => b.averagePercent - a.averagePercent || a.label.localeCompare(b.label));
}

export async function fetchIntermediateReport(input: {
  sessionId: string;
  classYearLevel?: number;
  seriesId?: string;
}): Promise<IntermediateReportData> {
  let query = supabase
    .from("student_academic_ledger")
    .select(
      "*, students(full_name, roll_number), sections(name, gender)",
    )
    .eq("academic_session_id", input.sessionId)
    .in("event_type", ["test_published", "mark_corrected"])
    .order("recorded_at");
  if (input.classYearLevel != null) {
    query = query.eq("class_year_level", input.classYearLevel);
  }
  if (input.seriesId) query = query.eq("series_id", input.seriesId);

  const { data, error } = await query;
  if (error) fail(error, "Could not load Intermediate academic report");
  const rows = currentResults((data ?? []) as AcademicLedgerRow[]);

  const teacherIds = [
    ...new Set(rows.map((row) => row.teacher_user_id).filter((id): id is string => Boolean(id))),
  ];
  const teacherResult =
    teacherIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", teacherIds)
      : { data: [] as { id: string; full_name: string | null }[], error: null };
  if (teacherResult.error) fail(teacherResult.error, "Could not load teacher names");
  const teacherMap = new Map(
    (teacherResult.data ?? []).map((teacher) => [
      teacher.id,
      teacher.full_name || "Teacher account",
    ]),
  );

  const present = rows.filter(
    (row) => !row.is_absent && row.marks_obtained != null && Number(row.max_marks) > 0,
  );
  const overallAverage = present.length
    ? present.reduce(
        (sum, row) => sum + (Number(row.marks_obtained) / Number(row.max_marks)) * 100,
        0,
      ) / present.length
    : 0;

  return {
    assessmentCount: new Set(rows.map((row) => row.internal_test_id).filter(Boolean)).size,
    studentCount: new Set(rows.map((row) => row.student_id)).size,
    overallAverage: Math.round(overallAverage * 10) / 10,
    absenceRate: rows.length
      ? Math.round((rows.filter((row) => row.is_absent).length / rows.length) * 1000) / 10
      : 0,
    teacherSubject: aggregate(
      rows,
      (row) => `${row.teacher_user_id ?? "legacy"}:${row.subject_id ?? row.subject_name}:${row.section_id}`,
      (row) => ({
        label:
          (row.teacher_user_id ? teacherMap.get(row.teacher_user_id) : null) ||
          metadataTeacher(row.metadata) ||
          "Legacy / unassigned",
        detail: `${row.subject_name} · ${
          row.sections?.gender === "girls" ? "Girls" : "Boys"
        } — ${row.sections?.name ?? "Section"}`,
      }),
    ),
    sections: aggregate(
      rows,
      (row) => row.section_id ?? "unassigned",
      (row) => ({
        label: `${row.sections?.gender === "girls" ? "Girls" : "Boys"} — ${
          row.sections?.name ?? "Unassigned"
        }`,
        detail: `Year ${row.class_year_level ?? "—"} · all published subjects`,
      }),
    ),
    students: aggregate(
      rows,
      (row) => row.student_id,
      (row) => ({
        label: row.students?.full_name ?? "Student",
        detail: `${row.students?.roll_number ?? "No roll number"} · ${
          row.sections?.name ?? "Section"
        }`,
      }),
    ),
  };
}

export async function fetchStudentAcademicLedger(
  studentId: string,
): Promise<StudentAcademicLedgerEntry[]> {
  const { data, error } = await supabase
    .from("student_academic_ledger")
    .select(
      "id, event_type, subject_name, test_name, marks_obtained, max_marks, is_absent, metadata, recorded_at",
    )
    .eq("student_id", studentId)
    .order("recorded_at", { ascending: false });
  if (error) fail(error, "Could not load academic record");
  return (data ?? []).map((row) => ({
    id: row.id,
    eventType: row.event_type,
    subjectName: row.subject_name,
    testName: row.test_name,
    marksObtained: row.marks_obtained != null ? Number(row.marks_obtained) : null,
    maxMarks: row.max_marks != null ? Number(row.max_marks) : null,
    isAbsent: row.is_absent,
    teacherName: metadataTeacher(row.metadata),
    recordedAt: row.recorded_at,
  }));
}
