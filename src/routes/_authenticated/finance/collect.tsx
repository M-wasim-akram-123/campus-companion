import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";
import { createVoucherFromInstallment, formatCurrency, fetchStudentInstallments, installmentBalance } from "@/lib/finance";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import type { FeeInstallment } from "@/lib/finance-types";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  financeScopeLabel,
  financeScopeProgramType,
  listFinanceAcademicSessions,
  resolveFinanceProgramScope,
} from "@/lib/finance-scope";

export const Route = createFileRoute("/_authenticated/finance/collect")({
  validateSearch: (s: Record<string, unknown>) => ({
    studentId: typeof s.studentId === "string" ? s.studentId : undefined,
    installmentId: typeof s.installmentId === "string" ? s.installmentId : undefined,
  }),
  component: FeeCollection,
});

function FeeCollection() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const financeScope = resolveFinanceProgramScope(roles);
  const programTypeFilter = financeScopeProgramType(financeScope);
  const { studentId, installmentId } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [sessionFilter, setSessionFilter] = useState("__active__");
  const [genderFilter, setGenderFilter] = useState("__all__");
  const [classFilter, setClassFilter] = useState("__all__");
  const [sectionFilter, setSectionFilter] = useState("__all__");
  const [selectedId, setSelectedId] = useState<string | null>(studentId ?? null);
  const [payInst, setPayInst] = useState<FeeInstallment | null>(null);
  const [autoOpenedInstallment, setAutoOpenedInstallment] = useState<string | null>(null);

  useEffect(() => {
    if (studentId) setSelectedId(studentId);
  }, [studentId]);

  const { data: sessions } = useQuery({
    queryKey: ["finance-academic-sessions", financeScope],
    queryFn: () => listFinanceAcademicSessions(financeScope),
  });

  const runningSessionIds = (sessions ?? []).filter((s) => s.is_active).map((s) => s.id);
  const effectiveSessionId =
    sessionFilter === "__active__"
      ? null
      : sessionFilter === "__all__"
        ? ""
        : sessionFilter;
  const filterRunningCohorts = sessionFilter === "__active__";

  const { data: classes } = useQuery({
    queryKey: ["collection-classes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name, year_level").order("year_level");
      if (error) throw error;
      return data ?? [];
    },
  });

  const classGroups = [...(classes ?? []).reduce((map, cls) => {
    const current = map.get(cls.name) ?? { name: cls.name, ids: [] as string[], yearLevel: Number(cls.year_level ?? 0) };
    current.ids.push(cls.id);
    map.set(cls.name, current);
    return map;
  }, new Map<string, { name: string; ids: string[]; yearLevel: number }>()).values()]
    .sort((a, b) => a.yearLevel - b.yearLevel || a.name.localeCompare(b.name));
  const selectedClassIds = classFilter === "__all__"
    ? []
    : classGroups.find((group) => group.name === classFilter)?.ids ?? [];

  const { data: sections } = useQuery({
    queryKey: [
      "collection-sections",
      sessionFilter,
      effectiveSessionId,
      runningSessionIds.join(","),
      classFilter,
      genderFilter,
    ],
    queryFn: async () => {
      let query = supabase
        .from("sections")
        .select("id, name, gender, class_id, classes(name)")
        .order("name");
      if (filterRunningCohorts) {
        if (!runningSessionIds.length) return [];
        query = query.in("session_id", runningSessionIds);
      } else if (effectiveSessionId) {
        query = query.eq("session_id", effectiveSessionId);
      }
      if (selectedClassIds.length) query = query.in("class_id", selectedClassIds);
      if (genderFilter !== "__all__") {
        query = query.eq("gender", genderFilter as "boys" | "girls");
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const hasFilters =
    filterRunningCohorts ||
    !!effectiveSessionId ||
    genderFilter !== "__all__" ||
    classFilter !== "__all__" ||
    sectionFilter !== "__all__";

  const { data: students } = useQuery({
    queryKey: [
      "students-search",
      financeScope,
      search,
      sessionFilter,
      effectiveSessionId,
      runningSessionIds.join(","),
      genderFilter,
      classFilter,
      sectionFilter,
    ],
    enabled: search.length >= 2 || hasFilters,
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select(
          "id, full_name, roll_number, programs!inner(name, type), classes(name), sections(name, gender), academic_sessions(label)",
        )
        .eq("status", "active")
        .order("full_name")
        .limit(50);
      if (programTypeFilter) {
        query = query.eq("programs.type", programTypeFilter);
      }
      if (filterRunningCohorts) {
        if (!runningSessionIds.length) return [];
        query = query.in("academic_session_id", runningSessionIds);
      } else if (effectiveSessionId) {
        query = query.eq("academic_session_id", effectiveSessionId);
      }
      if (genderFilter !== "__all__") query = query.eq("gender", genderFilter);
      if (selectedClassIds.length) query = query.in("class_id", selectedClassIds);
      if (sectionFilter !== "__all__") query = query.eq("section_id", sectionFilter);
      if (search.trim().length >= 2) {
        const term = search.trim().replaceAll(",", " ");
        query = query.or(`full_name.ilike.%${term}%,roll_number.ilike.%${term}%,father_name.ilike.%${term}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: installments, refetch } = useQuery({
    queryKey: ["finance-collect-installments", selectedId],
    enabled: !!selectedId,
    queryFn: () => fetchStudentInstallments(selectedId!),
  });

  const { data: selectedStudent } = useQuery({
    queryKey: ["finance-collect-student", selectedId, financeScope],
    enabled: !!selectedId,
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select(
          "id, full_name, roll_number, programs!inner(name, type), classes(name), sections(name, gender), academic_sessions(label)",
        )
        .eq("id", selectedId!);
      if (programTypeFilter) {
        query = query.eq("programs.type", programTypeFilter);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!installmentId || autoOpenedInstallment === installmentId || !installments?.length) return;
    const inst = installments.find((item) => item.id === installmentId);
    if (!inst || installmentBalance(inst) <= 0) return;
    setPayInst(inst);
    setAutoOpenedInstallment(installmentId);
  }, [autoOpenedInstallment, installmentId, installments]);

  const selected = selectedStudent ?? students?.find((s) => s.id === selectedId);

  const issueVoucher = async (inst: FeeInstallment) => {
    try {
      const v = await createVoucherFromInstallment(inst.id);
      toast.success(`Voucher ${v.voucher_number} created`);
      qc.invalidateQueries({ queryKey: ["fee-vouchers"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{financeScopeLabel(financeScope)} · Fee collection</h1>
        <p className="text-muted-foreground">Search student → record payment or issue voucher</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Find student</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Session</Label>
              <Select value={sessionFilter} onValueChange={(v) => { setSessionFilter(v); setSectionFilter("__all__"); setSelectedId(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__active__">All running cohorts</SelectItem>
                  <SelectItem value="__all__">All sessions</SelectItem>
                  {sessions?.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.label}{session.is_active ? " (running)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={genderFilter} onValueChange={(v) => { setGenderFilter(v); setSectionFilter("__all__"); setSelectedId(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All boys & girls</SelectItem>
                  <SelectItem value="boys">Boys</SelectItem>
                  <SelectItem value="girls">Girls</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setSectionFilter("__all__"); setSelectedId(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All classes</SelectItem>
                  {classGroups.map((group) => (
                    <SelectItem key={group.name} value={group.name}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Section</Label>
              <Select value={sectionFilter} onValueChange={(v) => { setSectionFilter(v); setSelectedId(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All sections</SelectItem>
                  {sections?.map((section) => {
                    const cls = section.classes as { name?: string } | null;
                    return (
                      <SelectItem key={section.id} value={section.id}>
                        {section.gender === "girls" ? "Girls" : "Boys"} - {section.name}{cls?.name ? ` · ${cls.name}` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Name, admission number, or father name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedId(null);
                setAutoOpenedInstallment(null);
              }}
            />
          </div>
          {students && (search.length >= 2 || hasFilters) && (
            <div className="divide-y rounded-md border">
              {students.length ? (
                students.map((s) => {
                  const cls = s.classes as { name?: string } | null;
                  const section = s.sections as { name?: string; gender?: string } | null;
                  const session = s.academic_sessions as { label?: string } | null;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`flex w-full items-center justify-between gap-4 p-3 text-left hover:bg-accent ${selectedId === s.id ? "bg-accent" : ""}`}
                      onClick={() => setSelectedId(s.id)}
                    >
                      <span>
                        <span className="font-medium">{s.full_name}</span>
                        <br />
                        <span className="text-xs text-muted-foreground">
                          {cls?.name ?? "No class"} · {section ? `${section.gender === "girls" ? "Girls" : "Boys"} - ${section.name}` : "No section"} · {session?.label ?? "No session"}
                        </span>
                      </span>
                      <span className="text-sm text-muted-foreground">{s.roll_number}</span>
                    </button>
                  );
                })
              ) : (
                <p className="p-3 text-sm text-muted-foreground">No students found for these filters.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedId && selected && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{selected.full_name}</CardTitle>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/students/$id" params={{ id: selectedId }}>Student profile</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Due</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installments?.map((inst) => {
                  const bal = installmentBalance(inst);
                  return (
                    <TableRow key={inst.id} className={inst.id === installmentId ? "bg-amber-50" : undefined}>
                      <TableCell>{inst.due_date}</TableCell>
                      <TableCell>{inst.label}</TableCell>
                      <TableCell className="text-right">{formatCurrency(bal)}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{inst.status}</Badge></TableCell>
                      <TableCell className="space-x-2 text-right">
                        {bal > 0 && (
                          <>
                            <Button size="sm" onClick={() => setPayInst(inst)}>Pay</Button>
                            <Button size="sm" variant="outline" onClick={() => issueVoucher(inst)}>Voucher</Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {payInst && selectedId && (
        <RecordPaymentDialog
          open={!!payInst}
          onOpenChange={(o) => !o && setPayInst(null)}
          studentId={selectedId}
          installment={payInst}
          onSuccess={() => refetch()}
        />
      )}

    </div>
  );
}
