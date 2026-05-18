import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";
import { formatCurrency, fetchStudentInstallments, installmentBalance } from "@/lib/finance";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import { createVoucherFromInstallment } from "@/lib/finance";
import type { FeeInstallment } from "@/lib/finance-types";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/finance/collect")({
  component: FeeCollection,
});

function FeeCollection() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [payInst, setPayInst] = useState<FeeInstallment | null>(null);

  const { data: students } = useQuery({
    queryKey: ["students-search", search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, roll_number, programs(name)")
        .or(`full_name.ilike.%${search}%,roll_number.ilike.%${search}%`)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: installments, refetch } = useQuery({
    queryKey: ["finance-collect-installments", selectedId],
    enabled: !!selectedId,
    queryFn: () => fetchStudentInstallments(selectedId!),
  });

  const selected = students?.find((s) => s.id === selectedId);

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
        <h1 className="text-3xl font-bold">Fee collection</h1>
        <p className="text-muted-foreground">Search student → record payment or issue voucher</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Find student</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Name or admission number…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedId(null);
              }}
            />
          </div>
          {students && search.length >= 2 && (
            <div className="divide-y rounded-md border">
              {students.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`flex w-full items-center justify-between p-3 text-left hover:bg-accent ${selectedId === s.id ? "bg-accent" : ""}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="font-medium">{s.full_name}</span>
                  <span className="text-sm text-muted-foreground">{s.roll_number}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedId && selected && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{selected.full_name}</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link to="/students/$id" params={{ id: selectedId }}>Student profile</Link>
            </Button>
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
                    <TableRow key={inst.id}>
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
