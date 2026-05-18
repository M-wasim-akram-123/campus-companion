import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { formatCurrency, installmentBalance, recordPayment } from "@/lib/finance";
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
  const [method, setMethod] = useState<"cash" | "bank" | "online" | "other">("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const pay = parseFloat(amount) || 0;
    if (pay <= 0 || pay > balance + 0.01) {
      return toast.error(`Enter amount between 1 and ${balance}`);
    }
    setSaving(true);
    try {
      await recordPayment({
        studentId,
        amount: pay,
        paymentMethod: method,
        notes: notes.trim() || undefined,
        allocations: [{ installmentId: installment.id, amount: pay }],
      });
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["student-installments"] });
      qc.invalidateQueries({ queryKey: ["student-fee-plan"] });
      qc.invalidateQueries({ queryKey: ["finance-stats"] });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
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
          <div className="space-y-2">
            <Label>Amount (PKR)</Label>
            <Input type="number" min={0} max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Record payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
