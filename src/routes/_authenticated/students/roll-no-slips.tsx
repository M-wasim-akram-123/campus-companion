import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/finance";
import {
  approveRollNoSlipRequest,
  canAccessRollNoSlips,
  canApproveRollNoSlipRequests,
  canReleaseRollNoSlip,
  canRequestRollNoSlipException,
  createRollNoSlipRequest,
  exportRollNoSlipReport,
  fetchRollNoSlipRows,
  filterRollNoSlipRows,
  rejectRollNoSlipRequest,
  releaseRollNoSlip,
  ROLL_SLIP_CATEGORY_LABELS,
  type RollNoSlipEligibilityCategory,
  type RollNoSlipStudentRow,
} from "@/lib/roll-no-slips";
import { Check, Download, FileWarning, Search, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/students/roll-no-slips")({
  component: RollNoSlipsPage,
});

const CATEGORY_BADGE: Record<RollNoSlipEligibilityCategory, "default" | "secondary" | "destructive" | "outline"> = {
  eligible: "default",
  not_eligible: "destructive",
  pending_approval: "secondary",
  approved_exception: "outline",
  released_with_dues: "destructive",
};

function RollNoSlipsPage() {
  const navigate = useNavigate();
  const { roles, loading } = useAuth();
  const allowed = canAccessRollNoSlips(roles);

  useEffect(() => {
    if (!loading && !allowed) navigate({ to: "/students" });
  }, [loading, allowed, navigate]);

  if (loading || !allowed) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  return <RollNoSlipsContent roles={roles} />;
}

