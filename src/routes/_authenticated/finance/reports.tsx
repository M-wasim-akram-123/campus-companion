import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance/reports")({
  component: FinanceReports,
});

function fmtMonth(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function FinanceReports() {
  const monthly = useQuery({
    queryKey: ["fin-monthly"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_monthly_collection" as never)
        .select("*")
        .limit(12);
      if (error) throw error;
      return (data ?? []) as Array<{ month: string; payment_count: number; total_collected: number }>;
    },
  });

  const sections = useQuery({
    queryKey: ["fin-sections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_section_summary" as never)
        .select("*");
      if (error) throw error;
      return (data ?? []) as Array<{
        section_id: string; section_name: string; class_name: string; program_name: string;
        student_count: number; total_billed: number; total_collected: number; outstanding: number;
      }>;
    },
  });

  const defaulters = useQuery({
    queryKey: ["fin-defaulters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_defaulters" as never)
        .select("*")
        .order("overdue_amount", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Array<{
        student_id: string; full_name: string; roll_number: string; phone: string;
        guardian_phone: string; section_name: string; class_name: string; program_name: string;
        overdue_count: number; overdue_amount: number; earliest_due: string;
      }>;
    },
  });

  const upcoming = useQuery({
    queryKey: ["fin-upcoming"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_upcoming_month" as never)
        .select("*");
      if (error) throw error;
      return (data ?? []) as Array<{ month: string; installment_count: number; expected_amount: number }>;
    },
  });

  const totalRevenue = (monthly.data ?? []).reduce((s, m) => s + Number(m.total_collected), 0);
  const nextMonth = upcoming.data?.[1] ?? upcoming.data?.[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Finance reports</h1>
        <p className="text-muted-foreground">Revenue, section-wise collection, defaulters, and forecasts</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total revenue (12 mo)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">This month collected</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(Number(monthly.data?.[0]?.total_collected ?? 0))}</div></CardContent>
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
