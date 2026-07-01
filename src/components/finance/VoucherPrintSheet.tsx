import { VoucherQr } from "@/components/finance/VoucherQr";
import { CAMPUS_ADDRESS, CAMPUS_LOGO_URL, CAMPUS_NAME, CAMPUS_TAGLINE } from "@/lib/campus";
import { formatCurrency } from "@/lib/finance";
import type { FeeVoucher } from "@/lib/finance-types";

const COPIES = [
  { label: "BANK COPY", sub: "Deposit at bank branch" },
  { label: "STUDENT COPY", sub: "Retain for your records" },
  { label: "FINANCE COPY", sub: "Office record" },
] as const;

type Props = {
  voucher: FeeVoucher;
  student?: {
    full_name?: string;
    roll_number?: string;
    father_name?: string;
    programs?: { name?: string };
    classes?: { name?: string };
    sections?: { name?: string; gender?: string };
    academic_sessions?: { label?: string };
  };
};

function VoucherCopy({
  copyLabel,
  copySub,
  voucher,
  student,
  balance,
}: {
  copyLabel: string;
  copySub: string;
  voucher: FeeVoucher;
  student: Props["student"];
  balance: number;
}) {
  const section = student?.sections
    ? `${student.sections.gender === "girls" ? "Girls" : "Boys"} — ${student.sections.name}`
    : "—";

  return (
    <div className="voucher-copy mb-4 break-inside-avoid border-2 border-black p-3 print:mb-0">
      <div className="voucher-header border-b-2 border-black pb-2 text-center">
        {CAMPUS_LOGO_URL && (
          <img
            src={CAMPUS_LOGO_URL}
            alt={CAMPUS_NAME}
            className="mx-auto mb-2 max-h-14 max-w-[180px] object-contain"
          />
        )}
        <h1 className="text-lg font-bold uppercase tracking-wide">{CAMPUS_NAME}</h1>
        {CAMPUS_TAGLINE && <p className="text-xs">{CAMPUS_TAGLINE}</p>}
        {CAMPUS_ADDRESS && <p className="text-xs">{CAMPUS_ADDRESS}</p>}
        <p className="mt-2 text-sm font-semibold">FEE PAYMENT VOUCHER / CHALLAN</p>
        <p className="text-xs font-bold text-red-700">{copyLabel}</p>
        <p className="text-[10px] text-muted-foreground">{copySub}</p>
      </div>

      <div className="voucher-main mt-2 grid grid-cols-[1fr_auto] gap-3">
        <div className="voucher-info space-y-1 text-xs">
          <p><span className="text-muted-foreground">Voucher no:</span> <strong className="font-mono">{voucher.voucher_number}</strong></p>
          <p><span className="text-muted-foreground">Issue date:</span> {new Date(voucher.issued_at).toLocaleDateString()}</p>
          <p><span className="text-muted-foreground">Due date:</span> <strong>{voucher.due_date}</strong></p>
          <hr className="my-2 border-dashed" />
          <p><span className="text-muted-foreground">Student:</span> <strong>{student?.full_name}</strong></p>
          <p><span className="text-muted-foreground">Father:</span> {(student as { father_name?: string })?.father_name || "—"}</p>
          <p><span className="text-muted-foreground">Admission no:</span> {student?.roll_number}</p>
          <p><span className="text-muted-foreground">Program:</span> {student?.programs?.name}</p>
          <p><span className="text-muted-foreground">Class / Section:</span> {student?.classes?.name} · {section}</p>
          <p><span className="text-muted-foreground">Session:</span> {(student as { academic_sessions?: { label?: string } })?.academic_sessions?.label || "—"}</p>
        </div>
        <VoucherQr voucher={{ ...voucher, students: student }} size={82} showNumber={false} />
      </div>

      <table className="voucher-lines mt-3 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1 text-left">Description</th>
            <th className="py-1 text-right">Amount (PKR)</th>
          </tr>
        </thead>
        <tbody>
          {(voucher.fee_voucher_lines ?? []).map((l) => (
            <tr key={l.id} className="border-b border-dashed">
              <td className="py-1">{l.label}</td>
              <td className="py-1 text-right">{formatCurrency(Number(l.amount))}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className="pt-2">Total payable</td>
            <td className="pt-2 text-right">{formatCurrency(Number(voucher.total_amount))}</td>
          </tr>
          {Number(voucher.paid_amount) > 0 && (
            <tr>
              <td>Already paid</td>
              <td className="text-right">{formatCurrency(Number(voucher.paid_amount))}</td>
            </tr>
          )}
          <tr className="font-bold">
            <td className="pt-1">Amount due now</td>
            <td className="pt-1 text-right">{formatCurrency(balance)}</td>
          </tr>
        </tbody>
      </table>

      <div className="voucher-signatures mt-4 grid grid-cols-3 gap-4 text-center text-[10px]">
        <div className="border-t border-black pt-5">Student / Parent signature</div>
        <div className="border-t border-black pt-5">Bank stamp</div>
        <div className="border-t border-black pt-5">Finance officer</div>
      </div>
      <p className="voucher-note mt-2 text-center text-[10px]">Scan QR at finance office after bank deposit for instant verification</p>
    </div>
  );
}

export function VoucherPrintSheet({ voucher, student }: Props) {
  const balance = Math.max(0, Number(voucher.total_amount) - Number(voucher.paid_amount));

  return (
    <div className="voucher-print grid gap-4 bg-white text-black lg:grid-cols-3">
      {COPIES.map((c) => (
        <VoucherCopy
          key={c.label}
          copyLabel={c.label}
          copySub={c.sub}
          voucher={voucher}
          student={student}
          balance={balance}
        />
      ))}
    </div>
  );
}
