import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  formatCurrency,
  generateBulkVouchers,
  previewBulkVouchers,
  type VoucherGeneratorParams,
  type VoucherGeneratorResult,
  type VoucherPaidFilter,
  type VoucherPreviewRow,
} from "@/lib/finance";
import { FEE_COMPONENTS, type FeeComponentType } from "@/lib/fees-types";
import { toast } from "sonner";
import { Eye, FileStack, Printer } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { listFinanceAcademicSessions, resolveFinanceProgramScope } from "@/lib/finance-scope";

export const Route = createFileRoute("/_authenticated/finance/bulk-vouchers")({
  component: BulkVouchersPage,
});

function BulkVouchersPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const financeScope = resolveFinanceProgramScope(roles);
  const [sessionId, setSessionId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [voucherDueDate, setVoucherDueDate] = useState("");
  const [installmentMonth, setInstallmentMonth] = useState("");
  const [selectedFeeHeads, setSelectedFeeHeads] = useState<FeeComponentType[]>(FEE_COMPONENTS.map((c) => c.key));
  const [paidFilter, setPaidFilter] = useState<VoucherPaidFilter>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [lateFeeAmount, setLateFeeAmount] = useState("");
  const [lateFeeLabel, setLateFeeLabel] = useState("Late fee");
  const [previewRows, setPreviewRows] = useState<VoucherPreviewRow[] | null>(null);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [result, setResult] = useState<VoucherGeneratorResult | null>(null);
  const [selectedPrintIds, setSelectedPrintIds] = useState<string[]>([]);

  const { data: sessions } = useQuery({
    queryKey: ["finance-academic-sessions", financeScope],
    queryFn: () => listFinanceAcademicSessions(financeScope),
  });

  const active = sessions?.find((s) => s.is_active);
  const sid = sessionId || active?.id || sessions?.[0]?.id || "";

  const { data: sections } = useQuery({
    queryKey: ["bulk-voucher-sections", sid],
    enabled: !!sid,
    queryFn: async () => {
      const { data: students } = await supabase
        .from("students")
        .select("section_id, sections(id, name, gender), classes(name), programs(name)")
        .eq("academic_session_id", sid)
        .eq("status", "active")
        .not("section_id", "is", null);
      const map = new Map<string, { id: string; label: string; count: number }>();
      for (const st of students ?? []) {
        const sec = st.sections as { id?: string; name?: string; gender?: string } | null;
        if (!sec?.id) continue;
        const label = `${sec.gender === "girls" ? "Girls" : "Boys"} - ${sec.name} · ${(st.classes as { name?: string })?.name ?? ""}`;
        const cur = map.get(sec.id) ?? { id: sec.id, label, count: 0 };
        cur.count += 1;
        map.set(sec.id, cur);
      }
      return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
    },
  });

  const params = useMemo<VoucherGeneratorParams>(() => ({
    sessionId: sid,
    voucherDueDate,
    sectionId: sectionId || undefined,
    feeHeads: selectedFeeHeads,
    installmentMonth: installmentMonth || undefined,
    paidFilter,
    overdueOnly,
    excludeOpenVouchers: true,
    lateFeeAmount: Number(lateFeeAmount) > 0 ? Number(lateFeeAmount) : undefined,
    lateFeeLabel: lateFeeLabel.trim() || undefined,
  }), [sid, voucherDueDate, sectionId, selectedFeeHeads, installmentMonth, paidFilter, overdueOnly, lateFeeAmount, lateFeeLabel]);

  const eligibleRows = (previewRows ?? []).filter((row) => !row.skippedReason);
  const skippedRows = (previewRows ?? []).filter((row) => row.skippedReason);
  const previewTotal = eligibleRows.reduce((sum, row) => sum + row.total, 0);
  const filteredEligibleRows = eligibleRows.filter((row) => {
    const term = previewSearch.trim().toLowerCase();
    if (!term) return true;
    return (
      (row.studentName ?? "").toLowerCase().includes(term) ||
      (row.rollNumber ?? "").toLowerCase().includes(term) ||
      (row.sectionLabel ?? "").toLowerCase().includes(term)
    );
  });
  const selectedPreviewRow = filteredEligibleRows[Math.min(previewIndex, Math.max(filteredEligibleRows.length - 1, 0))];
  const skippedReasonCounts = skippedRows.reduce<Record<string, number>>((counts, row) => {
    const reason = row.skippedReason ?? "Skipped";
    counts[reason] = (counts[reason] ?? 0) + 1;
    return counts;
  }, {});

  const resetOutput = () => {
    setPreviewRows(null);
    setPreviewIndex(0);
    setResult(null);
    setSelectedPrintIds([]);
  };

  const preview = useMutation({
    mutationFn: () => previewBulkVouchers(params),
    onSuccess: (rows) => {
      setPreviewRows(rows);
      setPreviewIndex(0);
      setResult(null);
      toast.success(`Preview ready: ${rows.filter((r) => !r.skippedReason).length} voucher(s) can be generated`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generate = useMutation({
    mutationFn: () => generateBulkVouchers(params, previewRows ?? undefined),
    onSuccess: (res) => {
      setResult(res);
      setPreviewRows(res.preview);
      setSelectedPrintIds(res.created.map((voucher) => voucher.id));
      if (res.created.length > 0) {
        toast.success(`Created ${res.created.length} voucher(s)`);
      } else if (res.errors.length > 0) {
        toast.error(`No vouchers created. ${res.errors.length} error(s) found.`);
      } else {
        toast.error("No vouchers created. The preview rows were skipped.");
      }
      qc.invalidateQueries({ queryKey: ["fee-vouchers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFeeHead = (component: FeeComponentType) => {
    setSelectedFeeHeads((current) =>
      current.includes(component) ? current.filter((item) => item !== component) : [...current, component],
    );
    resetOutput();
  };

  const printVouchers = (ids: string[]) => {
    if (!ids.length) {
      toast.error("Select at least one generated voucher to print.");
      return;
    }
    ids.forEach((id) => window.open(`/finance/vouchers/${id}`, "_blank", "noopener,noreferrer"));
  };

  const changePreviewIndex = (nextIndex: number) => {
    const lastIndex = Math.max(filteredEligibleRows.length - 1, 0);
    setPreviewIndex(Math.min(Math.max(nextIndex, 0), lastIndex));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Voucher generator</h1>
          <p className="text-muted-foreground">
            Preview selected unpaid fee heads, then save one auditable voucher per student.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/finance/vouchers">All vouchers</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileStack className="h-4 w-4" />
            Batch setup
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Session</Label>
            <Select value={sid} onValueChange={(v) => { setSessionId(v); setSectionId(""); resetOutput(); }}>
              <SelectTrigger><SelectValue placeholder="Session" /></SelectTrigger>
              <SelectContent>
                {sessions?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}{s.is_active ? " (running)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Section</Label>
            <Select value={sectionId || "__all__"} onValueChange={(v) => { setSectionId(v === "__all__" ? "" : v); resetOutput(); }}>
              <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All sections</SelectItem>
                {sections?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label} ({s.count} students)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Voucher due date <span className="text-destructive">*</span></Label>
            <Input type="date" value={voucherDueDate} onChange={(e) => { setVoucherDueDate(e.target.value); resetOutput(); }} />
            <p className="text-xs text-muted-foreground">Required. This due date is saved and printed on each voucher.</p>
          </div>
          <div className="space-y-2">
            <Label>Installment month</Label>
            <Input type="month" value={installmentMonth} onChange={(e) => { setInstallmentMonth(e.target.value); resetOutput(); }} />
            <p className="text-xs text-muted-foreground">Optional. Select a month to include only installments due in that month.</p>
          </div>
          <div className="space-y-2">
            <Label>Student payment status</Label>
            <Select value={paidFilter} onValueChange={(v) => { setPaidFilter(v as VoucherPaidFilter); resetOutput(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All students with selected balance</SelectItem>
                <SelectItem value="unpaid_only">Only students with 0 paid</SelectItem>
                <SelectItem value="under_20">Less than 20% paid</SelectItem>
                <SelectItem value="under_50">Less than 50% paid</SelectItem>
                <SelectItem value="partial_only">Partial paid only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 rounded-2xl border p-3">
            <div className="flex items-center gap-2">
              <Checkbox checked={overdueOnly} onCheckedChange={(checked) => { setOverdueOnly(checked === true); resetOutput(); }} />
              <Label>Only overdue installments</Label>
            </div>
            <p className="text-xs text-muted-foreground">When enabled, future installment due dates are skipped.</p>
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Fee heads</Label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => { setSelectedFeeHeads(FEE_COMPONENTS.map((c) => c.key)); resetOutput(); }}>Select all</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setSelectedFeeHeads([]); resetOutput(); }}>Clear</Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {FEE_COMPONENTS.map((component) => (
                <label key={component.key} className="flex cursor-pointer items-center gap-2 rounded-2xl border p-3 text-sm">
                  <Checkbox checked={selectedFeeHeads.includes(component.key)} onCheckedChange={() => toggleFeeHead(component.key)} />
                  {component.label}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Late fee amount</Label>
            <Input
              type="number"
              min={0}
              value={lateFeeAmount}
              onChange={(e) => { setLateFeeAmount(e.target.value); resetOutput(); }}
              placeholder="Optional"
            />
            <p className="text-xs text-muted-foreground">
              Applied only when the selected voucher due date is already past.
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Late fee label</Label>
            <Input
              value={lateFeeLabel}
              onChange={(e) => { setLateFeeLabel(e.target.value); resetOutput(); }}
              placeholder="Late fee"
            />
          </div>
        </CardContent>
        <CardContent className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button
            disabled={!sid || !voucherDueDate || !selectedFeeHeads.length || preview.isPending}
            variant="outline"
            onClick={() => preview.mutate()}
          >
            <Eye className="mr-2 h-4 w-4" />
            {preview.isPending ? "Preparing preview..." : "Preview vouchers"}
          </Button>
          <Button
            disabled={!previewRows || eligibleRows.length === 0 || generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? "Generating..." : `Generate ${eligibleRows.length || ""} voucher${eligibleRows.length === 1 ? "" : "s"}`}
          </Button>
          <p className="text-sm text-muted-foreground">
            Preview first, then generate. Existing open vouchers for selected installments are skipped.
          </p>
        </CardContent>
      </Card>

      {previewRows && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Preview: {eligibleRows.length} ready · {skippedRows.length} skipped · {formatCurrency(previewTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="w-full max-w-sm space-y-2">
                <Label>Find student voucher</Label>
                <Input
                  value={previewSearch}
                  onChange={(e) => {
                    setPreviewSearch(e.target.value);
                    setPreviewIndex(0);
                  }}
                  placeholder="Search name, roll no, or section"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={filteredEligibleRows.length <= 1 || previewIndex <= 0}
                  onClick={() => changePreviewIndex(previewIndex - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  {filteredEligibleRows.length ? Math.min(previewIndex + 1, filteredEligibleRows.length) : 0} / {filteredEligibleRows.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={filteredEligibleRows.length <= 1 || previewIndex >= filteredEligibleRows.length - 1}
                  onClick={() => changePreviewIndex(previewIndex + 1)}
                >
                  Next
                </Button>
              </div>
            </div>

            {selectedPreviewRow ? (
              <div className="mx-auto max-w-2xl rounded-2xl border bg-background p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Student voucher preview</p>
                    <h3 className="text-xl font-semibold">{selectedPreviewRow.studentName}</h3>
                    <p className="text-sm text-muted-foreground">
                      Roll no: {selectedPreviewRow.rollNumber || "-"} · {selectedPreviewRow.sectionLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Voucher due date</p>
                    <p className="font-semibold">{voucherDueDate}</p>
                    {installmentMonth && <p className="text-xs text-muted-foreground">Installment month: {installmentMonth}</p>}
                  </div>
                </div>

                <div className="space-y-3 py-4">
                  {selectedPreviewRow.lines.map((line) => (
                    <div key={line.installmentId} className="flex items-start justify-between gap-4 text-sm">
                      <div>
                        <p className="font-medium">{line.label}</p>
                        <p className="text-xs text-muted-foreground">Installment due {line.dueDate}</p>
                      </div>
                      <p className="font-medium">{formatCurrency(line.amount)}</p>
                    </div>
                  ))}
                  {selectedPreviewRow.lateFeeAmount > 0 && (
                    <div className="flex items-start justify-between gap-4 text-sm">
                      <div>
                        <p className="font-medium">{lateFeeLabel || "Late fee"}</p>
                        <p className="text-xs text-muted-foreground">Additional charge</p>
                      </div>
                      <p className="font-medium">{formatCurrency(selectedPreviewRow.lateFeeAmount)}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t pt-4">
                  <Badge>Ready to generate</Badge>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Total payable</p>
                    <p className="text-2xl font-bold">{formatCurrency(selectedPreviewRow.total)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">
                No ready vouchers match this search.
              </div>
            )}

            {skippedRows.length > 0 && (
              <div className="rounded-2xl border bg-muted/30 p-4">
                <p className="mb-2 text-sm font-medium">Skipped students summary</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(skippedReasonCounts).map(([reason, count]) => (
                    <Badge key={reason} variant="outline">{reason}: {count}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Result: {result.created.length} created · {result.skipped.length} skipped
              {result.errors.length > 0 && ` · ${result.errors.length} errors`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.created.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => printVouchers(result.created.map((v) => v.id))}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print all generated
                  </Button>
                  <Button type="button" variant="outline" onClick={() => printVouchers(selectedPrintIds)}>
                    Print selected
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setSelectedPrintIds(result.created.map((v) => v.id))}>Select all</Button>
                  <Button type="button" variant="ghost" onClick={() => setSelectedPrintIds([])}>Clear</Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead></TableHead>
                      <TableHead>Voucher no</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.created.map((v) => {
                      const st = v.students as { full_name?: string };
                      return (
                        <TableRow key={v.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedPrintIds.includes(v.id)}
                              onCheckedChange={(checked) => {
                                setSelectedPrintIds((current) =>
                                  checked === true ? [...new Set([...current, v.id])] : current.filter((id) => id !== v.id),
                                );
                              }}
                            />
                          </TableCell>
                          <TableCell className="font-mono">{v.voucher_number}</TableCell>
                          <TableCell>{st?.full_name}</TableCell>
                          <TableCell>{v.due_date}</TableCell>
                          <TableCell className="text-right">{formatCurrency(Number(v.total_amount))}</TableCell>
                          <TableCell>
                            <Button asChild size="sm" variant="outline">
                              <Link to="/finance/vouchers/$id" params={{ id: v.id }}>
                                <Printer className="mr-1 h-3 w-3" />
                                View / Print
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No new vouchers were created. Check skipped rows in the preview above.</p>
            )}
            {result.errors.length > 0 && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
                <p className="mb-2 text-sm font-semibold text-destructive">Errors</p>
                <div className="space-y-1 text-xs text-destructive">
                  {result.errors.slice(0, 8).map((error) => (
                    <p key={error.studentId}>{error.message}</p>
                  ))}
                  {result.errors.length > 8 && <p>And {result.errors.length - 8} more...</p>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
