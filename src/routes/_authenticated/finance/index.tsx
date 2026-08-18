import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchSessionRevenueAnalytics } from "@/lib/finance-analytics";
import { fetchRollNoSlipPendingRecoveries } from "@/lib/roll-no-slips";
import {
  approveCashierSession,
  closeCashierSession,
  fetchOpenCashierSession,
  fetchRecentCashierSessions,
  formatCurrency,
  openCashierSession,
} from "@/lib/finance";
import { AlertCircle, Banknote, FileStack, QrCode, Plus, TrendingUp } from "lucide-react";
import { SessionBudgetCard } from "@/components/finance/SessionBudgetCard";
import { CampusInchargeCollectionChart } from "@/components/finance/CampusInchargeCollectionChart";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  financeScopeLabel,
  listFinanceAcademicSessions,
  resolveFinanceProgramScope,
} from "@/lib/finance-scope";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const SHOW_CASHIER_DRAWER_UI = false;

export const Route = createFileRoute("/_authenticated/finance/")({
  component: FinanceDashboard,
});

const FINANCE_CHART = {
  collected: "#2563eb",
  collectedLight: "#38bdf8",
  expected: "#f59e0b",
  expectedLight: "#fde68a",
  grid: "#dbeafe",
  axis: "#64748b",
  tooltipBg: "rgba(255,255,255,0.96)",
  tooltipBorder: "#bfdbfe",
};

const tooltipStyle = {
  backgroundColor: FINANCE_CHART.tooltipBg,
  border: `1px solid ${FINANCE_CHART.tooltipBorder}`,
  borderRadius: 14,
  boxShadow: "0 16px 40px rgba(37, 99, 235, 0.14)",
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return "Unknown error";
}

function MiniCashStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "danger" }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${tone === "danger" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function FinanceDashboard() {
  const qc = useQueryClient();
  const { hasAnyRole, roles } = useAuth();
  const financeScope = resolveFinanceProgramScope(roles);
  const [openingCash, setOpeningCash] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [cashierNotes, setCashierNotes] = useState("");
  const [signoffNotes, setSignoffNotes] = useState("");
  const { data: sessions } = useQuery({
    queryKey: ["finance-academic-sessions", financeScope],
    queryFn: () => listFinanceAcademicSessions(financeScope),
  });

  const active = sessions?.find((s) => s.is_active);
  const [sessionId, setSessionId] = useState("");

  const sid = sessionId || active?.id || sessions?.[0]?.id || "";

  const { data: rev, isLoading, error: revenueError } = useQuery({
    queryKey: ["session-revenue", sid],
    enabled: !!sid,
    queryFn: () => fetchSessionRevenueAnalytics(sid),
  });

  const { data: cashierSession } = useQuery({
    queryKey: ["open-cashier-session"],
    queryFn: fetchOpenCashierSession,
    enabled: SHOW_CASHIER_DRAWER_UI,
  });

  const { data: cashierSessions } = useQuery({
    queryKey: ["recent-cashier-sessions"],
    queryFn: () => fetchRecentCashierSessions(20),
    enabled: SHOW_CASHIER_DRAWER_UI,
  });

  const { data: slipRecoveries } = useQuery({
    queryKey: ["roll-slip-pending-recoveries"],
    queryFn: fetchRollNoSlipPendingRecoveries,
  });

  const chartCollected = rev?.monthlyCollected.map((m) => ({
    name: m.label,
    collected: m.amount,
    expected: rev.monthlyExpected.find((e) => e.month === m.month)?.amount ?? 0,
  })) ?? [];

  const chartUpcoming = rev?.monthlyExpected.map((m) => ({
    name: m.label,
    expected: m.amount,
  })) ?? [];

  const pctCollected =
    rev && rev.totalPayable > 0 ? Math.round((rev.totalCollected / rev.totalPayable) * 100) : 0;

  const startCashierSession = async () => {
    try {
      await openCashierSession(Number(openingCash) || 0, cashierNotes.trim() || undefined);
      setOpeningCash("");
      setCashierNotes("");
      toast.success("Cashier session opened");
      qc.invalidateQueries({ queryKey: ["open-cashier-session"] });
      qc.invalidateQueries({ queryKey: ["recent-cashier-sessions"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to open cashier session");
    }
  };

  const finishCashierSession = async () => {
    if (!cashierSession) return;
    try {
      await closeCashierSession(cashierSession.id, Number(countedCash) || 0, cashierNotes.trim() || undefined);
      setCountedCash("");
      setCashierNotes("");
      toast.success("Cashier session closed");
      qc.invalidateQueries({ queryKey: ["open-cashier-session"] });
      qc.invalidateQueries({ queryKey: ["recent-cashier-sessions"] });
      qc.invalidateQueries({ queryKey: ["session-revenue"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to close cashier session");
    }
  };

  const signOffSession = async (id: string) => {
    try {
      await approveCashierSession(id, signoffNotes.trim() || undefined);
      setSignoffNotes("");
      toast.success("Cashier session signed off");
      qc.invalidateQueries({ queryKey: ["recent-cashier-sessions"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to sign off cashier session");
    }
  };

  const currentCashCollected = Number(cashierSession?.expected_cash ?? 0);
  const currentExpectedDrawerCash = Number(cashierSession?.opening_cash ?? 0) + currentCashCollected;
  const countedCashNumber = Number(countedCash) || 0;
  const closingVariance = cashierSession ? countedCashNumber - currentExpectedDrawerCash : 0;
  const canSignOffCashiers = hasAnyRole([
    "super_admin",
    "finance_admin",
    "finance_officer",
    "bs_finance_admin",
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{financeScopeLabel(financeScope)}</h1>
          <p className="text-muted-foreground">
            All income from students — synced from installments & cashier receipts
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link to="/finance/scan"><QrCode className="mr-2 h-4 w-4" />Scan voucher (cashier)</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/finance/collect"><Banknote className="mr-2 h-4 w-4" />Collect fee</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/finance/vouchers/new"><Plus className="mr-2 h-4 w-4" />Manual voucher</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/finance/bulk-vouchers"><FileStack className="mr-2 h-4 w-4" />Bulk vouchers</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/finance/dues"><AlertCircle className="mr-2 h-4 w-4" />Overdue follow-up</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/students/roll-no-slips">Roll no slips</Link>
          </Button>
        </div>
      </div>

      {(slipRecoveries?.count ?? 0) > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Roll slip pending recoveries</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-2xl font-bold text-amber-800">
                {formatCurrency(slipRecoveries?.totalAmount ?? 0)}
              </p>
              <p className="text-sm text-muted-foreground">
                {slipRecoveries?.count ?? 0} student(s) received roll no slips with unpaid dues
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/students/roll-no-slips">Open roll no slip report</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Academic session</p>
          <Select value={sid} onValueChange={setSessionId}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select session" /></SelectTrigger>
            <SelectContent>
              {sessions?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}{s.is_active ? " (running)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {rev && (
          <p className="text-sm text-muted-foreground">
            {rev.studentCount} active students · {pctCollected}% collected of total payable
          </p>
        )}
      </div>

      {revenueError ? (
        <Card className="border-destructive">
          <CardContent className="p-6 text-sm text-destructive">
            Could not load finance revenue data: {errorMessage(revenueError)}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <p className="text-muted-foreground">Loading revenue data…</p>
      ) : rev ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total estimated (payable)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(rev.totalPayable)}</div>
                <p className="text-xs text-muted-foreground">
                  All session students · received + outstanding + bad debt
                  {rev.ledgerSummary.waivers > 0 ? " + waivers" : ""} = estimated
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total received</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-700">{formatCurrency(rev.totalCollected)}</div>
                <p className="text-xs text-muted-foreground">All recorded fee payments this session</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-700">{formatCurrency(rev.totalOutstanding)}</div>
                <p className="text-xs text-muted-foreground">Collectible dues only (excludes bad debt)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">This month collected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(rev.collectedThisMonth)}</div>
              </CardContent>
            </Card>
          </div>

          {(rev.years.length > 0 || rev.yearEndCloses.length > 0) && (
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Academic year breakdown</h2>
                <p className="text-sm text-muted-foreground">
                  Closed years show 30 June snapshot · arrears remain collectible · received + outstanding + bad debt = estimated
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {rev.years.map((year) => (
                  <Card key={year.academicYearStart} className={year.isClosed ? "border-slate-300" : "border-primary/30"}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">
                          Year {year.feeCycle} · {year.label}
                        </CardTitle>
                        <Badge variant={year.isClosed ? "secondary" : "default"}>
                          {year.isClosed ? "Closed 30 Jun" : "Current"}
                        </Badge>
                      </div>
                      {year.isClosed && year.closedAt && (
                        <p className="text-xs text-muted-foreground">
                          Snapshot {new Date(year.closedAt).toLocaleDateString()}
                        </p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Estimated</span>
                        <span className="font-semibold">{formatCurrency(year.totalPayable)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Received</span>
                        <span className="font-semibold text-green-700">{formatCurrency(year.totalCollected)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {year.isClosed ? "Outstanding at close" : "Outstanding"}
                        </span>
                        <span className="font-semibold text-amber-700">{formatCurrency(year.totalOutstanding)}</span>
                      </div>
                      {year.isClosed && (year.arrears ?? 0) > 0 && (
                        <div className="flex justify-between rounded-lg bg-amber-500/10 px-2 py-1">
                          <span className="text-amber-800">Live arrears</span>
                          <span className="font-semibold text-amber-800">{formatCurrency(year.arrears ?? 0)}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                <Card className="border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Session total</CardTitle>
                    <p className="text-xs text-muted-foreground">Live across all years</p>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Estimated</span>
                      <span className="font-semibold">{formatCurrency(rev.sessionTotal.payable)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Received</span>
                      <span className="font-semibold text-green-700">{formatCurrency(rev.sessionTotal.collected)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Outstanding</span>
                      <span className="font-semibold text-amber-700">{formatCurrency(rev.sessionTotal.outstanding)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Fines charged</CardTitle>
              </CardHeader>
              <CardContent><div className="text-xl font-bold">{formatCurrency(rev.ledgerSummary.fines)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Late fees</CardTitle>
              </CardHeader>
              <CardContent><div className="text-xl font-bold">{formatCurrency(rev.ledgerSummary.lateFees)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Adjustments</CardTitle>
              </CardHeader>
              <CardContent><div className="text-xl font-bold">{formatCurrency(rev.ledgerSummary.adjustments)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Waivers</CardTitle>
              </CardHeader>
              <CardContent><div className="text-xl font-bold">{formatCurrency(rev.ledgerSummary.waivers)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Bad debt marked</CardTitle>
              </CardHeader>
              <CardContent><div className="text-xl font-bold">{formatCurrency(rev.ledgerSummary.badDebt)}</div></CardContent>
            </Card>
          </div>

          {SHOW_CASHIER_DRAWER_UI && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="text-base">Cashier drawer control</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cashierSession ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-xl border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Opened</p>
                      <p className="text-sm font-medium">{new Date(cashierSession.opened_at).toLocaleString()}</p>
                    </div>
                    <MiniCashStat label="Opening cash" value={formatCurrency(Number(cashierSession.opening_cash ?? 0))} />
                    <MiniCashStat label="Cash collected" value={formatCurrency(currentCashCollected)} />
                    <MiniCashStat label="Expected drawer cash" value={formatCurrency(currentExpectedDrawerCash)} />
                    <MiniCashStat label="Variance preview" value={formatCurrency(closingVariance)} tone={closingVariance === 0 ? "default" : "danger"} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                    <div className="space-y-2">
                      <Label>Counted cash at closing</Label>
                      <Input type="number" min={0} value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Closing notes</Label>
                      <Input value={cashierNotes} onChange={(e) => setCashierNotes(e.target.value)} placeholder="Variance reason / shift note" />
                    </div>
                    <Button onClick={finishCashierSession}>Close cashier session</Button>
                  </div>
                </>
              ) : (
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <div className="space-y-2">
                    <Label>Opening cash</Label>
                    <Input type="number" min={0} value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Opening notes</Label>
                    <Input value={cashierNotes} onChange={(e) => setCashierNotes(e.target.value)} placeholder="Optional shift note" />
                  </div>
                  <Button onClick={startCashierSession}>Open cashier session</Button>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {SHOW_CASHIER_DRAWER_UI && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent cashier sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Opened</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Cash collected</TableHead>
                    <TableHead className="text-right">Expected drawer</TableHead>
                    <TableHead className="text-right">Counted</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Signoff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(cashierSessions ?? []).map((session) => {
                    const cashCollected = Number(session.expected_cash ?? 0);
                    const expectedDrawer = Number(session.opening_cash ?? 0) + cashCollected;
                    const signedOff = !!session.approved_at;
                    return (
                      <TableRow key={session.id}>
                        <TableCell className="text-sm">{new Date(session.opened_at).toLocaleString()}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{session.status}</Badge></TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(session.opening_cash ?? 0))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(cashCollected)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(expectedDrawer)}</TableCell>
                        <TableCell className="text-right">{session.counted_cash == null ? "-" : formatCurrency(Number(session.counted_cash))}</TableCell>
                        <TableCell className="text-right">{session.variance == null ? "-" : formatCurrency(Number(session.variance))}</TableCell>
                        <TableCell>
                          {signedOff ? (
                            <Badge>Signed off</Badge>
                          ) : session.status === "closed" && canSignOffCashiers ? (
                            <div className="flex min-w-[220px] gap-2">
                              <Input
                                value={signoffNotes}
                                onChange={(e) => setSignoffNotes(e.target.value)}
                                placeholder="Signoff notes"
                              />
                              <Button size="sm" onClick={() => signOffSession(session.id)}>Sign off</Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Pending close</span>
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

          <SessionBudgetCard sessionId={sid} rev={rev} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" />
                Revenue by fee component
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead className="text-right">Billed (installments)</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rev.componentEstimates.map((c) => (
                    <TableRow key={c.key}>
                      <TableCell>{c.label}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.estimated)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.collected)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.estimated - c.collected)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Month-wise collection (received)</CardTitle></CardHeader>
              <CardContent className="h-72">
                {chartCollected.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartCollected} barGap={6} barCategoryGap="24%">
                      <defs>
                        <linearGradient id="financeCollectedGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={FINANCE_CHART.collectedLight} />
                          <stop offset="100%" stopColor={FINANCE_CHART.collected} />
                        </linearGradient>
                        <linearGradient id="financeExpectedGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={FINANCE_CHART.expectedLight} />
                          <stop offset="100%" stopColor={FINANCE_CHART.expected} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={FINANCE_CHART.grid} strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: FINANCE_CHART.axis }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: FINANCE_CHART.axis }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: number) => formatCurrency(v)}
                        contentStyle={tooltipStyle}
                        cursor={{ fill: "rgba(37, 99, 235, 0.06)" }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Bar dataKey="collected" name="Collected" fill="url(#financeCollectedGradient)" radius={[10, 10, 0, 0]} />
                      <Bar dataKey="expected" name="Expected" fill="url(#financeExpectedGradient)" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Upcoming collections (by due month)</CardTitle></CardHeader>
              <CardContent className="h-72">
                {chartUpcoming.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartUpcoming} barCategoryGap="30%">
                      <defs>
                        <linearGradient id="financeUpcomingGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fbbf24" />
                          <stop offset="100%" stopColor="#f97316" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={FINANCE_CHART.grid} strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: FINANCE_CHART.axis }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: FINANCE_CHART.axis }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: number) => formatCurrency(v)}
                        contentStyle={tooltipStyle}
                        cursor={{ fill: "rgba(249, 115, 22, 0.07)" }}
                      />
                      <Bar dataKey="expected" name="Expected due" fill="url(#financeUpcomingGradient)" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">No upcoming dues.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {hasAnyRole(["super_admin", "finance_admin", "finance_officer"]) && (
            <CampusInchargeCollectionChart sessionId={sid} months={12} />
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Section-wise report</CardTitle>
              <Button asChild variant="outline" size="sm">
                <Link to="/finance/reports">Full reports</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead>Program</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                    <TableHead className="text-right">Payable</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rev.sectionSummary.map((s) => (
                    <TableRow key={s.sectionId}>
                      <TableCell>{s.sectionName}</TableCell>
                      <TableCell>{s.programName}</TableCell>
                      <TableCell className="text-right">{s.students}</TableCell>
                      <TableCell className="text-right">{formatCurrency(s.payable)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(s.collected)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(s.outstanding)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-muted-foreground">Select a session to view revenue.</p>
      )}
    </div>
  );
}
