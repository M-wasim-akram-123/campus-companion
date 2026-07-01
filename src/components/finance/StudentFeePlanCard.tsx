import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DetailSection, Field, FieldGrid, StatTile } from "@/components/detail/detail-layout";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import { fetchStudentFeeLedger } from "@/lib/finance-analytics";
import { createVoucherFromInstallment, formatCurrency } from "@/lib/finance";
import { fetchStudentFeeStructure } from "@/lib/fees";
import { FEE_COMPONENTS } from "@/lib/fees-types";
import type { FeeInstallment } from "@/lib/finance-types";
import { toast } from "sonner";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "paid") return "default";
  if (status === "partial") return "secondary";
  return "outline";
}

function monthNameFromDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day || 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

const SCHEDULE_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  biannual: "Bi-annual",
  spread: "Spread evenly",
  custom: "Custom",
};

type Props = { studentId: string; readOnly?: boolean };

export function StudentFeePlanCard({ studentId, readOnly = false }: Props) {
  const qc = useQueryClient();
  const [payInst, setPayInst] = useState<FeeInstallment | null>(null);

  const { data: feeStructure, isLoading: structureLoading } = useQuery({
    queryKey: ["student-fee-structure", studentId],
    queryFn: () => fetchStudentFeeStructure(studentId),
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ["student-fee-ledger", studentId],
    queryFn: () => fetchStudentFeeLedger(studentId),
  });

  const isLoading = structureLoading || ledgerLoading;

  if (isLoading) {
    return (
      <DetailSection title="Fee plan" description="Policy amounts and installment schedule.">
        <p className="text-sm text-muted-foreground">Loading fee plan…</p>
      </DetailSection>
    );
  }

  if (!feeStructure && !ledger) {
    return (
      <DetailSection title="Fee plan" description="Policy amounts and installment schedule.">
        <p className="text-sm text-muted-foreground">
          No fee plan on file. Fee structure is set when admission is confirmed.
        </p>
      </DetailSection>
    );
  }

  const plan = feeStructure?.plan;

  return (
    <>
      <DetailSection
        title="Fee plan"
        description="Agreed fee components, scholarship, and installment schedule for this student."
        actions={
          readOnly ? undefined : (
            <>
              <Button asChild size="sm" variant="default">
                <Link to="/finance/collect" search={{ studentId, installmentId: undefined }}>
                  Record payment
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/finance/scan">Scan voucher</Link>
              </Button>
            </>
          )
        }
      >
        <div className="space-y-6">
          {plan && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Policy breakdown
                </p>
                <FieldGrid cols={2}>
                  {FEE_COMPONENTS.map((component) => {
                    const amount = {
                      admission_fee: plan.admission_fee,
                      annual_fund: plan.annual_fund,
                      annual_fee: plan.annual_fee,
                      semester_fee: plan.semester_fee,
                      board_registration_fee: plan.board_registration_fee,
                      board_examination_fee: plan.board_examination_fee,
                    }[component.key];
                    if (!amount || amount <= 0) return null;
                    return (
                      <Field
                        key={component.key}
                        label={component.label}
                        value={formatCurrency(amount)}
                      />
                    );
                  })}
                  {plan.scholarship_discount > 0 && (
                    <Field
                      label={plan.scholarship_label || "Scholarship discount"}
                      value={`−${formatCurrency(plan.scholarship_discount)}`}
                    />
                  )}
                  <Field label="Pay at admission" value={formatCurrency(plan.pay_at_admission)} />
                  <Field
                    label="Annual fee schedule"
                    value={SCHEDULE_LABELS[plan.annual_fee_schedule] ?? plan.annual_fee_schedule}
                  />
                  <Field label="Installments" value={String(plan.installment_count)} />
                  <Field
                    label="First installment after"
                    value={`${plan.start_after_months} month${plan.start_after_months === 1 ? "" : "s"}`}
                  />
                </FieldGrid>
              </div>

              {ledger && (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Collection summary
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatTile label="Total payable" value={formatCurrency(ledger.totalPayable)} />
                    <StatTile label="Total paid" value={formatCurrency(ledger.totalPaid)} />
                    <StatTile label="Balance due" value={formatCurrency(ledger.balance)} />
                    <StatTile label="Progress" value={`${ledger.paidPercent}%`} />
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Collection progress</span>
                      <span className="font-medium">{ledger.paidPercent}%</span>
                    </div>
                    <Progress value={ledger.paidPercent} className="h-2" />
                  </div>
                </div>
              )}
            </div>
          )}

          {ledger && ledger.installments.length > 0 && (
            <div>
              <p className="mb-1 font-medium">Installment schedule</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Amounts and due dates from this student&apos;s admission fee plan.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Due month / date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.installments.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{monthNameFromDate(row.due_date)}</div>
                        <div className="text-xs text-muted-foreground">{row.due_date}</div>
                      </TableCell>
                      <TableCell>{row.label}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.paid_amount)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.balance)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)} className="capitalize">
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        {!readOnly && row.balance > 0 && (
                          <>
                            <Button
                              size="sm"
                              onClick={() =>
                                setPayInst({
                                  id: row.id,
                                  student_id: studentId,
                                  fee_plan_id: "",
                                  label: row.label,
                                  component_type: row.component_type,
                                  amount: row.amount,
                                  paid_amount: row.paid_amount,
                                  due_date: row.due_date,
                                  status: row.status,
                                  sort_order: 0,
                                })
                              }
                            >
                              Pay
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  const v = await createVoucherFromInstallment(row.id);
                                  toast.success(`Voucher ${v.voucher_number}`);
                                } catch (e: unknown) {
                                  toast.error(e instanceof Error ? e.message : "Failed");
                                }
                              }}
                            >
                              Voucher
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DetailSection>

      {payInst && (
        <RecordPaymentDialog
          open={!!payInst}
          onOpenChange={(open) => !open && setPayInst(null)}
          studentId={studentId}
          installment={payInst}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["student-fee-ledger", studentId] });
            qc.invalidateQueries({ queryKey: ["student-finance-ledger", studentId] });
            qc.invalidateQueries({ queryKey: ["student-installments", studentId] });
            qc.invalidateQueries({ queryKey: ["finance-stats"] });
          }}
        />
      )}
    </>
  );
}