function RollNoSlipsContent({ roles }: { roles: import("@/hooks/use-auth").AppRole[] }) {
  const qc = useQueryClient();
  const canApprove = canApproveRollNoSlipRequests(roles);
  const canRequest = canRequestRollNoSlipException(roles);
  const canRelease = canReleaseRollNoSlip(roles);

  const [sessionScope, setSessionScope] = useState<"active" | "all" | string>("active");
  const [programId, setProgramId] = useState("__all__");
  const [classId, setClassId] = useState("__all__");
  const [sectionId, setSectionId] = useState("__all__");
  const [genderFilter, setGenderFilter] = useState<"__all__" | "boys" | "girls">("__all__");
  const [yearLevel, setYearLevel] = useState("__all__");
  const [categoryTab, setCategoryTab] = useState<RollNoSlipEligibilityCategory | "__all__">("__all__");
  const [search, setSearch] = useState("");

  const [requestRow, setRequestRow] = useState<RollNoSlipStudentRow | null>(null);
  const [guarantorName, setGuarantorName] = useState("");
  const [guarantorPhone, setGuarantorPhone] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [reason, setReason] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approvalRow, setApprovalRow] = useState<RollNoSlipStudentRow | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () =>
      (await supabase.from("academic_sessions").select("*").order("start_year", { ascending: false })).data ?? [],
  });

  const active = sessions?.find((s) => s.is_active);
  const filterSessionId =
    sessionScope === "all" ? undefined : sessionScope === "active" ? active?.id : sessionScope;

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["roll-no-slips", filterSessionId ?? "all"],
    queryFn: () => fetchRollNoSlipRows(filterSessionId),
  });

  const filterOptions = useMemo(() => {
    const programs = new Map<string, string>();
    const classes = new Map<string, string>();
    const sections = new Map<string, string>();
    const years = new Set<number>();

    for (const row of rows ?? []) {
      if (row.programId) programs.set(row.programId, row.program);
      if (row.classId) classes.set(row.classId, row.className);
      if (row.sectionId) sections.set(row.sectionId, row.section);
      if (row.yearLevel != null) years.add(row.yearLevel);
    }

    return {
      programs: [...programs.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      classes: [...classes.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      sections: [...sections.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      years: [...years].sort((a, b) => a - b),
    };
  }, [rows]);

  const filtered = useMemo(
    () =>
      filterRollNoSlipRows(rows ?? [], {
        sessionId: filterSessionId,
        programId: programId === "__all__" ? undefined : programId,
        classId: classId === "__all__" ? undefined : classId,
        sectionId: sectionId === "__all__" ? undefined : sectionId,
        gender: genderFilter === "__all__" ? undefined : genderFilter,
        yearLevel: yearLevel === "__all__" ? undefined : Number(yearLevel),
        category: categoryTab,
        search,
      }),
    [rows, filterSessionId, programId, classId, sectionId, genderFilter, yearLevel, categoryTab, search],
  );

  const stats = useMemo(() => {
    const base = rows ?? [];
    return {
      eligible: base.filter((r) => r.category === "eligible").length,
      notEligible: base.filter((r) => r.category === "not_eligible").length,
      pending: base.filter((r) => r.category === "pending_approval").length,
      approved: base.filter((r) => r.category === "approved_exception").length,
      released: base.filter((r) => r.category === "released_with_dues").length,
    };
  }, [rows]);

  const pendingApprovals = useMemo(
    () => (rows ?? []).filter((r) => r.category === "pending_approval"),
    [rows],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["roll-no-slips"] });
    qc.invalidateQueries({ queryKey: ["roll-slip-pending-recoveries"] });
  };

  const openRequestDialog = (row: RollNoSlipStudentRow) => {
    setRequestRow(row);
    setGuarantorName(row.fatherName !== "—" ? row.fatherName : "");
    setGuarantorPhone(row.guardianPhone || row.phone);
    setPromisedDate("");
    setReason("");
  };

  const submitRequest = async () => {
    if (!requestRow) return;
    if (!guarantorName.trim()) return toast.error("Guarantor name is required.");
    setSaving(true);
    try {
      await createRollNoSlipRequest({
        studentId: requestRow.studentId,
        academicSessionId: requestRow.sessionId || null,
        classId: requestRow.classId || null,
        sectionId: requestRow.sectionId || null,
        outstandingAmount: requestRow.totalBalance,
        guarantorName,
        guarantorPhone,
        promisedPaymentDate: promisedDate || undefined,
        reason,
      });
      toast.success("Exception request submitted for Super Admin approval.");
      setRequestRow(null);
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
    }
  };

  const submitApproval = async (approve: boolean) => {
    if (!approvalRow?.request) return;
    setSaving(true);
    try {
      if (approve) {
        await approveRollNoSlipRequest(
          approvalRow.request.id,
          approvalNotes,
          approvalRow.totalBalance,
        );
        toast.success("Request approved. Registrar may now release the roll no slip.");
      } else {
        await rejectRollNoSlipRequest(approvalRow.request.id, approvalNotes);
        toast.success("Request rejected.");
      }
      setApprovalRow(null);
      setApprovalNotes("");
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setSaving(false);
    }
  };

  const markReleased = async (row: RollNoSlipStudentRow) => {
    if (!row.request) return;
    setSaving(true);
    try {
      await releaseRollNoSlip(row.request.id);
      toast.success("Roll no slip marked as released.");
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Release failed");
    } finally {
      setSaving(false);
    }
  };

  const exportReport = () => {
    if (!filtered.length) return toast.error("No students to export.");
    const totalUnpaid = filtered.reduce((sum, row) => sum + row.totalBalance, 0);
    exportRollNoSlipReport(filtered);
    toast.success(
      `Exported ${filtered.length} students — total unpaid ${formatCurrency(totalUnpaid)}`,
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Roll no slip clearance</h1>
          <p className="text-muted-foreground">
            Students with cleared fees are eligible for board roll no slips. Unpaid students need Super
            Admin approval before release.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!filtered.length} onClick={exportReport}>
            <Download className="mr-2 h-4 w-4" />
            Export report
          </Button>
          <Button asChild variant="outline">
            <Link to="/finance">Finance dashboard</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Eligible</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-700">{stats.eligible}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Not eligible</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{stats.notEligible}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pending approval</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Approved exceptions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.approved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Released with dues</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-700">{stats.released}</p>
          </CardContent>
        </Card>
      </div>

      {canApprove && pendingApprovals.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileWarning className="h-5 w-5 text-amber-700" />
              Pending Super Admin approvals ({pendingApprovals.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingApprovals.map((row) => (
              <div
                key={row.studentId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3"
              >
                <div>
                  <p className="font-medium">
                    {row.fullName} · {row.rollNumber}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Unpaid {formatCurrency(row.totalBalance)} · Guarantor: {row.request?.guarantor_name}
                    {row.request?.promised_payment_date
                      ? ` · Pay by ${row.request.promised_payment_date}`
                      : ""}
                  </p>
                  {row.request?.reason && (
                    <p className="text-xs text-muted-foreground">{row.request.reason}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setApprovalRow(row)}>
                    Review
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Session</Label>
            <Select value={sessionScope} onValueChange={setSessionScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active session</SelectItem>
                <SelectItem value="all">All sessions</SelectItem>
                {(sessions ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Program</Label>
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger><SelectValue placeholder="All programs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All programs</SelectItem>
                {filterOptions.programs.map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All classes</SelectItem>
                {filterOptions.classes.map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Section</Label>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All sections</SelectItem>
                {filterOptions.sections.map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Gender</Label>
            <Select value={genderFilter} onValueChange={(v) => setGenderFilter(v as typeof genderFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                <SelectItem value="boys">Boys</SelectItem>
                <SelectItem value="girls">Girls</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Year level</Label>
            <Select value={yearLevel} onValueChange={setYearLevel}>
              <SelectTrigger><SelectValue placeholder="All years" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All years</SelectItem>
                {filterOptions.years.map((y) => (
                  <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Name, admission no, father name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={categoryTab} onValueChange={(v) => setCategoryTab(v as typeof categoryTab)}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="__all__">All ({rows?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="eligible">Eligible ({stats.eligible})</TabsTrigger>
          <TabsTrigger value="not_eligible">Not eligible ({stats.notEligible})</TabsTrigger>
          <TabsTrigger value="pending_approval">Pending ({stats.pending})</TabsTrigger>
          <TabsTrigger value="approved_exception">Approved ({stats.approved})</TabsTrigger>
          <TabsTrigger value="released_with_dues">Released dues ({stats.released})</TabsTrigger>
        </TabsList>

        <TabsContent value={categoryTab} className="mt-4">
          <Card>
            {isLoading ? (
              <CardContent className="p-8 text-center text-muted-foreground">Loading…</CardContent>
            ) : error ? (
              <CardContent className="p-8 text-center text-destructive">
                {error instanceof Error ? error.message : "Failed to load"}
              </CardContent>
            ) : !filtered.length ? (
              <CardContent className="p-8 text-center text-muted-foreground">
                No students match these filters.
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Adm No.</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class / Section</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead className="text-right">Unpaid</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Guarantor / approval</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell className="font-mono text-xs">{row.rollNumber}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.fullName}</div>
                        <div className="text-xs text-muted-foreground">{row.fatherName}</div>
                      </TableCell>
                      <TableCell>
                        <div>{row.className}</div>
                        <div className="text-xs text-muted-foreground">{row.section}</div>
                      </TableCell>
                      <TableCell>{row.sessionLabel}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {row.totalBalance > 0 ? formatCurrency(row.totalBalance) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={CATEGORY_BADGE[row.category]}>
                          {ROLL_SLIP_CATEGORY_LABELS[row.category]}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                        {row.request ? (
                          <div className="space-y-1">
                            <div>Guarantor: {row.request.guarantor_name}</div>
                            {row.request.promised_payment_date && (
                              <div>Pay by: {row.request.promised_payment_date}</div>
                            )}
                            {row.approvedByName && <div>Approved by: {row.approvedByName}</div>}
                            {row.releasedByName && (
                              <div>
                                Released by: {row.releasedByName}
                                {row.request.released_at
                                  ? ` (${row.request.released_at.slice(0, 10)})`
                                  : ""}
                              </div>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {canRequest &&
                            row.category === "not_eligible" &&
                            !row.request && (
                              <Button size="sm" variant="outline" onClick={() => openRequestDialog(row)}>
                                Request approval
                              </Button>
                            )}
                          {canApprove && row.category === "pending_approval" && (
                            <Button size="sm" variant="outline" onClick={() => setApprovalRow(row)}>
                              Review
                            </Button>
                          )}
                          {canRelease &&
                            row.category === "approved_exception" &&
                            row.request && (
                              <Button
                                size="sm"
                                disabled={saving}
                                onClick={() => markReleased(row)}
                              >
                                Mark released
                              </Button>
                            )}
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/students/$id" params={{ id: row.studentId }}>
                              Profile
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!requestRow} onOpenChange={(open) => !open && setRequestRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request roll no slip exception</DialogTitle>
          </DialogHeader>
          {requestRow && (
            <div className="space-y-3 text-sm">
              <p>
                <strong>{requestRow.fullName}</strong> ({requestRow.rollNumber}) has unpaid fees of{" "}
                <strong>{formatCurrency(requestRow.totalBalance)}</strong>. This request goes to Super
                Admin for approval.
              </p>
              <div className="space-y-1">
                <Label>Guarantor name *</Label>
                <Input value={guarantorName} onChange={(e) => setGuarantorName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Guarantor phone</Label>
                <Input value={guarantorPhone} onChange={(e) => setGuarantorPhone(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Promised payment date</Label>
                <Input type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Reason / notes</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestRow(null)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={submitRequest}>
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!approvalRow} onOpenChange={(open) => !open && setApprovalRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review exception request</DialogTitle>
          </DialogHeader>
          {approvalRow && (
            <div className="space-y-3 text-sm">
              <p>
                <strong>{approvalRow.fullName}</strong> · {approvalRow.rollNumber} ·{" "}
                {approvalRow.className} · {approvalRow.section}
              </p>
              <p>
                Outstanding: <strong>{formatCurrency(approvalRow.totalBalance)}</strong>
              </p>
              <p>Guarantor: {approvalRow.request?.guarantor_name}</p>
              {approvalRow.request?.promised_payment_date && (
                <p>Promised payment: {approvalRow.request.promised_payment_date}</p>
              )}
              {approvalRow.request?.reason && <p>Reason: {approvalRow.request.reason}</p>}
              {approvalRow.unpaidLines.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                  {approvalRow.unpaidLines.join(" · ")}
                </div>
              )}
              <div className="space-y-1">
                <Label>Approval / rejection notes</Label>
                <Textarea value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={saving} onClick={() => submitApproval(false)}>
              <X className="mr-2 h-4 w-4" />
              Reject
            </Button>
            <Button disabled={saving} onClick={() => submitApproval(true)}>
              <Check className="mr-2 h-4 w-4" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
