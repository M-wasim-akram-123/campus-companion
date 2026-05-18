import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { fetchOverdueInstallments, formatCurrency, installmentBalance } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance/dues")({
  component: OverdueDues,
});

function OverdueDues() {
  const { data: rows, isLoading } = useQuery({
    queryKey: ["finance-overdue"],
    queryFn: fetchOverdueInstallments,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Overdue dues</h1>
        <p className="text-muted-foreground">Installments past due date with remaining balance</p>
      </div>
      <Card>
        <CardHeader><CardTitle>{rows?.length ?? 0} overdue</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !rows?.length ? (
            <p className="text-muted-foreground">No overdue installments.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Adm no.</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const st = r.students as { full_name?: string; roll_number?: string; programs?: { name?: string } };
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{st?.full_name}</TableCell>
                      <TableCell>{st?.roll_number}</TableCell>
                      <TableCell>{r.due_date}</TableCell>
                      <TableCell>{r.label}</TableCell>
                      <TableCell className="text-right">{formatCurrency(installmentBalance(r))}</TableCell>
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link to="/finance/collect">Collect</Link>
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
