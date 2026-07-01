import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { DetailSection } from "@/components/detail/detail-layout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchStudentFeeLedger } from "@/lib/finance-analytics";
import { fetchStudentFinanceLedger, formatCurrency } from "@/lib/finance";

type Props = { studentId: string };

export function StudentFinanceLedgerCard({ studentId }: Props) {
  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ["student-fee-ledger", studentId],
    queryFn: () => fetchStudentFeeLedger(studentId),
  });

  const { data: financeLedger, isLoading: financeLoading } = useQuery({
    queryKey: ["student-finance-ledger", studentId],
    queryFn: () => fetchStudentFinanceLedger(studentId),
  });

  const isLoading = ledgerLoading || financeLoading;

  if (isLoading) {
    return (
      <DetailSection title="Finance ledger" description="Audit trail of charges, payments, and adjustments.">
        <p className="text-sm text-muted-foreground">Loading ledger…</p>
      </DetailSection>
    );
  }

  const hasPayments = (ledger?.payments.length ?? 0) > 0;
  const hasFinanceEntries = (financeLedger?.length ?? 0) > 0;

  if (!hasPayments && !hasFinanceEntries) {
    return (
      <DetailSection title="Finance ledger" description="Audit trail of charges, payments, and adjustments.">
        <p className="text-sm text-muted-foreground">
          No ledger entries yet. Payments and finance adjustments will appear here.
        </p>
      </DetailSection>
    );
  }

  return (
    <div className="space-y-4">
      <DetailSection
        title="Complete finance ledger"
        description="Running audit trail of charges, fines, late fees, payments, waivers, and adjustments."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Running balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(financeLedger ?? []).reduce<{ rows: ReactElement[]; balance: number }>(
              (acc, entry) => {
                acc.balance += Number(entry.debit ?? 0) - Number(entry.credit ?? 0);
                acc.rows.push(
                  <TableRow key={entry.id}>
                    <TableCell>{entry.effective_date}</TableCell>
                    <TableCell className="capitalize">
                      {entry.entry_type.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell>
                      <div>{entry.label}</div>
                      {entry.notes && (
                        <div className="text-xs text-muted-foreground">{entry.notes}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.debit > 0 ? formatCurrency(entry.debit) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.credit > 0 ? formatCurrency(entry.credit) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(acc.balance)}
                    </TableCell>
                  </TableRow>,
                );
                return acc;
              },
              { rows: [], balance: 0 },
            ).rows}
            {!hasFinanceEntries && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Ledger entries will appear after the finance migration is applied.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </DetailSection>

      {hasPayments && (
        <DetailSection
          title="Payment receipts"
          description="Recorded payments against this student's fee account."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Receipt #</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger!.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{new Date(payment.paid_at).toLocaleDateString()}</TableCell>
                  <TableCell className="font-mono text-sm">{payment.receipt_number}</TableCell>
                  <TableCell className="capitalize">{payment.payment_method}</TableCell>
                  <TableCell className="text-right">{formatCurrency(payment.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DetailSection>
      )}
    </div>
  );
}
