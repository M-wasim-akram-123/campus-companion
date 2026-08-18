import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  BookOpen,
  Building2,
  CalendarCheck,
  CalendarRange,
  GraduationCap,
  Presentation,
  School,
  Users,
} from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { canAccessLms, canManageLmsAcademics } from "@/lib/lms/permissions";
import { fetchLmsDashboard, listDepartments } from "@/lib/lms/api";
import { LmsPageHeader } from "@/components/lms/LmsPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/lms/")({
  component: LmsDashboardPage,
});

function roleCopy(roles: AppRole[]) {
  if (roles.includes("super_admin")) {
    return {
      title: "LMS Command Center",
      description:
        "Campus-wide BS academic operations, faculty, enrollment, and semester readiness.",
      focus: "Full academic oversight",
    };
  }
  if (roles.includes("hod")) {
    return {
      title: "Department Dashboard",
      description:
        "Manage your department semesters, curriculum, faculty workload, and class delivery.",
      focus: "Department operations",
    };
  }
  if (roles.includes("academic_coordinator") || roles.includes("registrar")) {
    return {
      title: "Academic Operations",
      description:
        "Coordinate semesters, class groups, course offerings, teachers, and enrollments.",
      focus: "Academic coordination",
    };
  }
  if (roles.includes("bs_coordinator")) {
    return {
      title: "BS Coordinator Desk",
      description:
        "Confirm theory and lab lectures for your assigned semesters. Marks drive visiting teacher salary.",
      focus: "Lecture delivery",
    };
  }
  if (roles.includes("teacher")) {
    return {
      title: "Teacher Workspace",
      description:
        "Open My BS classes for assigned BS students. Intermediate students stay under Inter students.",
      focus: "Assigned teaching",
    };
  }
  if (roles.includes("exam_officer")) {
    return {
      title: "BS Examination Desk",
      description:
        "Academic structure today; final examinations, exam books, and approvals arrive in Phase 3.",
      focus: "Examination control",
    };
  }
  return {
    title: "BS LMS",
    description: "BS academic structure, teachers, classes, and course delivery.",
    focus: "Academic overview",
  };
}

function LmsDashboardPage() {
  const navigate = useNavigate();
  const { roles, teacherScope, loading } = useAuth();
  const allowed = canAccessLms(roles);
  const scopedTeacher =
    roles.includes("teacher") &&
    !roles.some((role) =>
      ["super_admin", "hod", "academic_coordinator", "registrar"].includes(
        role,
      ),
    );
  const copy = roleCopy(roles);

  useEffect(() => {
    if (!loading && !allowed) {
      navigate({ to: "/settings/profile", replace: true });
    } else if (!loading && scopedTeacher) {
      navigate({
        to: teacherScope === "inter" ? "/exams" : "/lms/my-classes",
        replace: true,
      });
    }
  }, [allowed, loading, navigate, scopedTeacher, teacherScope]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["lms-dashboard"],
    queryFn: fetchLmsDashboard,
    enabled: allowed && !scopedTeacher,
    retry: false,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["lms-departments"],
    queryFn: listDepartments,
    enabled: allowed && !scopedTeacher,
    retry: false,
  });

  const chartData = useMemo(
    () => [
      { name: "Departments", value: data?.departments ?? 0 },
      { name: "Semesters", value: data?.activeSemesters ?? 0 },
      { name: "Courses", value: data?.courses ?? 0 },
      { name: "Teachers", value: data?.teachers ?? 0 },
      { name: "Offerings", value: data?.offerings ?? 0 },
      { name: "Enrolled", value: data?.enrolledStudents ?? 0 },
    ],
    [data],
  );

  if (loading || !allowed || scopedTeacher) {
    return <div className="p-8 text-center text-muted-foreground">Loading LMS…</div>;
  }

  return (
    <div className="space-y-6">
      <LmsPageHeader
        title={copy.title}
        description={copy.description}
        actions={
          roles.includes("teacher") ? (
            <Button asChild>
              <Link to="/lms/my-classes">My BS classes</Link>
            </Button>
          ) : canManageLmsAcademics(roles) ? (
            <Button asChild>
              <Link to="/lms/semesters">Prepare semester</Link>
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base">LMS database setup required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{error instanceof Error ? error.message : "Could not load LMS data."}</p>
            <p>
              Run <code className="rounded bg-muted px-1">patch-lms-step1-roles.sql</code>, then{" "}
              <code className="rounded bg-muted px-1">
                migrations/20260724151000_lms_foundation.sql
              </code>{" "}
              in separate Supabase SQL Editor queries.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="BS students"
              value={data?.enrolledStudents ?? 0}
              hint="Active semester enrollments"
              icon={Users}
              gradient="from-blue-500 to-cyan-400"
            />
            <MetricCard
              title="Teachers"
              value={data?.teachers ?? 0}
              hint="Active LMS faculty"
              icon={Presentation}
              gradient="from-violet-500 to-fuchsia-400"
            />
            <MetricCard
              title="Current semesters"
              value={data?.activeSemesters ?? 0}
              hint="Admission open or running"
              icon={CalendarRange}
              gradient="from-emerald-500 to-teal-400"
            />
            <MetricCard
              title="Course offerings"
              value={data?.offerings ?? 0}
              hint={copy.focus}
              icon={GraduationCap}
              gradient="from-amber-500 to-orange-400"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <School className="h-4 w-4 text-primary" />
                  LMS foundation at a glance
                </CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <defs>
                      <linearGradient id="lmsOverviewBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.65} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#dbeafe" strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #bfdbfe" }} />
                    <Bar
                      dataKey="value"
                      fill="url(#lmsOverviewBar)"
                      radius={[8, 8, 0, 0]}
                      maxBarSize={54}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarCheck className="h-4 w-4 text-primary" />
                  Current semester lifecycle
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!data?.currentSemesters.length ? (
                  <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
                    <CalendarRange className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="font-medium">No active semester</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Prepare a BS semester to begin.
                    </p>
                  </div>
                ) : (
                  data.currentSemesters.map((semester) => (
                    <div
                      key={semester.id}
                      className="rounded-2xl border bg-white/50 p-3 dark:bg-white/5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">{semester.name}</p>
                        <Badge variant={semester.status === "running" ? "default" : "secondary"}>
                          {semester.status.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Semester {semester.semester_number}
                        {semester.start_date ? ` · starts ${semester.start_date}` : ""}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <QuickLink
              to="/lms/departments"
              title="Departments"
              description={`${departments.length} configured departments`}
              icon={Building2}
            />
            <QuickLink
              to="/lms/courses"
              title="Course catalog"
              description={`${data?.courses ?? 0} active courses`}
              icon={BookOpen}
            />
            <QuickLink
              to="/lms/offerings"
              title="Course offerings"
              description={`${data?.offerings ?? 0} semester · course offerings`}
              icon={GraduationCap}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
  gradient,
}: {
  title: string;
  value: number;
  hint: string;
  icon: typeof Users;
  gradient: string;
}) {
  return (
    <Card className="group overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div
          className={`rounded-2xl bg-gradient-to-br ${gradient} p-2 text-white shadow-lg transition-transform group-hover:scale-110`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-black">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function QuickLink({
  to,
  title,
  description,
  icon: Icon,
}: {
  to: "/lms/departments" | "/lms/courses" | "/lms/offerings";
  title: string;
  description: string;
  icon: typeof BookOpen;
}) {
  return (
    <Link to={to}>
      <Card className="h-full hover:-translate-y-0.5">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
