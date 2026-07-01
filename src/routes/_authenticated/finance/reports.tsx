import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, installmentBalance } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/reports")({
  component: FinanceReports,
});

function fmtMonth(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function monthKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthStart(key: string) {
  return `${key}-01`;
}

function recentMonthKeys(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - index);
    return monthKey(date);
  });
}

function htmlCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadExcel(filename: string, html: string) {
  const blob = new Blob([`\uFEFF${html}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function FinanceReports() {
  const [studentSessionId, setStudentSessionId] = useState("__all__");
  const [studentProgramId, setStudentProgramId] = useState("__all__");
  const [studentClassId, setStudentClassId] = useState("__all__");
  const [studentSectionId, setStudentSectionId] = useState("__all__");
  const [studentGender, setStudentGender] = useState("__all__");
  const [studentStatus, setStudentStatus] = useState("active");

  const monthly = useQuery({
    queryKey: ["fin-monthly"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_payments")
        .select("id, amount, paid_at")
        .order("paid_at", { ascending: false });
      if (error) throw error;
      const grouped = new Map<string, { month: string; payment_count: number; total_collected: number }>();
      for (const payment of data ?? []) {
        const key = monthKey(payment.paid_at);
        const current = grouped.get(key) ?? { month: monthStart(key), payment_count: 0, total_collected: 0 };
        current.payment_count += 1;
        current.total_collected += Number(payment.amount ?? 0);
        grouped.set(key, current);
      }
      return [...grouped.values()].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);
    },
  });

  const sections = useQuery({
    queryKey: ["fin-sections"],
    queryFn: async () => {
      const [{ data: students, error: studentsErr }, { data: installments, error: installmentsErr }] = await Promise.all([
        supabase
          .from("students")
          .select("id, section_id, sections(name, gender), classes(name), programs(name)")
          .eq("status", "active"),
        supabase
          .from("student_fee_installments")
          .select("student_id, amount, paid_amount"),
      ]);
      if (studentsErr) throw studentsErr;
      if (installmentsErr) throw installmentsErr;
      const map = new Map<
        string,
        {
          section_id: string; section_name: string; class_name: string; program_name: string;
          student_count: number; total_billed: number; total_collected: number; outstanding: number;
          studentIds: Set<string>;
        }
      >();
      for (const student of students ?? []) {
        const section = student.sections as { name?: string; gender?: string } | null;
        const key = student.section_id ?? "unassigned";
        const current = map.get(key) ?? {
          section_id: key,
          section_name: section ? `${section.gender === "girls" ? "Girls" : "Boys"} — ${section.name}` : "Unassigned",
          class_name: (student.classes as { name?: string } | null)?.name ?? "—",
          program_name: (student.programs as { name?: string } | null)?.name ?? "—",
          student_count: 0,
          total_billed: 0,
          total_collected: 0,
          outstanding: 0,
          studentIds: new Set<string>(),
        };
        current.studentIds.add(student.id);
        current.student_count = current.studentIds.size;
        map.set(key, current);
      }
      for (const installment of installments ?? []) {
        const section = [...map.values()].find((row) => row.studentIds.has(installment.student_id));
        if (!section) continue;
        const amount = Number(installment.amount ?? 0);
        const paid = Number(installment.paid_amount ?? 0);
        section.total_billed += amount;
        section.total_collected += paid;
        section.outstanding += Math.max(0, amount - paid);
      }
      return [...map.values()]
        .map(({ studentIds: _studentIds, ...row }) => row)
        .sort((a, b) => b.outstanding - a.outstanding) as Array<{
        section_id: string; section_name: string; class_name: string; program_name: string;
        student_count: number; total_billed: number; total_collected: number; outstanding: number;
      }>;
    },
  });

  const defaulters = useQuery({
    queryKey: ["fin-defaulters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_fee_installments")
        .select("student_id, amount, paid_amount, due_date, students(id, full_name, roll_number, phone, guardian_phone, sections(name, gender), classes(name), programs(name))")
        .lt("due_date", new Date().toISOString().slice(0, 10))
        .neq("status", "paid")
        .order("due_date");
      if (error) throw error;
      const grouped = new Map<string, {
        student_id: string; full_name: string; roll_number: string; phone: string;
        guardian_phone: string; section_name: string; class_name: string; program_name: string;
        overdue_count: number; overdue_amount: number; earliest_due: string;
      }>();
      for (const installment of data ?? []) {
        const balance = installmentBalance(installment);
        if (balance <= 0) continue;
        const student = installment.students as {
          id?: string;
          full_name?: string;
          roll_number?: string;
          phone?: string;
          guardian_phone?: string;
          sections?: { name?: string; gender?: string };
          classes?: { name?: string };
          programs?: { name?: string };
        } | null;
        const key = student?.id ?? installment.student_id;
        const section = student?.sections;
        const current = grouped.get(key) ?? {
          student_id: key,
          full_name: student?.full_name ?? "—",
          roll_number: student?.roll_number ?? "—",
          phone: student?.phone ?? "",
          guardian_phone: student?.guardian_phone ?? "",
          section_name: section ? `${section.gender === "girls" ? "Girls" : "Boys"} — ${section.name}` : "—",
          class_name: student?.classes?.name ?? "—",
          program_name: student?.programs?.name ?? "—",
          overdue_count: 0,
          overdue_amount: 0,
          earliest_due: installment.due_date,
        };
        current.overdue_count += 1;
        current.overdue_amount += balance;
        if (installment.due_date < current.earliest_due) current.earliest_due = installment.due_date;
        grouped.set(key, current);
      }
      return [...grouped.values()].sort((a, b) => b.overdue_amount - a.overdue_amount).slice(0, 100);
    },
  });

  const upcoming = useQuery({
    queryKey: ["fin-upcoming"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_fee_installments")
        .select("amount, paid_amount, due_date")
        .gte("due_date", new Date().toISOString().slice(0, 10))
        .neq("status", "paid")
        .order("due_date");
      if (error) throw error;
      const grouped = new Map<string, { month: string; installment_count: number; expected_amount: number }>();
      for (const installment of data ?? []) {
        const balance = installmentBalance(installment);
        if (balance <= 0) continue;
        const key = monthKey(installment.due_date);
        const current = grouped.get(key) ?? { month: monthStart(key), installment_count: 0, expected_amount: 0 };
        current.installment_count += 1;
        current.expected_amount += balance;
        grouped.set(key, current);
      }
      return [...grouped.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(0, 12);
    },
  });

  const studentReport = useQuery({
    queryKey: ["student-fee-export-report"],
    queryFn: async () => {
      const [{ data: students, error: studentsErr }, { data: installments, error: installmentsErr }] = await Promise.all([
        supabase
          .from("students")
          .select("*, programs(name), classes(name), sections(name, gender), academic_sessions(label)")
          .order("roll_number"),
        supabase
          .from("student_fee_installments")
          .select("student_id, label, component_type, amount, paid_amount, due_date, status, sort_order"),
      ]);
      if (studentsErr) throw studentsErr;
      if (installmentsErr) throw installmentsErr;

      const feeMap = new Map<
        string,
        {
          total: number;
          paid: number;
          remaining: number;
          overdue: number;
          installments: Array<{
            label: string;
            component_type: string | null;
            amount: number;
            paid_amount: number;
            balance: number;
            due_date: string;
            status: string;
            sort_order: number;
          }>;
        }
      >();
      const today = new Date().toISOString().slice(0, 10);
      for (const inst of installments ?? []) {
        const total = Number(inst.amount ?? 0);
        const paid = Number(inst.paid_amount ?? 0);
        const balance = Math.max(0, total - paid);
        const current = feeMap.get(inst.student_id) ?? { total: 0, paid: 0, remaining: 0, overdue: 0, installments: [] };
        current.total += total;
        current.paid += paid;
        current.remaining += balance;
        if (balance > 0 && inst.due_date < today) current.overdue += balance;
        current.installments.push({
          label: inst.label,
          component_type: inst.component_type,
          amount: total,
          paid_amount: paid,
          balance,
          due_date: inst.due_date,
          status: inst.status,
          sort_order: Number(inst.sort_order ?? 0),
        });
        feeMap.set(inst.student_id, current);
      }

      const uniqueStudents = [...new Map((students ?? []).map((student) => [student.id, student])).values()];

      return uniqueStudents.map((student) => {
        const section = student.sections as { name?: string; gender?: string } | null;
        const fee = feeMap.get(student.id) ?? { total: 0, paid: 0, remaining: 0, overdue: 0, installments: [] };
        return {
          id: student.id,
          roll_number: student.roll_number,
          full_name: student.full_name,
          father_name: student.father_name,
          guardian_name: student.guardian_name,
          guardian_phone: student.guardian_phone,
          phone: student.phone,
          email: student.email,
          cnic: student.cnic,
          status: student.status,
          admission_date: student.admission_date,
          session_id: student.academic_session_id,
          session_label: (student.academic_sessions as { label?: string } | null)?.label || student.session,
          program_id: student.program_id,
          program_name: (student.programs as { name?: string } | null)?.name,
          class_id: student.class_id,
          class_name: (student.classes as { name?: string } | null)?.name,
          section_id: student.section_id,
          section_name: section?.name,
          section_gender: section?.gender,
          total_fee: fee.total,
          paid_fee: fee.paid,
          remaining_fee: fee.remaining,
          overdue_fee: fee.overdue,
          installments: fee.installments.sort((a, b) => a.sort_order - b.sort_order || a.due_date.localeCompare(b.due_date)),
        };
      });
    },
  });

  const reportMonthKeys = recentMonthKeys(12);
  const currentMonthKey = reportMonthKeys[0];
  const totalRevenue = (monthly.data ?? [])
    .filter((m) => reportMonthKeys.includes(monthKey(m.month)))
    .reduce((s, m) => s + Number(m.total_collected), 0);
  const thisMonthCollected = Number(
    monthly.data?.find((m) => monthKey(m.month) === currentMonthKey)?.total_collected ?? 0,
  );
  const expectedNext12Months = (upcoming.data ?? []).reduce((sum, row) => sum + Number(row.expected_amount ?? 0), 0);
  const nextMonth = upcoming.data?.[1] ?? upcoming.data?.[0];
  const studentRows = studentReport.data ?? [];
  const studentOptions = useMemo(() => {
    const sessions = new Map<string, string>();
    const programs = new Map<string, string>();
    const classes = new Map<string, string>();
    const sections = new Map<string, string>();
    for (const row of studentRows) {
      if (row.session_id) sessions.set(row.session_id, row.session_label || "Unnamed session");
      if (row.program_id) programs.set(row.program_id, row.program_name || "Unnamed program");
      if (row.class_id) classes.set(row.class_id, row.class_name || "Unnamed class");
      if (row.section_id) {
        sections.set(
          row.section_id,
          `${row.section_gender === "girls" ? "Girls" : "Boys"} — ${row.section_name || "Unnamed section"}`,
        );
      }
    }
    return {
      sessions: [...sessions.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      programs: [...programs.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      classes: [...classes.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      sections: [...sections.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [studentRows]);
  const filteredStudentRows = useMemo(
    () =>
      studentRows.filter((row) => {
        if (studentSessionId !== "__all__" && row.session_id !== studentSessionId) return false;
        if (studentProgramId !== "__all__" && row.program_id !== studentProgramId) return false;
        if (studentClassId !== "__all__" && row.class_id !== studentClassId) return false;
        if (studentSectionId !== "__all__" && row.section_id !== studentSectionId) return false;
        if (studentGender !== "__all__" && row.section_gender !== studentGender) return false;
        if (studentStatus !== "__all__" && row.status !== studentStatus) return false;
        return true;
      }),
    [studentRows, studentSessionId, studentProgramId, studentClassId, studentSectionId, studentGender, studentStatus],
  );
  const filteredStudentTotals = filteredStudentRows.reduce(
    (sum, row) => ({
      total: sum.total + row.total_fee,
      paid: sum.paid + row.paid_fee,
      remaining: sum.remaining + row.remaining_fee,
      overdue: sum.overdue + row.overdue_fee,
    }),
    { total: 0, paid: 0, remaining: 0, overdue: 0 },
  );
  const exportStudentReport = () => {
    const exportRows = [...new Map(filteredStudentRows.map((row) => [row.id, row])).values()];
    const installmentColumns = [
      ...new Map(
        exportRows
          .flatMap((row) => row.installments)
          .map((inst) => [`${inst.sort_order}-${inst.label}-${inst.due_date}`, inst]),
      ).values(),
    ].sort((a, b) => a.sort_order - b.sort_order || a.due_date.localeCompare(b.due_date));

    const baseHeaders = [
      "Admission No",
      "Name",
      "Father Name",
      "Program",
      "Section",
      "Phone",
      "Guardian Phone",
      "Guardian Name",
      "Email",
      "CNIC",
      "Session",
      "Class",
      "Gender",
      "Status",
      "Admission Date",
      "Total Fee",
      "Paid Fee",
      "Remaining Fee",
      "Overdue Fee",
    ];
    const headerHtml = [...baseHeaders, ...installmentColumns.map((inst) => `${inst.label} (${inst.due_date})`)]
      .map((header) => `<th>${htmlCell(header)}</th>`)
      .join("");
    const bodyHtml = exportRows
      .map((row) => {
        const baseCells = [
          row.roll_number,
          row.full_name,
          row.father_name,
          row.program_name,
          row.section_name,
          row.phone,
          row.guardian_phone,
          row.guardian_name,
          row.email,
          row.cnic,
          row.session_label,
          row.class_name,
          row.section_gender,
          row.status,
          row.admission_date,
          row.total_fee,
          row.paid_fee,
          row.remaining_fee,
          row.overdue_fee,
        ]
          .map((value) => `<td>${htmlCell(value)}</td>`)
          .join("");
        const installmentCells = installmentColumns
          .map((col) => {
            const match = row.installments.find(
              (inst) => inst.sort_order === col.sort_order && inst.label === col.label && inst.due_date === col.due_date,
            );
            if (!match) return `<td></td>`;
            const paid = Number(match.paid_amount ?? 0);
            const amount = Number(match.amount ?? 0);
            const balance = Math.max(0, amount - paid);
            const cls = paid >= amount && amount > 0 ? "paid-cell" : paid > 0 ? "partial-cell" : "unpaid-cell";
            const text =
              paid >= amount && amount > 0
                ? `Paid ${paid}`
                : paid > 0
                  ? `Paid ${paid} / Due ${balance}`
                  : `Due ${amount}`;
            return `<td class="${cls}">${htmlCell(text)}</td>`;
          })
          .join("");
        return `<tr>${baseCells}${installmentCells}</tr>`;
      })
      .join("");
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
    th { background: #1d4ed8; color: #ffffff; font-weight: 700; }
    th, td { border: 1px solid #94a3b8; padding: 6px; mso-number-format: "\\@"; }
    .paid-cell { background: #bbf7d0; color: #166534; font-weight: 700; }
    .partial-cell { background: #fef3c7; color: #92400e; font-weight: 700; }
    .unpaid-cell { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <table>
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>
</body>
</html>`;
    downloadExcel(`student-fee-report-${new Date().toISOString().slice(0, 10)}.xls`, html);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Finance reports</h1>
        <p className="text-muted-foreground">Revenue, section-wise collection, defaulters, and forecasts</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Collected revenue (last 12 months)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">This month collected</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(thisMonthCollected)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Expected receivable (next 12 months)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(expectedNext12Months)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Next month estimate</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(Number(nextMonth?.expected_amount ?? 0))}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Defaulters</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{defaulters.data?.length ?? 0}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Student fee export</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Download student list with basic info, paid fees, remaining fees, and overdue amount.
              </p>
            </div>
            <Button type="button" onClick={exportStudentReport} disabled={!filteredStudentRows.length}>
              <Download className="mr-2 h-4 w-4" />
              Download Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Select value={studentSessionId} onValueChange={setStudentSessionId}>
              <SelectTrigger><SelectValue placeholder="Session" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All sessions</SelectItem>
                {studentOptions.sessions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={studentProgramId} onValueChange={setStudentProgramId}>
              <SelectTrigger><SelectValue placeholder="Program" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All programs</SelectItem>
                {studentOptions.programs.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={studentClassId} onValueChange={setStudentClassId}>
              <SelectTrigger><SelectValue placeholder="Class / year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All classes</SelectItem>
                {studentOptions.classes.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={studentSectionId} onValueChange={setStudentSectionId}>
              <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All sections</SelectItem>
                {studentOptions.sections.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={studentGender} onValueChange={setStudentGender}>
              <SelectTrigger><SelectValue placeholder="Gender group" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Boys & girls</SelectItem>
                <SelectItem value="girls">Girls only</SelectItem>
                <SelectItem value="boys">Boys only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={studentStatus} onValueChange={setStudentStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="graduated">Graduated</SelectItem>
                <SelectItem value="left">Left college</SelectItem>
                <SelectItem value="bad_debt">Bad debt</SelectItem>
                <SelectItem value="dropped">Dropped</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Students</p>
              <p className="text-xl font-black">{filteredStudentRows.length}</p>
            </div>
            <div className="rounded-2xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Total fees</p>
              <p className="text-xl font-black">{formatCurrency(filteredStudentTotals.total)}</p>
            </div>
            <div className="rounded-2xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="text-xl font-black text-emerald-700">{formatCurrency(filteredStudentTotals.paid)}</p>
            </div>
            <div className="rounded-2xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="text-xl font-black">{formatCurrency(filteredStudentTotals.remaining)}</p>
            </div>
            <div className="rounded-2xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-xl font-black text-destructive">{formatCurrency(filteredStudentTotals.overdue)}</p>
            </div>
          </div>

          {studentReport.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading student report...</p>
          ) : !filteredStudentRows.length ? (
            <p className="text-sm text-muted-foreground">No students match these filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Class / section</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudentRows.slice(0, 25).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link to="/students/$id" params={{ id: row.id }} className="font-medium text-primary hover:underline">
                        {row.full_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{row.roll_number} · {row.father_name || "—"}</p>
                    </TableCell>
                    <TableCell>
                      {row.class_name || "—"}
                      <p className="text-xs text-muted-foreground">
                        {row.section_gender === "girls" ? "Girls" : row.section_gender === "boys" ? "Boys" : "—"} — {row.section_name || "No section"}
                      </p>
                    </TableCell>
                    <TableCell>{row.phone || row.guardian_phone || "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.total_fee)}</TableCell>
                    <TableCell className="text-right text-emerald-700">{formatCurrency(row.paid_fee)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.remaining_fee)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {filteredStudentRows.length > 25 && (
            <p className="text-xs text-muted-foreground">
              Showing first 25 rows here. Excel download includes all {filteredStudentRows.length} rows.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Month-wise collection</CardTitle></CardHeader>
        <CardContent>
          {!monthly.data?.length ? <p className="text-muted-foreground text-sm">No payments yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Payments</TableHead><TableHead className="text-right">Collected</TableHead></TableRow></TableHeader>
              <TableBody>
                {monthly.data.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{fmtMonth(m.month)}</TableCell>
                    <TableCell className="text-right">{m.payment_count}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(m.total_collected))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Upcoming months (expected)</CardTitle></CardHeader>
        <CardContent>
          {!upcoming.data?.length ? <p className="text-muted-foreground text-sm">No upcoming installments.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Installments</TableHead><TableHead className="text-right">Expected</TableHead></TableRow></TableHeader>
              <TableBody>
                {upcoming.data.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{fmtMonth(m.month)}</TableCell>
                    <TableCell className="text-right">{m.installment_count}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(m.expected_amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Section-wise collection</CardTitle></CardHeader>
        <CardContent>
          {!sections.data?.length ? <p className="text-muted-foreground text-sm">No sections.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Section</TableHead><TableHead>Class</TableHead><TableHead>Program</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Billed</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {sections.data.map((s) => (
                  <TableRow key={s.section_id}>
                    <TableCell>{s.section_name}</TableCell>
                    <TableCell>{s.class_name}</TableCell>
                    <TableCell>{s.program_name}</TableCell>
                    <TableCell className="text-right">{s.student_count}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(s.total_billed))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(s.total_collected))}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(s.outstanding))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Defaulters (overdue)</CardTitle></CardHeader>
        <CardContent>
          {!defaulters.data?.length ? <p className="text-muted-foreground text-sm">No defaulters.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Student</TableHead><TableHead>Roll</TableHead><TableHead>Section</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Earliest due</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {defaulters.data.map((d) => (
                  <TableRow key={d.student_id}>
                    <TableCell>
                      <Link to="/students/$id" params={{ id: d.student_id }} className="text-primary hover:underline">
                        {d.full_name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.roll_number}</TableCell>
                    <TableCell>{d.section_name} · {d.class_name}</TableCell>
                    <TableCell>{d.phone || d.guardian_phone || "—"}</TableCell>
                    <TableCell className="text-right"><Badge variant="destructive">{d.overdue_count}</Badge></TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(d.overdue_amount))}</TableCell>
                    <TableCell>{d.earliest_due}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
