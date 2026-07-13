import { supabase } from "@/integrations/supabase/client";
import type { InternalTest } from "@/lib/internal-exams";
import { summarizeSeriesProgress } from "@/lib/internal-exams";

export type ExamDashboardAction = {
  testId: string;
  seriesName: string;
  subjectName: string;
  testDate: string;
  reason: "paper_pending" | "marks_pending" | "test_today";
  teacherName: string | null;
};

export type ExamPipelineSlice = {
  name: string;
  value: number;
  color: string;
};

export type ExamSeriesProgressRow = {
  seriesId: string;
  seriesName: string;
  classYearLevel: number;
  total: number;
  published: number;
  papersPending: number;
  awaitingMarks: number;
  completionPercent: number;
};

export type ExamDashboardData = {
  seriesCount: number;
  progress: ReturnType<typeof summarizeSeriesProgress>;
  completionPercent: number;
  testsThisWeek: number;
  testsToday: number;
  upcomingTests: InternalTest[];
  actionItems: ExamDashboardAction[];
  scheduleTimeline: { date: string; label: string; shortLabel: string; count: number }[];
  pipelineData: ExamPipelineSlice[];
  seriesProgress: ExamSeriesProgressRow[];
  recentPublished: InternalTest[];
  announcementCount: number;
};

function throwErr(error: { message?: string }) {
  throw new Error(error.message ?? "Request failed");
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function shortDayLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export async function fetchExamDashboardData(
  sessionId: string,
  classYearLevel?: number,
): Promise<ExamDashboardData> {
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = addDaysIso(today, 7);
  const horizonDays = 21;

  let seriesListQuery = supabase
    .from("internal_test_series")
    .select("id, name, class_year_level")
    .eq("academic_session_id", sessionId)
    .order("created_at", { ascending: false });
  if (classYearLevel != null) seriesListQuery = seriesListQuery.eq("class_year_level", classYearLevel);

  let testsQuery = supabase
    .from("internal_tests")
    .select("*, internal_test_series(name)")
    .eq("academic_session_id", sessionId)
    .not("series_id", "is", null)
    .order("test_date", { ascending: true });
  if (classYearLevel != null) testsQuery = testsQuery.eq("class_year_level", classYearLevel);

  const announcementsQuery = supabase
    .from("announcements")
    .select("id", { count: "exact", head: true })
    .eq("academic_session_id", sessionId)
    .eq("status", "published");

  const [{ data: seriesRows, error: seriesErr }, { data: tests, error: testsErr }, { count: announcementCount, error: annErr }] =
    await Promise.all([seriesListQuery, testsQuery, announcementsQuery]);
  if (seriesErr) throwErr(seriesErr);
  if (testsErr) throwErr(testsErr);
  if (annErr) throwErr(annErr);

  const allTests = (tests ?? []) as InternalTest[];
  const progress = summarizeSeriesProgress(allTests);
  const draftTests = allTests.filter((t) => t.status === "draft");
  const publishedCount = progress.published;
  const papersPending = draftTests.filter((t) => !t.paper_received).length;
  const awaitingMarks = draftTests.filter((t) => t.paper_received).length;

  const completionPercent =
    allTests.length > 0 ? Math.round((publishedCount / allTests.length) * 100) : 0;

  const pipelineSlices: ExamPipelineSlice[] = [
    { name: "Published", value: publishedCount, color: "#22c55e" },
    { name: "Awaiting marks", value: awaitingMarks, color: "#2563eb" },
    { name: "Papers pending", value: papersPending, color: "#f59e0b" },
  ].filter((row) => row.value > 0);

  const pipelineData =
    pipelineSlices.length > 0
      ? pipelineSlices
      : [{ name: "Not started", value: 1, color: "#cbd5e1" }];

  const testsToday = draftTests.filter((t) => t.test_date === today).length;
  const testsThisWeek = draftTests.filter((t) => t.test_date >= today && t.test_date <= weekEnd).length;

  const upcomingTests = draftTests.filter((t) => {
    const horizonEnd = addDaysIso(today, horizonDays - 1);
    return t.test_date >= today && t.test_date <= horizonEnd;
  });

  const dateCounts = new Map<string, number>();
  for (const test of upcomingTests) {
    dateCounts.set(test.test_date, (dateCounts.get(test.test_date) ?? 0) + 1);
  }

  const scheduleTimeline = Array.from({ length: horizonDays }, (_, index) => {
    const date = addDaysIso(today, index);
    return {
      date,
      label: formatShortDate(date),
      shortLabel: shortDayLabel(date, today),
      count: dateCounts.get(date) ?? 0,
    };
  });

  const testsBySeries = new Map<string, InternalTest[]>();
  for (const test of allTests) {
    if (!test.series_id) continue;
    const list = testsBySeries.get(test.series_id) ?? [];
    list.push(test);
    testsBySeries.set(test.series_id, list);
  }

  const seriesProgress: ExamSeriesProgressRow[] = (seriesRows ?? []).map((series) => {
    const seriesTests = testsBySeries.get(series.id) ?? [];
    const sp = summarizeSeriesProgress(seriesTests);
    const awaiting = seriesTests.filter((t) => t.status === "draft" && t.paper_received).length;
    const total = seriesTests.length;
    return {
      seriesId: series.id,
      seriesName: series.name,
      classYearLevel: series.class_year_level,
      total,
      published: sp.published,
      papersPending: sp.papersPending,
      awaitingMarks: awaiting,
      completionPercent: total > 0 ? Math.round((sp.published / total) * 100) : 0,
    };
  });

  const seriesName = (t: InternalTest) => t.internal_test_series?.name ?? t.test_name;

  const actionItems: ExamDashboardAction[] = [];
  for (const test of draftTests) {
    const base = {
      testId: test.id,
      seriesName: seriesName(test),
      subjectName: test.subject_name,
      testDate: test.test_date,
      teacherName: test.teacher_name,
    };
    if (test.test_date === today) {
      actionItems.push({ ...base, reason: "test_today" });
    } else if (!test.paper_received) {
      actionItems.push({ ...base, reason: "paper_pending" });
    } else {
      actionItems.push({ ...base, reason: "marks_pending" });
    }
  }

  actionItems.sort((a, b) => {
    const priority = { test_today: 0, paper_pending: 1, marks_pending: 2 };
    const pd = priority[a.reason] - priority[b.reason];
    if (pd !== 0) return pd;
    return a.testDate.localeCompare(b.testDate);
  });

  const recentPublished = allTests
    .filter((t) => t.status === "published")
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, 6);

  return {
    seriesCount: seriesRows?.length ?? 0,
    progress,
    completionPercent,
    testsThisWeek,
    testsToday,
    upcomingTests,
    actionItems: actionItems.slice(0, 12),
    scheduleTimeline,
    pipelineData,
    seriesProgress,
    recentPublished,
    announcementCount: announcementCount ?? 0,
  };
}
