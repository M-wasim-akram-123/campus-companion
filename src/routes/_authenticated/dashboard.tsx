import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ClipboardList,
  Layers,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";
import { defaultHomePathForRoles } from "@/lib/auth-routing";
import { CAMPUS_NAME } from "@/lib/campus";
import { fetchFinanceStats, formatCurrency } from "@/lib/finance";
import { fetchProfileNames } from "@/lib/staff";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

const CHART_COLORS = ["#2563eb", "#06b6d4", "#f59e0b", "#22c55e", "#a855f7", "#ef4444"];

function monthKey(date: string) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

function startOfMonthKey() {
  return monthKey(new Date().toISOString());
}

function recentMonthOptions(count = 24) {
  return Array.from({ length: count }, (_, index) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - index);
    const key = monthKey(d.toISOString());
    return {
      key,
      label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    };
  });
}

type OfficerInquiryPerformance = {
  officer: string;
  assigned: number;
  converted: number;
};

function Dashboard() {
  const navigate = useNavigate();
  const { user, roles, hasRole, hasAnyRole, loading } = useAuth();
  const [selectedPerformanceMonth, setSelectedPerformanceMonth] = useState(startOfMonthKey);
  const [performanceFrom, setPerformanceFrom] = useState("");
  const [performanceTo, setPerformanceTo] = useState("");
  const isSuperAdmin = hasRole("super_admin");
  const homePath = defaultHomePathForRoles(roles);

  useEffect(() => {
    if (!loading && !isSuperAdmin && homePath !== "/dashboard") {
      navigate({ to: homePath, replace: true });
    }
  }, [loading, isSuperAdmin, homePath, navigate]);

  const canViewFinance = hasAnyRole(["super_admin", "finance_admin", "finance_officer", "cashier"]);
  const canViewAdmissions = hasAnyRole(["super_admin", "admission_officer", "receptionist"]);
  const canViewStudents = hasAnyRole(["super_admin", "admission_officer", "hr", "teacher"]);
  const canSetupSystem = isSuperAdmin;

  const { data: overview, isLoading } = useQuery({
    queryKey: [
      "dashboard-overview",
      canViewFinance,
      canViewAdmissions,
      canViewStudents,
      selectedPerformanceMonth,
      performanceFrom,
      performanceTo,
    ],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const [sessionsRes, inquiriesRes, studentsRes, paymentsRes, installmentsRes, financeStats] = await Promise.all([
        supabase.from("academic_sessions").select("*").order("start_year", { ascending: false }),
        canViewAdmissions
          ? supabase
              .from("inquiries")
              .select("id, full_name, phone, status, follow_up_date, assigned_to, assigned_at, converted_at, converted_by, created_at, updated_at, programs(name)")
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        canViewStudents
          ? supabase
              .from("students")
              .select("id, full_name, roll_number, status, created_at, program_id, academic_session_id, programs(name), sections(name, gender), academic_sessions(label)")
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        canViewFinance
          ? supabase.from("fee_payments").select("amount, paid_at").order("paid_at", { ascending: false }).limit(500)
          : Promise.resolve({ data: [] }),
        canViewFinance
          ? supabase.from("student_fee_installments").select("amount, paid_amount, due_date, status")
          : Promise.resolve({ data: [] }),
        canViewFinance
          ? fetchFinanceStats().catch(() => ({ collectedToday: 0, outstanding: 0, overdueCount: 0, openVouchers: 0 }))
          : Promise.resolve({ collectedToday: 0, outstanding: 0, overdueCount: 0, openVouchers: 0 }),
      ]);

      const sessions = sessionsRes.data ?? [];
      const inquiries = inquiriesRes.data ?? [];
      const students = studentsRes.data ?? [];
      const payments = paymentsRes.data ?? [];
      const installments = installmentsRes.data ?? [];

      const activeSession = sessions.find((s) => s.is_active);
      const activeStudents = students.filter((s) => s.status === "active");
      const activeSessionStudents = activeSession
        ? students.filter((s) => s.academic_session_id === activeSession.id)
        : activeStudents;

      const statusCounts = inquiries.reduce<Record<string, number>>((acc, inquiry) => {
        acc[inquiry.status] = (acc[inquiry.status] ?? 0) + 1;
        return acc;
      }, {});

      const today = new Date().toISOString().slice(0, 10);
      const thisMonthKey = startOfMonthKey();

      let officerPerformanceToday: OfficerInquiryPerformance[] = [];
      let officerPerformanceMonth: OfficerInquiryPerformance[] = [];
      if (canSetupSystem) {
        const assignedUserIds = [...new Set(inquiries.map((i) => i.assigned_to).filter(Boolean) as string[])];
        const { data: officerRoles } = assignedUserIds.length
          ? await supabase
              .from("user_roles")
              .select("user_id")
              .eq("role", "admission_officer")
              .in("user_id", assignedUserIds)
          : { data: [] };
        const officerIdSet = new Set((officerRoles ?? []).map((row) => row.user_id));
        const officerIds = assignedUserIds.filter((id) => officerIdSet.has(id));
        const officerNames = await fetchProfileNames(officerIds);

        const inSelectedPeriod = (date: string | null | undefined) => {
          if (!date) return false;
          const day = date.slice(0, 10);
          if (performanceFrom && performanceTo) return day >= performanceFrom && day <= performanceTo;
          return monthKey(date) === selectedPerformanceMonth;
        };

        const buildPerformance = (scope: "today" | "period") => {
          const rows = new Map<string, OfficerInquiryPerformance>();
          for (const inquiry of inquiries) {
            if (!inquiry.assigned_to) continue;
            if (!officerIdSet.has(inquiry.assigned_to)) continue;
            const row = rows.get(inquiry.assigned_to) ?? {
              officer: officerNames.get(inquiry.assigned_to) ?? "Unknown",
              assigned: 0,
              converted: 0,
            };

            const assignedAt = inquiry.assigned_at ?? inquiry.created_at;
            const convertedAt = inquiry.converted_at ?? (inquiry.status === "converted" ? inquiry.updated_at : null);
            const assignedInScope =
              scope === "today" ? assignedAt?.slice(0, 10) === today : inSelectedPeriod(assignedAt);
            const convertedInScope =
              !!convertedAt && (scope === "today" ? convertedAt.slice(0, 10) === today : inSelectedPeriod(convertedAt));

            if (assignedInScope) row.assigned += 1;
            if (convertedInScope) row.converted += 1;
            rows.set(inquiry.assigned_to, row);
          }
          return [...rows.values()]
            .filter((row) => row.assigned > 0 || row.converted > 0)
            .sort((a, b) => b.assigned + b.converted - (a.assigned + a.converted));
        };

        officerPerformanceToday = buildPerformance("today");
        officerPerformanceMonth = buildPerformance("period");
      }

      const programCounts = new Map<string, number>();
      for (const student of students) {
        const program = (student.programs as { name?: string } | null)?.name ?? "Unassigned";
        programCounts.set(program, (programCounts.get(program) ?? 0) + 1);
      }
      const programData = [...programCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, value]) => ({ name, value }));

      const pipelineData = ["new", "follow_up", "interested", "ready_for_admission", "converted", "lost"].map((status) => ({
        name: statusLabel(status),
        value: statusCounts[status] ?? 0,
      }));

      const monthlyMap = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        monthlyMap.set(monthKey(d.toISOString()), 0);
      }
      for (const payment of payments) {
        const key = monthKey(payment.paid_at);
        if (monthlyMap.has(key)) monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + Number(payment.amount ?? 0));
      }
      const monthlyCollection = [...monthlyMap.entries()].map(([key, amount]) => ({
        month: monthLabel(key),
        amount,
      }));

      const collectedThisMonth = payments
        .filter((p) => monthKey(p.paid_at) === thisMonthKey)
        .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

      const billed = installments.reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
      const paid = installments.reduce((sum, i) => sum + Number(i.paid_amount ?? 0), 0);
      const collectionPercent = billed > 0 ? Math.round((paid / billed) * 100) : 0;

      const conversionRate =
        inquiries.length > 0 ? Math.round(((statusCounts.converted ?? 0) / inquiries.length) * 100) : 0;

      return {
        activeSession,
        totalInquiries: inquiries.length,
        totalStudents: students.length,
        activeStudents: activeStudents.length,
        activeSessionStudents: activeSessionStudents.length,
        newInquiries: statusCounts.new ?? 0,
        followUps: statusCounts.follow_up ?? 0,
        interested: statusCounts.interested ?? 0,
        converted: statusCounts.converted ?? 0,
        conversionRate,
        pipelineData,
        programData,
        monthlyCollection,
        officerPerformanceToday,
        officerPerformanceMonth,
        collectedThisMonth,
        collectionPercent,
        financeStats,
      };
    },
  });

  const cards = [
    {
      label: "Total inquiries",
      value: overview?.totalInquiries ?? "—",
      icon: ClipboardList,
      hint: `${overview?.newInquiries ?? 0} new`,
      color: "from-blue-500 to-cyan-400",
      visible: canViewAdmissions,
    },
    {
      label: "Admitted students",
      value: overview?.totalStudents ?? "—",
      icon: Users,
      hint: `${overview?.activeStudents ?? 0} active`,
      color: "from-emerald-500 to-teal-400",
      visible: canViewStudents,
    },
    {
      label: "Conversion rate",
      value: overview ? `${overview.conversionRate}%` : "—",
      icon: UserCheck,
      hint: `${overview?.converted ?? 0} converted`,
      color: "from-violet-500 to-fuchsia-400",
      visible: canViewAdmissions,
    },
    {
      label: "This month collected",
      value: overview ? formatCurrency(overview.collectedThisMonth) : "—",
      icon: Wallet,
      hint: `${overview?.financeStats.overdueCount ?? 0} overdue`,
      color: "from-amber-500 to-orange-400",
      visible: canViewFinance,
    },
  ].filter((card) => card.visible);
  const performanceMonthOptions = useMemo(() => recentMonthOptions(), []);
  const selectedPerformanceMonthLabel =
    performanceMonthOptions.find((option) => option.key === selectedPerformanceMonth)?.label ?? monthLabel(selectedPerformanceMonth);
  const selectedPerformancePeriodLabel =
    performanceFrom && performanceTo ? `${performanceFrom} to ${performanceTo}` : selectedPerformanceMonthLabel;

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="p-8">
          <p className="font-semibold">Super Admin only</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The main dashboard is restricted to Super Admin. Use the sidebar links available for your role.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="glass-panel relative overflow-hidden rounded-3xl p-6">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute bottom-0 right-28 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              <Sparkles className="h-4 w-4" />
              {overview?.activeSession?.label ? `Active session: ${overview.activeSession.label}` : CAMPUS_NAME}
            </div>
            <h1 className="bg-gradient-to-r from-foreground via-primary to-cyan-500 bg-clip-text text-4xl font-black tracking-tight text-transparent md:text-5xl">
              Command Center
            </h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Welcome back, {user?.email}. Track the parts of the campus system available to your role.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Roles: {roles.join(", ") || "—"}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:w-[360px]">
            {hasAnyRole(["super_admin", "admission_officer"]) && (
              <Button asChild size="lg" variant="outline"><Link to="/admissions/new"><Users className="mr-2 h-4 w-4" />Admission</Link></Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="group overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <div className={`rounded-2xl bg-gradient-to-br ${c.color} p-2 text-white shadow-lg transition-transform group-hover:scale-110`}>
                <c.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black">{c.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-muted-foreground">Loading dashboard intelligence...</CardContent></Card>
      ) : (
        <>
          {canSetupSystem && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <UserCheck className="h-4 w-4 text-primary" />
                    Admission officer inquiry performance
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Month-wise assigned and converted inquiry activity.
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Select value={selectedPerformanceMonth} onValueChange={setSelectedPerformanceMonth}>
                    <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {performanceMonthOptions.map((option) => (
                        <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={performanceFrom}
                    onChange={(event) => setPerformanceFrom(event.target.value)}
                    className="w-[150px]"
                    aria-label="Performance from date"
                  />
                  <Input
                    type="date"
                    value={performanceTo}
                    onChange={(event) => setPerformanceTo(event.target.value)}
                    className="w-[150px]"
                    aria-label="Performance to date"
                  />
                  {(performanceFrom || performanceTo) && (
                    <Button type="button" variant="outline" size="sm" onClick={() => { setPerformanceFrom(""); setPerformanceTo(""); }}>
                      Clear dates
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 xl:grid-cols-2">
                  <OfficerPerformanceChart
                    title="Today"
                    data={overview?.officerPerformanceToday ?? []}
                  />
                  <OfficerPerformanceChart
                    title={selectedPerformancePeriodLabel}
                    data={overview?.officerPerformanceMonth ?? []}
                  />
                </div>
                <OfficerPerformanceTable
                  title={`${selectedPerformancePeriodLabel} summary`}
                  data={overview?.officerPerformanceMonth ?? []}
                />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            {canViewFinance && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Monthly fee collection
                </CardTitle>
                <Button asChild size="sm" variant="outline"><Link to="/finance">Finance</Link></Button>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={overview?.monthlyCollection ?? []}>
                    <defs>
                      <linearGradient id="dashboardCollection" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.75} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#dbeafe" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v: number) => formatCurrency(v)}
                      contentStyle={{
                        borderRadius: 16,
                        border: "1px solid #bfdbfe",
                        boxShadow: "0 16px 40px rgba(37, 99, 235, 0.14)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      name="Collected"
                      stroke="#2563eb"
                      strokeWidth={3}
                      fill="url(#dashboardCollection)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            )}

            {canViewAdmissions && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Inquiry pipeline
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-[180px_1fr] xl:grid-cols-1">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={overview?.pipelineData ?? []} dataKey="value" nameKey="name" innerRadius={48} outerRadius={76} paddingAngle={4}>
                        {(overview?.pipelineData ?? []).map((_, index) => (
                          <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {(overview?.pipelineData ?? []).map((row, index) => (
                    <div key={row.name} className="flex items-center justify-between rounded-2xl bg-white/60 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2 capitalize">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                        {row.name}
                      </span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {canViewFinance && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4 text-primary" />
                  Finance health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span>Collection progress</span>
                    <strong>{overview?.collectionPercent ?? 0}%</strong>
                  </div>
                  <Progress value={overview?.collectionPercent ?? 0} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <MiniStat label="Collected today" value={formatCurrency(overview?.financeStats.collectedToday ?? 0)} />
                  <MiniStat label="Outstanding" value={formatCurrency(overview?.financeStats.outstanding ?? 0)} />
                  <MiniStat label="Open vouchers" value={String(overview?.financeStats.openVouchers ?? 0)} />
                  <MiniStat label="Overdue lines" value={String(overview?.financeStats.overdueCount ?? 0)} tone="danger" />
                </div>
              </CardContent>
            </Card>
            )}

            {canViewStudents && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-primary" />
                  Students by program
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overview?.programData ?? []} margin={{ top: 16, right: 16, left: 0, bottom: 24 }}>
                    <CartesianGrid stroke="#dbeafe" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="value" name="Students" fill="#06b6d4" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            )}
          </div>

          {canSetupSystem && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Layers className="h-5 w-5" />
                System setup shortcut
              </CardTitle>
              <Button asChild size="sm">
                <Link to="/settings/academic">Open Academic setup</Link>
              </Button>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Active session students: <strong>{overview?.activeSessionStudents ?? 0}</strong>. Keep sessions,
              programs, classes and sections updated so inquiry, admission and finance reports stay accurate.
            </CardContent>
          </Card>
          )}
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-2xl border bg-white/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-black ${tone === "danger" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function OfficerPerformanceChart({ title, data }: { title: string; data: OfficerInquiryPerformance[] }) {
  return (
    <div className="rounded-3xl border bg-white/50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">Assigned vs converted inquiries by officer</p>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />Assigned</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-600" />Converted</span>
        </div>
      </div>
      {data.length ? (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 12, right: 20 }}>
              <CartesianGrid stroke="#dbeafe" strokeDasharray="4 4" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis
                dataKey="officer"
                type="category"
                width={110}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip />
              <Bar dataKey="assigned" name="Assigned" fill="#2563eb" radius={[0, 10, 10, 0]} />
              <Bar dataKey="converted" name="Converted" fill="#16a34a" radius={[0, 10, 10, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-72 items-center justify-center rounded-2xl bg-muted/40 text-sm text-muted-foreground">
          No officer activity for this period.
        </div>
      )}
    </div>
  );
}

function OfficerPerformanceTable({ title, data }: { title: string; data: OfficerInquiryPerformance[] }) {
  return (
    <div className="rounded-3xl border bg-white/50 p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {data.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Admission officer</TableHead>
              <TableHead className="text-right">Assigned</TableHead>
              <TableHead className="text-right">Converted</TableHead>
              <TableHead className="text-right">Conversion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => {
              const rate = row.assigned > 0 ? Math.round((row.converted / row.assigned) * 100) : 0;
              return (
                <TableRow key={row.officer}>
                  <TableCell className="font-medium">{row.officer}</TableCell>
                  <TableCell className="text-right">{row.assigned}</TableCell>
                  <TableCell className="text-right">{row.converted}</TableCell>
                  <TableCell className="text-right">{rate}%</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <p className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">No officer activity for this month.</p>
      )}
    </div>
  );
}

