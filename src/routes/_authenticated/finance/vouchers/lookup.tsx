import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchVoucherByToken, formatCurrency } from "@/lib/finance";
import { VoucherQr } from "@/components/finance/VoucherQr";

const searchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/finance/vouchers/lookup")({
  component: VoucherLookup,
  validateSearch: (s) => searchSchema.parse(s),
});

function VoucherLookup() {
  const { token } = Route.useSearch();

  const { data: voucher, isLoading, error } = useQuery({
    queryKey: ["voucher-lookup", token],
    enabled: !!token,
    queryFn: () => fetchVoucherByToken(token!),
  });

  if (!token) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Scan a voucher QR code or open a link with <code>?token=…</code>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) return <p>Looking up voucher…</p>;
  if (error || !voucher) {
    return (
      <Card className="mx-auto max-w-md border-destructive/50">
        <CardContent className="pt-6">Voucher not found or invalid QR.</CardContent>
      </Card>
    );
  }

  const st = voucher.students as { full_name?: string; roll_number?: string };
  const balance = Math.max(0, Number(voucher.total_amount) - Number(voucher.paid_amount));

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Verified voucher</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <VoucherQr voucher={{ ...voucher, students: st }} />
          </div>
          <p className="font-mono text-center text-lg">{voucher.voucher_number}</p>
          <p className="text-sm"><strong>{st?.full_name}</strong> · {st?.roll_number}</p>
          <p className="text-sm">Due: {voucher.due_date} · Balance: {formatCurrency(balance)}</p>
          <p className="text-sm capitalize">Status: {voucher.status}</p>
          <Button asChild className="w-full">
            <Link to="/finance/vouchers/$id" params={{ id: voucher.id }}>Open full voucher</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
