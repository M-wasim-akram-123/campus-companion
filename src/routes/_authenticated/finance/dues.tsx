import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchOverdueInstallments,
  formatCurrency,
  installmentBalance,
} from "@/lib/finance";
import {
  bestContactPhone,
  copyText,
  daysOverdue,
  DEFAULT_REMINDER_TEMPLATE,
  exportPhoneList,
  filterOverdueRows,
  getReminderTemplate,
  groupOverdueByStudent,
  messageForInstallment,
  messageForStudentGroup,
  saveReminderTemplate,
  smsUrl,
  whatsAppUrl,
} from "@/lib/finance-followup";
import { CAMPUS_NAME } from "@/lib/campus";
import { Copy, Download, FileStack, MessageCircle, Phone, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/finance/dues")({
  component: OverdueFollowUp,
});

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildStudentDuesWorkbook(rows: Awaited<ReturnType<typeof fetchOverdueInstallments>>) {
  const grouped = new Map<
    string,
    {
      student: {
        id?: string;
        full_name?: string;
        roll_number?: string;
        father_name?: string;
        phone?: string;
        guardian_phone?: string;
        programs?: { name?: string };
        sections?: { name?: string; gender?: string };
      };
      section: string;
      dues: Array<{ key: string; label: string; due_date: string; amount: number; paid: number; balance: number; sort_order: number }>;
      totalPaid: number;
      totalUnpaid: number;
    }
  >();
  for (const row of rows) {
    const st = row.students as {
      id?: string;
      full_name?: string;
      roll_number?: string;
      father_name?: string;
      phone?: string;
      guardian_phone?: string;
      programs?: { name?: string };
      sections?: { name?: string; gender?: string };
    };
    const studentId = st?.id ?? row.student_id;
    const section = st?.sections ? `${st.sections.gender === "girls" ? "Girls" : "Boys"} ${st.sections.name}` : "";
    const current = grouped.get(studentId) ?? { student: st, section, dues: [], totalPaid: 0, totalUnpaid: 0 };
    const amount = Number(row.amount ?? 0);
    const paid = Number(row.paid_amount ?? 0);
    const balance = Math.max(0, amount - paid);
    current.dues.push({
      key: `${Number(row.sort_order ?? 0)}-${row.label}-${row.due_date}`,
      label: row.label,
      due_date: row.due_date,
      amount,
      paid,
      balance,
      sort_order: Number(row.sort_order ?? 0),
    });
    current.totalPaid += paid;
    current.totalUnpaid += balance;
    grouped.set(studentId, current);
  }

  const groups = [...grouped.values()];
  const dueColumns = [
    ...new Map(groups.flatMap((group) => group.dues).map((due) => [due.key, due])).values(),
  ].sort((a, b) => a.sort_order - b.sort_order || a.due_date.localeCompare(b.due_date));
  const headers = [
    "Admission No",
    "Name",
    "Father Name",
    "Program",
    "Section",
    "Phone",
    "Guardian Phone",
    ...dueColumns.map((due) => `${due.label} (${due.due_date})`),
    "Total paid",
    "Total unpaid remaining",
  ];
  const data = groups.map((group) => {
    const st = group.student;
    return [
      st?.roll_number ?? "",
      st?.full_name ?? "",
      st?.father_name ?? "",
      st?.programs?.name ?? "",
      group.section,
      st?.phone ?? "",
      st?.guardian_phone ?? "",
      ...dueColumns.map((col) => {
        const due = group.dues.find((item) => item.key === col.key);
        if (!due) return "";
        if (due.paid >= due.amount && due.amount > 0) return `Paid ${due.paid}`;
        if (due.paid > 0) return `Paid ${due.paid} / Due ${due.balance}`;
        return `Due ${due.amount}`;
      }),
      group.totalPaid,
      group.totalUnpaid,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const headerStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1D4ED8" } } };
  const paidStyle = { font: { bold: true, color: { rgb: "166534" } }, fill: { fgColor: { rgb: "BBF7D0" } } };
  const partialStyle = { font: { bold: true, color: { rgb: "92400E" } }, fill: { fgColor: { rgb: "FEF3C7" } } };
  const unpaidStyle = { font: { bold: true, color: { rgb: "991B1B" } }, fill: { fgColor: { rgb: "FEE2E2" } } };
  headers.forEach((_, col) => {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: col })];
    if (cell) cell.s = headerStyle;
  });
  const feeStartCol = 7;
  const feeEndCol = feeStartCol + dueColumns.length - 1;
  data.forEach((row, rowIndex) => {
    for (let col = feeStartCol; col <= feeEndCol; col += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r: rowIndex + 1, c: col })];
      const value = String(row[col] ?? "");
      if (!cell || !value) continue;
      cell.s = value.startsWith("Paid ") && !value.includes("/ Due") ? paidStyle : value.includes("/ Due") ? partialStyle : unpaidStyle;
    }
  });
  ws["!cols"] = headers.map((header, index) => ({ wch: index >= feeStartCol && index <= feeEndCol ? 28 : Math.max(14, header.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Student Dues");
  return wb;
}

function OverdueFollowUp() {
  const [sessionScope, setSessionScope] = useState<"active" | "all" | string>("active");
  const [genderFilter, setGenderFilter] = useState<"__all__" | "boys" | "girls">("__all__");
  const [sectionFilter, setSectionFilter] = useState("__all__");
  const [dueScope, setDueScope] = useState<"all_unpaid" | "overdue" | "due_soon">("all_unpaid");
  const [minDays, setMinDays] = useState("0");
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState(getReminderTemplate);
  const [showTemplate, setShowTemplate] = useState(false);

  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () =>
      (await supabase.from("academic_sessions").select("*").order("start_year", { ascending: false })).data ?? [],
  });

  const active = sessions?.find((s) => s.is_active);
  const filterSessionId =
    sessionScope === "all" ? undefined : sessionScope === "active" ? active?.id : sessionScope;

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["finance-overdue"],
    queryFn: fetchOverdueInstallments,
  });

  const filtered = useMemo(
    () =>
      filterOverdueRows(rows ?? [], {
        sessionId: filterSessionId,
        sectionId: sectionFilter === "__all__" ? undefined : sectionFilter,
        gender: genderFilter === "__all__" ? undefined : genderFilter,
        dueScope,
        minDaysOverdue: Number(minDays) || 0,
        search,
      }),
    [rows, filterSessionId, sectionFilter, genderFilter, dueScope, minDays, search],
  );

  const groups = useMemo(() => groupOverdueByStudent(filtered), [filtered]);

  const stats = useMemo(() => {
    const totalAmount = filtered.reduce((s, r) => s + installmentBalance(r), 0);
    const noPhone = groups.filter((g) => !g.guardianPhone && !g.phone).length;
    return { count: filtered.length, students: groups.length, totalAmount, noPhone };
  }, [filtered, groups]);

  const sections = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      if (g.sectionId && g.section) map.set(g.sectionId, g.section);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [groups]);

  const exportCsv = async () => {
    if (!filtered.length) return;
    const studentIds = [...new Set(filtered.map((row) => row.student_id))];
    const { data, error } = await supabase
      .from("student_fee_installments")
      .select(
        "*, students(id, full_name, roll_number, father_name, phone, guardian_phone, guardian_name, academic_session_id, section_id, programs(name), sections(name, gender))",
      )
      .in("student_id", studentIds)
      .order("sort_order");
    if (error) {
      toast.error(error.message);
      return;
    }
    XLSX.writeFile(
      buildStudentDuesWorkbook(data ?? []),
      `overdue-followup-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const exportPhones = () => {
    if (!groups.length) return;
    downloadCsv(`overdue-phones-${new Date().toISOString().slice(0, 10)}.csv`, exportPhoneList(groups));
  };

  const copyAllPhones = async () => {
    const phones = groups
      .map((g) => g.guardianPhone || g.phone)
      .filter(Boolean)
      .join("\n");
    if (!phones) {
      toast.error("No phone numbers to copy");
      return;
    }
    if (await copyText(phones)) toast.success(`Copied ${phones.split("\n").length} numbers`);
  };

  const saveTemplate = () => {
    saveReminderTemplate(template);
    toast.success("Message template saved");
    setShowTemplate(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Overdue follow-up</h1>
          <p className="text-muted-foreground">
            {CAMPUS_NAME} - WhatsApp, SMS, and CSV for unpaid / overdue fee reminders
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!filtered.length} onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Download Excel
          </Button>
          <Button variant="outline" disabled={!groups.length} onClick={exportPhones}>
            <Phone className="mr-2 h-4 w-4" />
            Phone list
          </Button>
          <Button variant="outline" disabled={!groups.length} onClick={copyAllPhones}>
            <Copy className="mr-2 h-4 w-4" />
            Copy phones
          </Button>
          <Button asChild variant="outline">
            <Link to="/finance/bulk-vouchers">
              <FileStack className="mr-2 h-4 w-4" />
              Issue vouchers
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Overdue lines</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.count}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Students</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.students}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total outstanding</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-700">{formatCurrency(stats.totalAmount)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Missing phone</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.noPhone}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-2">
            <Label>Session</Label>
            <Select value={sessionScope} onValueChange={(v) => { setSessionScope(v); setSectionFilter("__all__"); }}>
              <SelectTrigger><SelectValue placeholder="Session" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active session</SelectItem>
                <SelectItem value="all">All sessions</SelectItem>
                {sessions?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}{s.is_active ? " (active)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select
              value={genderFilter}
              onValueChange={(v) => {
                setGenderFilter(v as typeof genderFilter);
                setSectionFilter("__all__");
              }}
            >
              <SelectTrigger><SelectValue placeholder="All boys / girls" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All boys & girls</SelectItem>
                <SelectItem value="boys">All boys</SelectItem>
                <SelectItem value="girls">All girls</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Section</Label>
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All sections</SelectItem>
                {sections.map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Show</Label>
            <Select value={dueScope} onValueChange={(v) => setDueScope(v as typeof dueScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all_unpaid">All unpaid</SelectItem>
                <SelectItem value="overdue">Overdue only</SelectItem>
                <SelectItem value="due_soon">Due in next 7 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Min days overdue</Label>
            <Select value={minDays} onValueChange={setMinDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Any</SelectItem>
                <SelectItem value="7">7+ days</SelectItem>
                <SelectItem value="15">15+ days</SelectItem>
                <SelectItem value="30">30+ days</SelectItem>
                <SelectItem value="60">60+ days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label>Search student / roll / father</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type to filter…" />
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            Could not load fee follow-up data: {error instanceof Error ? error.message : "Unknown error"}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Reminder message template</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowTemplate((v) => !v)}>
            {showTemplate ? "Hide" : "Edit template"}
          </Button>
        </CardHeader>
        {showTemplate && (
          <CardContent className="space-y-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Placeholders: {"{{campus}}"}, {"{{student}}"}, {"{{roll}}"}, {"{{amount}}"}, {"{{dueDate}}"}, {"{{feeLines}}"}
            </p>
            <Textarea rows={10} value={template} onChange={(e) => setTemplate(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveTemplate}><Save className="mr-1 h-3 w-3" />Save</Button>
              <Button size="sm" variant="outline" onClick={() => setTemplate(DEFAULT_REMINDER_TEMPLATE)}>
                Reset default
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">By student ({groups.length})</TabsTrigger>
          <TabsTrigger value="lines">By installment ({filtered.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="students">
          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <p className="text-muted-foreground">Loading…</p>
              ) : !groups.length ? (
                <p className="text-muted-foreground">
                  No unpaid fee balances match these filters. Try Show: All unpaid, All sessions, or clear the search.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-right">Total due</TableHead>
                      <TableHead>Days late</TableHead>
                      <TableHead>Follow-up</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((g) => (
                      <StudentFollowUpRow key={g.studentId} group={g} template={template} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lines">
          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <p className="text-muted-foreground">Loading…</p>
              ) : !filtered.length ? (
                <p className="text-muted-foreground">
                  No unpaid installments match these filters. Try Show: All unpaid or All sessions.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Adm no.</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Fee</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <InstallmentFollowUpRow key={r.id} row={r} template={template} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StudentFollowUpRow({ group: g, template }: { group: ReturnType<typeof groupOverdueByStudent>[0]; template: string }) {
  const phone = g.guardianPhone || g.phone;
  const msg = messageForStudentGroup(g, template);
  const wa = whatsAppUrl(phone, msg);
  const sms = smsUrl(phone, msg);

  const copyMsg = async () => {
    if (await copyText(msg)) toast.success("Message copied");
  };

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{g.fullName}</p>
        <p className="text-xs text-muted-foreground">{g.rollNumber} · {g.fatherName}</p>
        <p className="text-xs text-muted-foreground">{g.installments.length} fee line(s)</p>
      </TableCell>
      <TableCell className="text-sm">{g.section}</TableCell>
      <TableCell className="text-sm">{phone || <Badge variant="outline">No phone</Badge>}</TableCell>
      <TableCell className="text-right font-medium">{formatCurrency(g.totalBalance)}</TableCell>
      <TableCell><Badge variant="destructive">{g.maxDaysOverdue}d</Badge></TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={copyMsg}><Copy className="h-3 w-3" /></Button>
          {wa && (
            <Button asChild size="sm" variant="default">
              <a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="mr-1 h-3 w-3" />WhatsApp</a>
            </Button>
          )}
          {sms && (
            <Button asChild size="sm" variant="ghost">
              <a href={sms}>SMS</a>
            </Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link to="/finance/collect" search={{ studentId: g.studentId }}>Collect</Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function InstallmentFollowUpRow({ row: r, template }: { row: Awaited<ReturnType<typeof fetchOverdueInstallments>>[0]; template: string }) {
  const st = r.students as { id?: string; full_name?: string; roll_number?: string };
  const phone = bestContactPhone(r);
  const msg = messageForInstallment(r, template);
  const days = daysOverdue(r.due_date);
  const wa = whatsAppUrl(phone, msg);

  return (
    <TableRow>
      <TableCell>{st?.full_name}</TableCell>
      <TableCell>{st?.roll_number}</TableCell>
      <TableCell>{r.due_date}</TableCell>
      <TableCell>{r.label}</TableCell>
      <TableCell><Badge variant={days >= 30 ? "destructive" : "secondary"}>{days}d</Badge></TableCell>
      <TableCell className="text-sm">{phone || "—"}</TableCell>
      <TableCell className="text-right">{formatCurrency(installmentBalance(r))}</TableCell>
      <TableCell className="flex gap-1">
        {wa && (
          <Button asChild size="sm" variant="outline">
            <a href={wa} target="_blank" rel="noreferrer">WhatsApp</a>
          </Button>
        )}
        <Button asChild size="sm" variant="ghost">
          <Link to="/finance/collect" search={{ studentId: st?.id ?? r.student_id, installmentId: r.id }}>Collect</Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
