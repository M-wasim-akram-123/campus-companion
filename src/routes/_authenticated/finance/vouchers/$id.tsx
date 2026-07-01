import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { VoucherPrintSheet } from "@/components/finance/VoucherPrintSheet";
import {
  cancelFeeVoucher,
  fetchOpenCashierSession,
  fetchVoucherById,
  recordVoucherPayment,
} from "@/lib/finance";
import { PAYMENT_METHODS } from "@/lib/finance-types";
import { useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { printVoucherHtml } from "@/lib/voucher-print";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/finance/vouchers/$id")({
  component: VoucherDetail,
});

function VoucherDetail() {
  const { id } = Route.useParams();
  const printRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const [payAmount, setPayAmount] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [method, setMethod] = useState<"cash" | "bank">("cash");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const { data: cashierSession } = useQuery({
    queryKey: ["open-cashier-session"],
    queryFn: fetchOpenCashierSession,
  });

  const {
    data: voucher,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["fee-voucher", id],
    queryFn: async () => {
      const v = await fetchVoucherById(id);
      const { data: st } = await supabase
        .from("students")
        .select(
          "*, programs(name), classes(name), sections(name, gender), academic_sessions(label)",
        )
        .eq("id", v.student_id)
        .single();
      return { ...v, studentFull: st };
    },
  });

  if (isLoading || !voucher) {
    return <p className="text-muted-foreground">Loading voucher…</p>;
  }

  const student = voucher.studentFull as Record<string, unknown> | undefined;
  const balance = Math.max(0, Number(voucher.total_amount) - Number(voucher.paid_amount));

  const print = () => {
    if (!printRef.current) return;
    printVoucherHtml(printRef.current.innerHTML, voucher.voucher_number);
  };

  const pay = async () => {
    const amt = parseFloat(payAmount) || balance;
    if (!receiptNumber.trim()) return toast.error("Receipt number is required");
    if (method === "cash" && !cashierSession) {
      return toast.error("Open a cashier session before recording cash payments.");
    }
    try {
      const p = await recordVoucherPayment({
        voucherId: voucher.id,
        amount: amt,
        receiptNumber: receiptNumber.trim(),
        paymentMethod: method,
        cashierSessionId: cashierSession?.id,
      });
      toast.success(`Receipt ${p.receipt_number}`);
      setPayAmount("");
      setReceiptNumber("");
      refetch();
      qc.invalidateQueries({ queryKey: ["finance-stats"] });
      qc.invalidateQueries({ queryKey: ["session-revenue"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    }
  };

  const cancelVoucher = async () => {
    try {
      setCancelling(true);
      await cancelFeeVoucher(voucher.id, cancelReason);
      toast.success("Voucher cancelled");
      setCancelOpen(false);
      setCancelReason("");
      await refetch();
      qc.invalidateQueries({ queryKey: ["fee-vouchers"] });
      qc.invalidateQueries({ queryKey: ["finance-stats"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Cancellation failed");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 no-print">
        <Button variant="outline" asChild>
          <Link to="/finance/vouchers">Back</Link>
        </Button>
        <Button onClick={print}>
          <Printer className="mr-2 h-4 w-4" />
          Print / Save PDF (1 page, 3 copies)
        </Button>
        <Button variant="secondary" asChild>
          <Link to="/finance/scan">Scan at counter</Link>
        </Button>
        {voucher.status !== "cancelled" && Number(voucher.paid_amount) <= 0 && (
          <Button variant="destructive" onClick={() => setCancelOpen(true)}>
            Cancel voucher
          </Button>
        )}
      </div>

      <div ref={printRef}>
        <VoucherPrintSheet
          voucher={voucher}
          student={{
            full_name: student?.full_name as string,
            roll_number: student?.roll_number as string,
            father_name: student?.father_name as string,
            programs: student?.programs as { name?: string },
            classes: student?.classes as { name?: string },
            sections: student?.sections as { name?: string; gender?: string },
            academic_sessions: student?.academic_sessions as { label?: string },
          }}
        />
      </div>

      {balance > 0 && (
        <Card className="no-print">
          <CardHeader>
            <CardTitle>Record payment (cashier)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input
                type="number"
                placeholder={String(balance)}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Manual receipt no. *</Label>
              <Input
                placeholder="Cashier receipt / slip no."
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {method === "cash" && !cashierSession && (
                <p className="text-xs text-destructive">
                  Open a cashier session before cash collection.
                </p>
              )}
            </div>
            <div className="flex items-end">
              <Button onClick={pay} disabled={method === "cash" && !cashierSession}>
                Record payment
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel voucher</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              placeholder="Example: duplicate voucher, wrong fee head, wrong student..."
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Only unpaid vouchers can be cancelled. The action is recorded in the finance audit
              log.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Keep voucher
            </Button>
            <Button
              variant="destructive"
              onClick={cancelVoucher}
              disabled={cancelling || !cancelReason.trim()}
            >
              {cancelling ? "Cancelling..." : "Cancel voucher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
