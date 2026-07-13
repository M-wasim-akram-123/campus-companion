import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { canManageAnnouncements } from "@/lib/announcement-permissions";
import {
  academicYearLabel,
  fetchInternalTestSeries,
  fetchTestsForSeries,
  seriesName,
  summarizeSeriesProgress,
} from "@/lib/internal-exams";
import { ordinalYearLabel } from "@/lib/academic";
import { fetchExamDashboardData } from "@/lib/exam-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  GraduationCap,
  Megaphone,
  Plus,
  Sparkles,
  TrendingUp,
  Upload,
} from "lucide-react";

const CHART = {
  primary: "#2563eb",
  cyan: "#06b6d4",
  grid: "#dbeafe",
  axis: "#64748b",
  tooltipBg: "rgba(255,255,255,0.96)",
  tooltipBorder: "#bfdbfe",
};

const tooltipStyle = {
  backgroundColor: CHART.tooltipBg,
  border: `1px solid ${CHART.tooltipBorder}`,
  borderRadius: 14,
  boxShadow: "0 16px 40px rgba(37, 99, 235, 0.14)",
};

function actionLabel(reason: "paper_pending" | "marks_pending" | "test_today") {
  if (reason === "test_today") return "Test today";
  if (reason === "paper_pending") return "Paper pending";
  return "Upload marks";
}

function actionVariant(reason: "paper_pending" | "marks_pending" | "test_today") {
  if (reason === "test_today") return "destructive" as const;
  if (reason === "paper_pending") return "secondary" as const;
  return "outline" as const;
}

