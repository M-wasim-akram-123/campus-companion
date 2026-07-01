import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  fetchOpenCashierSession,
  fetchVoucherByToken,
  formatCurrency,
  recordVoucherPayment,
} from "@/lib/finance";
import { PAYMENT_METHODS } from "@/lib/finance-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode, Camera, Keyboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/finance/scan")({
  component: CashierScanPage,
});

function parseQrText(text: string): string | null {
  const t = text.trim();
  try {
    const url = new URL(t);
    const token = url.searchParams.get("token");
    if (token) return token;
  } catch {
    /* not a url */
  }
  try {
    const json = JSON.parse(t) as { qr_token?: string };
    if (json.qr_token) return json.qr_token;
  } catch {
    /* not json */
  }
  if (/^[a-f0-9]{32}$/i.test(t)) return t;
  return null;
}

function CashierScanPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [voucher, setVoucher] = useState<Awaited<ReturnType<typeof fetchVoucherByToken>>>(null);
  const [method, setMethod] = useState<"bank" | "cash">("bank");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: cashierSession } = useQuery({
    queryKey: ["open-cashier-session"],
    queryFn: fetchOpenCashierSession,
  });

  const loadToken = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const v = await fetchVoucherByToken(token);
      if (!v) {
        toast.error("Voucher not found");
        setVoucher(null);
        return;
      }
      setVoucher(v);
      toast.success(`Loaded ${v.voucher_number}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const startScan = async () => {
    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        async (decoded) => {
          const token = parseQrText(decoded);
          if (!token) return;
          await stopScan();
          await loadToken(token);
        },
        () => {},
      );
      setScanning(true);
    } catch {
      toast.error("Camera access denied or unavailable");
    }
  };

  const stopScan = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        /* ignore */
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => () => {
    void stopScan();
  }, []);

  const confirmBankPayment = async () => {
    if (!voucher) return;
    const balance = Math.max(0, Number(voucher.total_amount) - Number(voucher.paid_amount));
    if (balance <= 0) return toast.error("Already fully paid");
    if (!receiptNumber.trim()) return toast.error("Receipt number is required");
    if (method === "cash" && !cashierSession) {
      return toast.error("Open a cashier session before recording cash payments.");
    }
    setLoading(true);
    try {
      const payment = await recordVoucherPayment({
        voucherId: voucher.id,
        amount: balance,
        receiptNumber: receiptNumber.trim(),
        paymentMethod: method,
        cashierSessionId: cashierSession?.id,
        notes: "Verified via QR scan",
      });
      toast.success(`Payment recorded — Receipt ${payment.receipt_number}`);
      qc.invalidateQueries({ queryKey: ["finance-stats"] });
      qc.invalidateQueries({ queryKey: ["student-fee-ledger"] });
      setReceiptNumber("");
      setVoucher(null);
      navigate({ to: "/finance/collect" });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setLoading(false);
    }
  };

  const st = voucher?.students as {
    full_name?: string;
    roll_number?: string;
    programs?: { name?: string };
  } | undefined;
  const balance = voucher
    ? Math.max(0, Number(voucher.total_amount) - Number(voucher.paid_amount))
    : 0;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <QrCode className="h-8 w-8" />
          Scan voucher
        </h1>
        <p className="text-muted-foreground">
          Cashier: scan bank deposit slip QR → verify → record payment. Student record updates immediately.
        </p>
      </div>

      {!voucher && (
        <Card>
          <CardHeader><CardTitle>Scan or enter voucher</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div id="qr-reader" className="mx-auto max-w-sm overflow-hidden rounded-lg border" />
            {!scanning ? (
              <Button className="w-full" onClick={startScan}>
                <Camera className="mr-2 h-4 w-4" />
                Start camera scan
              </Button>
            ) : (
              <Button className="w-full" variant="outline" onClick={stopScan}>
                Stop camera
              </Button>
            )}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or manual</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Paste QR token or voucher URL"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
              />
              <Button variant="secondary" disabled={loading} onClick={() => loadToken(manualToken)}>
                <Keyboard className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {voucher && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{voucher.voucher_number}</span>
              <Badge className="capitalize">{voucher.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 text-sm">
              <p className="text-lg font-semibold">{st?.full_name}</p>
              <p className="text-muted-foreground">{st?.roll_number} · {st?.programs?.name}</p>
              <p className="mt-2">Due: <strong>{voucher.due_date}</strong></p>
              <p className="text-2xl font-bold text-primary mt-2">{formatCurrency(balance)}</p>
              <p className="text-xs text-muted-foreground">Balance to record</p>
            </div>
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.filter((m) => m.value === "bank" || m.value === "cash").map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {method === "cash" && !cashierSession && (
                <p className="text-xs text-destructive">Open a cashier session before cash collection.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Manual receipt / bank slip no. *</Label>
              <Input
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                placeholder="Enter receipt or deposit slip number"
              />
            </div>
            <Button
              className="w-full"
              size="lg"
              disabled={loading || balance <= 0 || (method === "cash" && !cashierSession)}
              onClick={confirmBankPayment}
            >
              {loading ? "Recording…" : `Confirm payment ${formatCurrency(balance)}`}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setVoucher(null)}>
              Scan another
            </Button>
            <Button variant="link" className="w-full" asChild>
              <Link to="/finance/vouchers/$id" params={{ id: voucher.id }}>View / print voucher</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
