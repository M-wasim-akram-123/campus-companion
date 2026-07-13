import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  allocatePaymentFifo,
  fetchOpenCashierSession,
  fetchStudentInstallments,
  formatCurrency,
  installmentBalance,
  recordPayment,
} from "@/lib/finance";
import { PAYMENT_METHODS, type FeeInstallment } from "@/lib/finance-types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  installment: FeeInstallment;
  onSuccess?: () => void;
};

export function RecordPaymentDialog({ open, onOpenChange, studentId, installment, onSuccess }: Props) {
  const qc = useQueryClient();
  const balance = installmentBalance(installment);
  const [amount, setAmount] = useState(String(balance));
  const [receiptNumber, setReceiptNumber] = useState("");
  const [method, setMethod] = useState<"cash" | "bank" | "online" | "other">("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: cashierSession } = useQuery({
    queryKey: ["open-cashier-session"],
    queryFn: fetchOpenCashierSession,
  });

  const { data: allInstallments = [] } = useQuery({
    queryKey: ["student-installments", studentId],
    enabled: open && !!studentId,
    queryFn: () => fetchStudentInstallments(studentId),
  });

  useEffect(() => {
    setAmount(String(balance));
    setReceiptNumber("");
    setNotes("");
  }, [balance, installment.id]);

  const payAmount = parseFloat(amount) || 0;

  const allocationPreview = useMemo(() => {
    if (payAmount <= 0 || !allInstallments.length) return [];
    try {
      return allocatePaymentFifo(allInstallments, payAmount);
    } catch {
      return null;
    }
  }, [allInstallments, payAmount]);

  const submit = async () => {
    if (payAmount <= 0) return toast.error("Enter a payment amount greater than zero.");
    if (!receiptNumber.trim()) return toast.error("Receipt number is required");
    if (method === "cash" && !cashierSession) {
      return toast.error("Open a cashier session before recording cash payments.");
    }
    if (!allInstallments.length) {
      return toast.error("Student installments are not loaded yet.");
    }

    let allocations: { installmentId: string; amount: number }[];
    try {
      allocations = allocatePaymentFifo(allInstallments, payAmount).map(
        ({ installmentId, amount: allocAmount }) => ({
          installmentId,
          amount: allocAmount,
        }),
      );
    } catch (e: unknown) {
      return toast.error(e instanceof Error ? e.message : "Could not allocate payment");
    }

    setSaving(true);
    try {
      await recordPayment({
        studentId,
        amount: payAmount,
        receiptNumber: receiptNumber.trim(),
        paymentMethod: method,
        notes: notes.trim() || undefined,
        cashierSessionId: cashierSession?.id,
        allocations,
      });
      const appliedElsewhere =
        allocationPreview?.filter((row) => row.installmentId !== installment.id).length ?? 0;
      toast.success(
        appliedElsewhere > 0
          ? `Payment recorded. Oldest dues cleared first across ${allocationPreview?.length ?? 0} installment(s).`
          : "Payment recorded",
      );
      setReceiptNumber("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["student-installments"] });
      qc.invalidateQueries({ queryKey: ["student-fee-plan"] });
      qc.invalidateQueries({ queryKey: ["student-fee-ledger", studentId] });
      qc.invalidateQueries({ queryKey: ["student-finance-ledger", studentId] });
      qc.invalidateQueries({ queryKey: ["finance-collect-installments", studentId] });
      qc.invalidateQueries({ queryKey: ["finance-stats"] });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String((e as { message?: unknown }).message)
            : "Payment failed";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {installment.label} · Due {installment.due_date} · Balance {formatCurrency(balance)}
          </p>
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Payments always apply to the oldest unpaid installment first (Year 1 arrears before Year 2).
            {cashierSession
              ? ` Cashier session open since ${new Date(cashierSession.opened_at).toLocaleString()}.`
              : " No open cashier session — cash payments are blocked until a session is opened."}
          </p>
          <div className="space-y-2">
            <Label>Amount received (PKR)</Label>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {allocationPreview && allocationPreview.length > 0 && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
              <p className="font-medium">FIFO payment allocation</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {allocationPreview.map((row) => (
                  <li key={row.installmentId}>
                    {row.label}: {formatCurrency(row.amount)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {allocationPreview === null && payAmount > 0 && allInstallments.length > 0 && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Amount exceeds total outstanding balance.
            </p>
          )}

          <div className="space-y-2">
            <Label>Manual receipt no. *</Label>
            <Input
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
              placeholder="Enter cashier receipt / slip number"
            />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger>
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
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              saving ||
              (method === "cash" && !cashierSession) ||
              payAmount <= 0 ||
              allInstallments.length === 0 ||
              allocationPreview === null
            }
          >
            {saving ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
