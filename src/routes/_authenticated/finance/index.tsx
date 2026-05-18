import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchFinanceStats, formatCurrency } from "@/lib/finance";
import { Banknote, FileText, AlertTriangle, Receipt, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/")({
  component: FinanceDashboard,
});

function FinanceDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["finance-stats"],
    queryFn: fetchFinanceStats,
  });

  const tiles = [
    { label: "Collected today", value: formatCurrency(stats?.collectedToday ?? 0), icon: Banknote },
    { label: "Outstanding", value: formatCurrency(stats?.outstanding ?? 0), icon: Receipt },
    { label: "Overdue installments", value: String(stats?.overdueCount ?? "—"), icon: AlertTriangle },
    { label: "Open vouchers", value: String(stats?.openVouchers ?? "—"), icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Finance</h1>
          <p className="text-muted-foreground">Collections, vouchers, and fee reports</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/finance/collect"><Banknote className="mr-2 h-4 w-4" />Collect fee</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/finance/reports"><FileText className="mr-2 h-4 w-4" />Reports</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/finance/vouchers/new"><Plus className="mr-2 h-4 w-4" />Manual voucher</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t.label}</CardTitle>
              <t.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoading ? "…" : t.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Phase 1 — Collection</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Search a student and record cash or bank payments against installments.</p>
            <Button asChild size="sm" variant="secondary">
              <Link to="/finance/collect">Open fee collection</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Vouchers + QR</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Create manual challans or auto-issue from installments. Print with QR for verification.</p>
            <Button asChild size="sm" variant="secondary">
              <Link to="/finance/vouchers">All vouchers</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Dues & overdue</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Students with past-due installments.</p>
            <Button asChild size="sm" variant="secondary">
              <Link to="/finance/dues">View overdue list</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
