import { useEffect, useState } from "react";
import { buildVoucherQrPayload, buildVoucherVerifyUrl, generateVoucherQrDataUrl } from "@/lib/finance";
import type { FeeVoucher } from "@/lib/finance-types";

type Props = {
  voucher: Pick<FeeVoucher, "voucher_number" | "qr_token" | "total_amount" | "paid_amount" | "due_date"> & {
    students?: { roll_number?: string };
  };
  size?: number;
  showNumber?: boolean;
};

export function VoucherQr({ voucher, size = 160, showNumber = true }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const payload = buildVoucherQrPayload(voucher);
    const verifyUrl = buildVoucherVerifyUrl(voucher.qr_token);
    generateVoucherQrDataUrl(verifyUrl).then(setSrc).catch(() => {
      generateVoucherQrDataUrl(payload).then(setSrc);
    });
  }, [voucher.qr_token, voucher.voucher_number, voucher.total_amount, voucher.paid_amount, voucher.due_date]);

  if (!src) {
    return (
      <div
        className="flex items-center justify-center rounded border bg-muted"
        style={{ width: size, height: size }}
      >
        <span className="text-xs text-muted-foreground">QR…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <img src={src} alt="Voucher QR" width={size} height={size} className="rounded border bg-white p-1" />
      {showNumber && (
        <p className="font-mono text-xs text-muted-foreground">{voucher.voucher_number}</p>
      )}
    </div>
  );
}
