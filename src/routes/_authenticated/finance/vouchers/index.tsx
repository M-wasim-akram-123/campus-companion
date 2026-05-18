import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { formatCurrency } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance/vouchers/")({
  component: VouchersList,
});

function VouchersList() {
  const { data: vouchers, isLoading } = useQuery({
    queryKey: ["fee-vouchers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_vouchers")
        .select("*, students(full_name, roll_number)")
        .order("issued_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Fee vouchers</h1>
          <p className="text-muted-foreground">Manual and auto-generated challans with QR codes</p>
        </div>
        <Button asChild>
          <Link to="/finance/vouchers/new"><Plus className="mr-2 h-4 w-4" />New manual voucher</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !vouchers?.length ? (
            <p className="text-muted-foreground">No vouchers yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voucher #</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchers.map((v) => {
                  const st = v.students as { full_name?: string; roll_number?: string };
                  const bal = Math.max(0, Number(v.total_amount) - Number(v.paid_amount));
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-sm">{v.voucher_number}</TableCell>
                      <TableCell>{st?.full_name}<br /><span className="text-xs text-muted-foreground">{st?.roll_number}</span></TableCell>
                      <TableCell>{v.due_date}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(v.total_amount))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(bal)}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{v.status}</Badge></TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link to="/finance/vouchers/$id" params={{ id: v.id }}>View / Print</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
