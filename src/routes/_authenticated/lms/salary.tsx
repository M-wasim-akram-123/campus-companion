import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, Fragment } from "react";
import { Download, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canViewLmsSalarySheet } from "@/lib/lms/permissions";
import {
  listCourses,
  listDepartments,
  listLectureDeliveries,
  listOfferings,
  listSemesters,
  listTeacherAssignments,
  listTeacherDisplayNames,
  listTeacherProfiles,
} from "@/lib/lms/api";
import {
  buildSalarySheet,
  formatSalaryMoney,
  salaryPeriodBounds,
  salaryPeriodKey,
  type SalaryPeriodMode,
} from "@/lib/lms/salary";
import { LmsPageHeader } from "@/components/lms/LmsPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/_authenticated/lms/salary")({
  component: LmsSalarySheetPage,
});

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function LmsSalarySheetPage() {
  const navigate = useNavigate();
  const { roles, loading } = useAuth();
  const allowed = canViewLmsSalarySheet(roles);

  const [periodMode, setPeriodMode] = useState<SalaryPeriodMode>("month");
  const [month, setMonth] = useState(currentMonthValue);
  const [semesterId, setSemesterId] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !allowed) void navigate({ to: "/lms" });
  }, [allowed, loading, navigate]);

  const period = useMemo(
    () => ({ mode: periodMode, month, semesterId, customFrom, customTo }),
    [periodMode, month, semesterId, customFrom, customTo],
  );

  const periodKey = useMemo(() => {
    try {
      return salaryPeriodKey(period);
    } catch {
      return null;
    }
  }, [period]);

  const { data: teachers = [] } = useQuery({
    queryKey: ["lms-teachers"],
    queryFn: listTeacherProfiles,
    enabled: allowed,
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ["lms-teacher-assignments"],
    queryFn: listTeacherAssignments,
    enabled: allowed,
  });
  const { data: offerings = [] } = useQuery({
    queryKey: ["lms-offerings"],
    queryFn: listOfferings,
    enabled: allowed,
  });
  const { data: courses = [] } = useQuery({
    queryKey: ["lms-courses"],
    queryFn: listCourses,
    enabled: allowed,
  });
  const { data: semesters = [] } = useQuery({
    queryKey: ["lms-semesters"],
    queryFn: listSemesters,
    enabled: allowed,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ["lms-departments"],
    queryFn: listDepartments,
    enabled: allowed,
  });
  const { data: teacherNames = {} } = useQuery({
    queryKey: ["lms-salary-teacher-names", teachers.map((t) => t.user_id).join(",")],
    queryFn: () => listTeacherDisplayNames(teachers.map((t) => t.user_id)),
    enabled: allowed && teachers.length > 0,
  });

  const bounds = useMemo(() => salaryPeriodBounds(period, semesters), [period, semesters]);

  const { data: deliveries = [] } = useQuery({
    queryKey: ["lms-salary-deliveries", bounds?.from, bounds?.to],
    queryFn: () => listLectureDeliveries({ from: bounds!.from, to: bounds!.to }),
    enabled: allowed && Boolean(bounds),
  });

  const rows = useMemo(() => {
    if (!periodKey || !bounds) return [];
    try {
      return buildSalarySheet({
        period,
        teachers,
        teacherNames,
        assignments,
        offerings,
        courses,
        semesters,
        departments,
        deliveries,
      });
    } catch {
      return [];
    }
  }, [
    periodKey,
    bounds,
    period,
    teachers,
    teacherNames,
    assignments,
    offerings,
    courses,
    semesters,
    departments,
    deliveries,
  ]);

  const grandTotal = rows.reduce((sum, row) => sum + row.totalAmount, 0);

  const exportCsv = () => {
    if (!rows.length) return toast.error("Nothing to export");
    const lines = [
      [
        "Teacher",
        "Employee code",
        "Employment",
        "Pay mode",
        "Course",
        "Semester",
        "Program",
        "Theory lectures",
        "Lab lectures",
        "Total lectures",
        "Rate",
        "Line amount",
        "Teacher total",
      ].join(","),
    ];
    for (const row of rows) {
      for (const course of row.courses) {
        lines.push(
          [
            csv(row.teacherName),
            csv(row.employeeCode ?? ""),
            row.employmentType,
            row.calcMode,
            csv(`${course.courseCode} ${course.courseName}`),
            csv(course.semesterName),
            course.departmentCode,
            course.theoryLectures,
            course.labLectures,
            course.lecturesCounted,
            row.calcMode === "fixed" ? row.fixedSalary : course.unitRate,
            row.calcMode === "fixed" ? "" : course.lineAmount,
            row.totalAmount,
          ].join(","),
        );
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lms-salary-sheet-${periodKey?.replace(/[:/]/g, "-") ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !allowed) {
    return <p className="p-6 text-sm text-muted-foreground">Loading salary sheet…</p>;
  }

  return (
    <div className="space-y-6">
      <LmsPageHeader
        title="Salary sheet"
        description="Permanent teachers: full fixed salary. Visiting / lecture-wise: theory + lab lectures marked by the semester coordinator × per-lecture rate. Finance cannot open this page."
        actions={
          <Button type="button" variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Period</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Period type">
            <Select
              value={periodMode}
              onValueChange={(value) => setPeriodMode(value as SalaryPeriodMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Calendar month</SelectItem>
                <SelectItem value="semester">Semester instance</SelectItem>
                <SelectItem value="custom">Custom date range</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {periodMode === "month" ? (
            <Field label="Month">
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </Field>
          ) : null}

          {periodMode === "semester" ? (
            <Field label="Semester">
              <Select value={semesterId} onValueChange={setSemesterId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select semester" />
                </SelectTrigger>
                <SelectContent>
                  {semesters.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {departments.find((d) => d.id === s.department_id)?.code ?? "BS"} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {periodMode === "custom" ? (
            <>
              <Field label="From">
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </Field>
              <Field label="To">
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </Field>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Teachers</CardTitle>
          <div className="text-sm text-muted-foreground">
            {rows.length} teacher{rows.length === 1 ? "" : "s"} · Total{" "}
            <span className="font-semibold text-foreground">{formatSalaryMoney(grandTotal)}</span>
          </div>
        </CardHeader>
        <CardContent>
          {!periodKey ? (
            <p className="text-sm text-muted-foreground">Select a complete period to build the sheet.</p>
          ) : !rows.length ? (
            <Empty />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Courses</TableHead>
                  <TableHead>Theory / Lab</TableHead>
                  <TableHead>Pay</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <Fragment key={row.teacherUserId}>
                    <TableRow>
                      <TableCell>
                        <p className="font-medium">{row.teacherName}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.employeeCode ?? "No employee code"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.employmentType}</Badge>
                      </TableCell>
                      <TableCell>{row.courses.length}</TableCell>
                      <TableCell>
                        {row.calcMode === "fixed"
                          ? "—"
                          : `${row.theoryLectures} / ${row.labLectures} (${row.totalLectures})`}
                      </TableCell>
                      <TableCell>
                        {row.calcMode === "fixed"
                          ? `Fixed ${formatSalaryMoney(row.fixedSalary)}`
                          : `${formatSalaryMoney(row.perLectureRate)} / lecture`}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatSalaryMoney(row.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setExpanded((id) =>
                              id === row.teacherUserId ? null : row.teacherUserId,
                            )
                          }
                        >
                          {expanded === row.teacherUserId ? "Hide" : "Details"}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded === row.teacherUserId
                      ? row.courses.map((course) => (
                          <TableRow key={`${row.teacherUserId}-${course.offeringId}`}>
                            <TableCell colSpan={2} className="bg-muted/30 pl-8 text-sm">
                              <p className="font-medium">
                                {course.courseCode} · {course.courseName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {course.departmentCode} · {course.semesterName}
                              </p>
                            </TableCell>
                            <TableCell className="bg-muted/30 text-sm">{course.lecturesCounted}</TableCell>
                            <TableCell className="bg-muted/30 text-sm">
                              {course.theoryLectures} theory · {course.labLectures} lab
                            </TableCell>
                            <TableCell className="bg-muted/30 text-sm">
                              {row.calcMode === "fixed"
                                ? "Included in fixed salary"
                                : formatSalaryMoney(course.unitRate)}
                            </TableCell>
                            <TableCell className="bg-muted/30 text-right text-sm">
                              {row.calcMode === "fixed"
                                ? "—"
                                : formatSalaryMoney(course.lineAmount)}
                            </TableCell>
                            <TableCell className="bg-muted/30" />
                          </TableRow>
                        ))
                      : null}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function csv(value: string) {
  if (value.includes(",") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl border border-dashed py-12 text-center">
      <Wallet className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
      <p className="font-medium">No teachers in this period</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Assign teachers to offerings, then mark lecture deliveries on Lecture delivery.
      </p>
    </div>
  );
}