export function ExamDashboard() {
  const { roles } = useAuth();
  const canAnnounce = canManageAnnouncements(roles);
  const [sessionId, setSessionId] = useState("");
  const [classYearLevel, setClassYearLevel] = useState("__all__");

  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () =>
      (await supabase.from("academic_sessions").select("*").order("start_year", { ascending: false })).data ?? [],
  });

  const active = sessions?.find((s) => s.is_active);
  const sid = sessionId || active?.id || sessions?.[0]?.id || "";
  const yearFilter = classYearLevel === "__all__" ? undefined : Number(classYearLevel);
  const activeSessionLabel = sessions?.find((s) => s.id === sid)?.label;

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ["exam-dashboard", sid, classYearLevel],
    enabled: !!sid,
    queryFn: () => fetchExamDashboardData(sid, yearFilter),
  });

  const { data: seriesList = [], isLoading: seriesLoading } = useQuery({
    queryKey: ["internal-test-series-list", sid, classYearLevel],
    enabled: !!sid,
    queryFn: () =>
      fetchInternalTestSeries({
        sessionId: sid,
        classYearLevel: yearFilter,
      }),
  });

  const kpiCards = useMemo(
    () =>
      dashboard
        ? [
            {
              label: "Test series",
              value: dashboard.seriesCount,
              hint: `${dashboard.progress.totalSubjects} subjects`,
              icon: ClipboardList,
              color: "from-blue-500 to-cyan-400",
            },
            {
              label: "Papers pending",
              value: dashboard.progress.papersPending,
              hint: "Teacher papers due",
              icon: FileWarning,
              color: "from-amber-500 to-orange-400",
            },
            {
              label: "Awaiting marks",
              value: dashboard.progress.marksPending,
              hint: `${dashboard.testsToday} test${dashboard.testsToday === 1 ? "" : "s"} today`,
              icon: Upload,
              color: "from-violet-500 to-fuchsia-400",
            },
            {
              label: "Published",
              value: dashboard.progress.published,
              hint: `${dashboard.completionPercent}% complete`,
              icon: CheckCircle2,
              color: "from-emerald-500 to-teal-400",
            },
          ]
        : [],
    [dashboard],
  );

  const seriesChartData = useMemo(
    () =>
      (dashboard?.seriesProgress ?? []).map((row) => ({
        name: row.seriesName,
        published: row.published,
        pending: Math.max(row.total - row.published, 0),
      })),
    [dashboard?.seriesProgress],
  );

  return (
    <div className="space-y-6">
      <div className="glass-panel relative overflow-hidden rounded-3xl p-6">
        <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute bottom-0 right-32 h-36 w-36 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              <Sparkles className="h-4 w-4" />
              {activeSessionLabel ? `Session: ${activeSessionLabel}` : "Exam branch"}
            </div>
            <h1 className="bg-gradient-to-r from-foreground via-primary to-emerald-500 bg-clip-text text-4xl font-black tracking-tight text-transparent md:text-5xl">
              Exam Command Center
            </h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Schedule test series, track papers, upload marks by section, and publish results to the student app.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
            <Button asChild size="lg">
              <Link to="/exams/series/new">
                <Plus className="mr-2 h-4 w-4" />
                Announce series
              </Link>
            </Button>
            {canAnnounce && (
              <Button asChild size="lg" variant="outline">
                <Link to="/announcements/new">
                  <Megaphone className="mr-2 h-4 w-4" />
                  New announcement
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={sid} onValueChange={setSessionId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Session" />
          </SelectTrigger>
          <SelectContent>
            {(sessions ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
                {s.is_active ? " (active)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={classYearLevel} onValueChange={setClassYearLevel}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Class year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All years</SelectItem>
            <SelectItem value="1">1st Year</SelectItem>
            <SelectItem value="2">2nd Year</SelectItem>
            <SelectItem value="3">3rd Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {dashLoading ? (
        <DashboardSkeleton />
      ) : dashboard ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpiCards.map((card) => (
              <Card key={card.label} className="group overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                  <div
                    className={`rounded-2xl bg-gradient-to-br ${card.color} p-2 text-white shadow-lg transition-transform group-hover:scale-110`}
                  >
                    <card.icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-black">{card.value}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Upcoming test calendar
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">Draft subjects scheduled over the next 3 weeks</p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {dashboard.testsThisWeek} this week
                </Badge>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dashboard.scheduleTimeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="examScheduleFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.75} />
                        <stop offset="100%" stopColor={CHART.cyan} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fontSize: 11, fill: CHART.axis }}
                      axisLine={false}
                      tickLine={false}
                      interval={2}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: CHART.axis }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip
                      formatter={(value: number) => [`${value} subject(s)`, "Scheduled"]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
                      contentStyle={tooltipStyle}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke={CHART.primary}
                      strokeWidth={2.5}
                      fill="url(#examScheduleFill)"
                      dot={{ r: 3, fill: CHART.primary, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: CHART.cyan }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  Results pipeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="relative mx-auto h-44 w-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dashboard.pipelineData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={78}
                        paddingAngle={dashboard.pipelineData.length > 1 ? 4 : 0}
                        strokeWidth={0}
                      >
                        {dashboard.pipelineData.map((row) => (
                          <Cell key={row.name} fill={row.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black">{dashboard.completionPercent}%</span>
                    <span className="text-xs text-muted-foreground">published</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {dashboard.pipelineData.map((row) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between rounded-2xl bg-white/60 px-3 py-2 text-sm dark:bg-white/5"
                    >
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                        {row.name}
                      </span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span>Session completion</span>
                    <strong>{dashboard.completionPercent}%</strong>
                  </div>
                  <Progress value={dashboard.completionPercent} />
                </div>
              </CardContent>
            </Card>
          </div>

          {seriesChartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Progress by test series
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={seriesChartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={88}
                      tick={{ fontSize: 11, fill: CHART.axis }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="published" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} name="Published" />
                    <Bar dataKey="pending" stackId="a" fill="#f59e0b" radius={[0, 6, 6, 0]} name="Pending" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {canAnnounce && (
            <Card className="overflow-hidden border-dashed">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-primary/5 to-cyan-500/5 py-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-400 p-3 text-white shadow-lg">
                    <Megaphone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">Student announcements</p>
                    <p className="text-sm text-muted-foreground">
                      {dashboard.announcementCount} published this session — voice, video, or text
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline">
                  <Link to="/announcements">Manage announcements</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  Needs attention
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!dashboard.actionItems.length ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 py-10 text-center">
                    <CheckCircle2 className="mb-2 h-10 w-10 text-emerald-500" />
                    <p className="font-medium">All caught up</p>
                    <p className="text-sm text-muted-foreground">No pending papers or marks right now</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashboard.actionItems.map((item) => (
                      <div
                        key={`${item.testId}-${item.reason}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-white/50 p-3 dark:bg-white/5"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {item.seriesName} · {item.subjectName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.testDate}
                            {item.teacherName ? ` · ${item.teacherName}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={actionVariant(item.reason)}>{actionLabel(item.reason)}</Badge>
                          <Button asChild size="sm" variant="outline">
                            <Link to="/exams/tests/$id" params={{ id: item.testId }}>
                              Open
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Recently published
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!dashboard.recentPublished.length ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20 py-10 text-center">
                    <Upload className="mb-2 h-10 w-10 text-muted-foreground" />
                    <p className="font-medium">No results yet</p>
                    <p className="text-sm text-muted-foreground">Published subjects appear here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dashboard.recentPublished.map((test) => (
                      <div
                        key={test.id}
                        className="flex items-center justify-between rounded-2xl border bg-white/50 px-3 py-2.5 dark:bg-white/5"
                      >
                        <div>
                          <p className="font-medium">{seriesName(test)}</p>
                          <p className="text-xs text-muted-foreground">{test.subject_name}</p>
                        </div>
                        <Badge variant="secondary">
                          {test.published_at ? new Date(test.published_at).toLocaleDateString() : "—"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {dashboard.seriesProgress.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dashboard.seriesProgress.map((row) => (
                <Card key={row.seriesId} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{row.seriesName}</CardTitle>
                        <p className="text-xs text-muted-foreground">{ordinalYearLabel(row.classYearLevel)}</p>
                      </div>
                      <span className="text-2xl font-black text-primary">{row.completionPercent}%</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Progress value={row.completionPercent} />
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <MiniStat label="Subjects" value={String(row.total)} />
                      <MiniStat label="Published" value={String(row.published)} tone="success" />
                      <MiniStat label="Pending" value={String(row.total - row.published)} tone="warning" />
                    </div>
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <Link to="/exams/series/$id" params={{ id: row.seriesId }}>
                        Open series
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>All test series</CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link to="/exams/series/new">
              <Plus className="mr-2 h-4 w-4" />
              New series
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {seriesLoading ? (
            <p className="text-sm text-muted-foreground">Loading series…</p>
          ) : !seriesList.length ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-12 text-center">
              <GraduationCap className="mb-3 h-12 w-12 text-muted-foreground" />
              <p className="font-medium">No test series yet</p>
              <p className="mb-4 text-sm text-muted-foreground">Announce Test 1 to get started</p>
              <Button asChild>
                <Link to="/exams/series/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Announce series
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Series</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {seriesList.map((series) => (
                  <SeriesRow key={series.id} seriesId={series.id} series={series} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  const valueClass =
    tone === "success" ? "text-emerald-600" : tone === "warning" ? "text-amber-600" : "text-foreground";
  return (
    <div className="rounded-xl border bg-muted/30 p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className={`font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-6">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-8 w-16 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardContent className="h-80 animate-pulse bg-muted/30 p-6" />
        </Card>
        <Card>
          <CardContent className="h-80 animate-pulse bg-muted/30 p-6" />
        </Card>
      </div>
    </div>
  );
}

function SeriesRow({
  seriesId,
  series,
}: {
  seriesId: string;
  series: Awaited<ReturnType<typeof fetchInternalTestSeries>>[number];
}) {
  const { data: tests = [] } = useQuery({
    queryKey: ["internal-test-series-subjects", seriesId],
    queryFn: () => fetchTestsForSeries(seriesId),
  });
  const progress = summarizeSeriesProgress(tests);
  const pct = tests.length > 0 ? Math.round((progress.published / tests.length) * 100) : 0;

  return (
    <TableRow>
      <TableCell className="font-medium">{series.name}</TableCell>
      <TableCell>{academicYearLabel(series.academic_year_start)}</TableCell>
      <TableCell>{ordinalYearLabel(series.class_year_level)}</TableCell>
      <TableCell>{progress.totalSubjects}</TableCell>
      <TableCell>
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{pct}% published</span>
            {progress.papersPending > 0 && (
              <span className="text-amber-600">{progress.papersPending} papers</span>
            )}
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Button asChild size="sm" variant="outline">
          <Link to="/exams/series/$id" params={{ id: seriesId }}>
            Open
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
