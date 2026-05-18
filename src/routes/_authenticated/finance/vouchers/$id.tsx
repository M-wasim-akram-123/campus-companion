import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VoucherQr } from "@/components/finance/VoucherQr";
import { fetchVoucherById, formatCurrency, recordVoucherPayment } from "@/lib/finance";
import { PAYMENT_METHODS } from "@/lib/finance-types";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/vouchers/$id")({
  component: VoucherDetail,
});

function VoucherDetail() {
  const { id } = Route.useParams();
  const printRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const [payAmount, setPayAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bank">("cash");

  const { data: voucher, isLoading, refetch } = useQuery({
    queryKey: ["fee-voucher", id],
    queryFn: () => fetchVoucherById(id),
  });

  if (isLoading || !voucher) {
    return <p className="text-muted-foreground">Loading voucher…</p>;
  }

  const st = voucher.students as { full_name?: string; roll_number?: string; programs?: { name?: string } };
  const balance = Math.max(0, Number(voucher.total_amount) - Number(voucher.paid_amount));

  const print = () => {
    const w = window.open("", "_blank");
    if (!w || !printRef.current) return;
    w.document.write(`<html><head><title>${voucher.voucher_number}</title></head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  const pay = async () => {
    const amt = parseFloat(payAmount) || balance;
    try {
      const p = await recordVoucherPayment({
        voucherId: voucher.id,
        amount: amt,
        paymentMethod: method,
      });
      toast.success(`Receipt ${p.receipt_number}`);
      setPayAmount("");
      refetch();
      qc.invalidateQueries({ queryKey: ["finance-stats"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><Link to="/finance/vouchers">Back</Link></Button>
        <Button onClick={print}><Printer className="mr-2 h-4 w-4" />Print</Button>
      </div>

      <div ref={printRef} className="rounded-lg border bg-card p-6 print:border-black">
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">Fee voucher</h1>
            <p className="font-mono text-lg">{voucher.voucher_number}</p>
            <p className="mt-2 text-sm">Student: <strong>{st?.full_name}</strong></p>
            <p className="text-sm">Admission no.: {st?.roll_number}</p>
            <p className="text-sm">Due date: {voucher.due_date}</p>
            <p className="mt-2 text-sm capitalize">Status: {voucher.status}</p>
          </div>
          <VoucherQr voucher={{ ...voucher, students: st }} size={140} />
        </div>

        <Table className="mt-6">
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(voucher.fee_voucher_lines ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.label}</TableCell>
                <TableCell className="text-right">{formatCurrency(Number(l.amount))}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right font-semibold">{formatCurrency(Number(voucher.total_amount))}</TableCell>
            </TableRow>
            {Number(voucher.paid_amount) > 0 && (
              <TableRow>
                <TableCell>Paid</TableCell>
                <TableCell className="text-right">{formatCurrency(Number(voucher.paid_amount))}</TableCell>
              </TableRow>
            )}
            <TableRow>
              <TableCell className="font-semibold">Balance due</TableCell>
              <TableCell className="text-right font-semibold">{formatCurrency(balance)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        {voucher.notes && <p className="mt-4 text-sm text-muted-foreground">{voucher.notes}</p>}
        <p className="mt-6 text-center text-xs text-muted-foreground">Scan QR at finance office to verify this voucher</p>
      </div>

      {balance > 0 && (
        <Card>
          <CardHeader><CardTitle>Record payment on this voucher</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" placeholder={String(balance)} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={pay}>Record payment</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
