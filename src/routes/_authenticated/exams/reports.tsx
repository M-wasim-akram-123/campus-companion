import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, GraduationCap, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { canManageExams } from "@/lib/exam-permissions";
import { fetchInternalTestSeries } from "@/lib/internal-exams";
import {
  fetchIntermediateReport,
  type AcademicPerformanceRow,
} from "@/lib/intermediate-reports";
import { ordinalYearLabel } from "@/lib/academic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/exams/reports")({
  component: IntermediateReportsPage,
});

function IntermediateReportsPage() {
  const navigate = useNavigate();
  const { roles, loading } = useAuth();
  const allowed = canManageExams(roles);
  const [sessionId, setSessionId] = useState("");
  const [classYear, setClassYear] = useState("__all__");
  const [seriesId, setSeriesId] = useState("__all__");

  useEffect(() => {
    if (!loading && !allowed) navigate({ to: "/dashboard", replace: true });
  }, [allowed, loading, navigate]);

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_sessions")
        .select("id, label, is_active, start_year")
        .order("start_year", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: allowed,
  });
  const selectedSession =
    sessionId || sessions.find((session) => session.is_active)?.id || sessions[0]?.id || "";
  const year = classYear === "__all__" ? undefined : Number(classYear);

  const { data: series = [] } = useQuery({
    queryKey: ["internal-test-series-report-options", selectedSession, classYear],
    queryFn: () =>
      fetchInternalTestSeries({
        sessionId: selectedSession,
        classYearLevel: year,
      }),
    enabled: allowed && !!selectedSession,
  });

  const { data: report, isLoading } = useQuery({
    queryKey: ["intermediate-academic-report", selectedSession, classYear, seriesId],
    queryFn: () =>
      fetchIntermediateReport({
        sessionId: selectedSession,
        classYearLevel: year,
        seriesId: seriesId === "__all__" ? undefined : seriesId,
      }),
    enabled: allowed && !!selectedSession,
  });

  if (loading || !allowed) {
    return <div className="p-8 text-center text-muted-foreground">Loading reports…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 px-0">
          <Link to="/exams">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to exams
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Intermediate academic reports</h1>
        <p className="text-muted-foreground">
          Student progress, class results, and teacher performance from the immutable academic
          ledger.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
          <Select
            value={selectedSession}
            onValueChange={(value) => {
              setSessionId(value);
              setSeriesId("__all__");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Session" />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  {session.label}
                  {session.is_active ? " (running)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={classYear}
            onValueChange={(value) => {
              setClassYear(value);
              setSeriesId("__all__");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Intermediate years</SelectItem>
              <SelectItem value="1">{ordinalYearLabel(1)}</SelectItem>
              <SelectItem value="2">{ordinalYearLabel(2)}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={seriesId} onValueChange={setSeriesId}>
            <SelectTrigger>
              <SelectValue placeholder="All test series" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All test series</SelectItem>
              {series.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} · {ordinalYearLabel(item.class_year_level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading academic report…
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Published assessments"
              value={String(report?.assessmentCount ?? 0)}
              icon={BarChart3}
            />
            <Metric label="Students evaluated" value={String(report?.studentCount ?? 0)} icon={Users} />
            <Metric
              label="Overall average"
              value={`${report?.overallAverage ?? 0}%`}
              icon={GraduationCap}
            />
            <Metric
              label="Absence rate"
              value={`${report?.absenceRate ?? 0}%`}
              icon={Users}
            />
          </div>

          <ReportTable
            title="Teacher + subject + section evaluation"
            empty="No teacher-linked published results for these filters."
            rows={report?.teacherSubject ?? []}
          />
          <ReportTable
            title="Class / section results"
            empty="No class results for these filters."
            rows={report?.sections ?? []}
          />
          <ReportTable
            title="Student progress ranking"
            empty="No student academic records for these filters."
            rows={report?.students ?? []}
          />
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Users;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-black">{value}</p>
      </CardContent>
    </Card>
  );
}

function ReportTable({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: AcademicPerformanceRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {!rows.length ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Tests</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Absent</TableHead>
                <TableHead>Average</TableHead>
                <TableHead>Pass rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.detail}</TableCell>
                  <TableCell>{row.assessments}</TableCell>
                  <TableCell>{row.records}</TableCell>
                  <TableCell>{row.absent}</TableCell>
                  <TableCell>{row.averagePercent}%</TableCell>
                  <TableCell>{row.passPercent}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
