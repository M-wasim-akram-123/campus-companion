import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useState } from "react";
import { getPhotoUrl } from "@/lib/photo-upload";
import { componentLabel, formatCurrency } from "@/lib/fees";
import { FEE_COMPONENTS, type AdmissionPaymentLine, type FeeComponentType } from "@/lib/fees-types";
import { installmentBalance } from "@/lib/finance";
import { createVoucherFromInstallment } from "@/lib/finance";
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog";
import type { FeeInstallment } from "@/lib/finance-types";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  DetailPage,
  DetailHeader,
  Field,
  FieldGrid,
  InfoCard,
  StatTile,
} from "@/components/detail/detail-layout";

export const Route = createFileRoute("/_authenticated/students/$id")({ component: StudentDetail });

function StudentDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [payInst, setPayInst] = useState<FeeInstallment | null>(null);

  const { data: s, isLoading } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, programs(name), classes(name), sections(name, gender), academic_sessions(label)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: feePlan } = useQuery({
    queryKey: ["student-fee-plan", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_fee_plans")
        .select("*")
        .eq("student_id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: installments } = useQuery({
    queryKey: ["student-installments", id],
    enabled: !!feePlan,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_fee_installments")
        .select("*")
        .eq("student_id", id)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (s?.photo_url) getPhotoUrl(s.photo_url).then(setPhotoUrl);
  }, [s?.photo_url]);

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;
  if (!s) return <p>Not found</p>;

  const programName = (s.programs as { name?: string })?.name;
  const sectionLabel = s.sections
    ? `${(s.sections as { gender?: string }).gender === "girls" ? "Girls" : "Boys"} — ${(s.sections as { name?: string }).name}`
    : null;

  return (
    <DetailPage>
      <DetailHeader
        title={s.full_name}
        subtitle={`Admission no. ${s.roll_number} · ${programName ?? "—"} · ${(s.academic_sessions as { label?: string })?.label || s.session || "—"}`}
        badge={<Badge className="capitalize">{s.status}</Badge>}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/students" })}>
            Back to list
          </Button>
        }
        photo={
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted sm:h-24 sm:w-24">
            {photoUrl ? (
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No photo</div>
            )}
          </div>
        }
      />

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InfoCard title="Personal">
          <FieldGrid cols={1}>
            <Field label="Father's name" value={s.father_name} />
            <Field label="CNIC / B-Form" value={s.cnic} />
            <Field label="Date of birth" value={s.date_of_birth} />
            <Field label="Gender" value={s.gender} />
            <Field label="Phone" value={s.phone} />
            <Field label="Email" value={s.email} />
            <Field label="Address" value={s.address} />
          </FieldGrid>
        </InfoCard>

        <InfoCard title="Guardian">
          <FieldGrid cols={1}>
            <Field label="Name" value={s.guardian_name} />
            <Field label="Phone" value={s.guardian_phone} />
          </FieldGrid>
        </InfoCard>

        <InfoCard title="Matriculation">
          <FieldGrid cols={1}>
            <Field label="School" value={s.matric_school} />
            <Field
              label="Marks"
              value={
                s.matric_marks_obtained != null && s.matric_marks_total != null
                  ? `${s.matric_marks_obtained} / ${s.matric_marks_total}`
                  : s.matric_marks_obtained
              }
            />
          </FieldGrid>
        </InfoCard>

        <InfoCard title="Academic">
          <FieldGrid cols={1}>
            <Field label="Program" value={programName} />
            <Field label="Class" value={(s.classes as { name?: string })?.name} />
            <Field label="Section" value={sectionLabel} />
            <Field label="Session" value={(s.academic_sessions as { label?: string })?.label || s.session} />
            <Field label="Admission date" value={s.admission_date} />
          </FieldGrid>
        </InfoCard>
      </div>

      <InfoCard title="Fee profile">
        {!feePlan ? (
          <p className="text-sm text-muted-foreground">
            No fee plan on file. Fee structure is set when admission is confirmed.
          </p>
        ) : (
          <div className="space-y-4">
            {feePlan.scholarship_label && (
              <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">{feePlan.scholarship_label}</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {FEE_COMPONENTS.map((c) => (
                <StatTile
                  key={c.key}
                  label={c.label}
                  value={formatCurrency(Number((feePlan as Record<string, number>)[c.key] ?? 0))}
                />
              ))}
              <StatTile label="Scholarship" value={formatCurrency(Number(feePlan.scholarship_discount))} />
              <StatTile label="Pay at admission" value={formatCurrency(Number(feePlan.pay_at_admission))} />
            </div>
            {Array.isArray(feePlan.admission_payment_breakdown) &&
              (feePlan.admission_payment_breakdown as AdmissionPaymentLine[]).some((l) => l.enabled) && (
              <div className="rounded-md border p-3 text-sm">
                <p className="mb-2 font-medium">Paid at admission (breakdown)</p>
                <ul className="space-y-1">
                  {(feePlan.admission_payment_breakdown as AdmissionPaymentLine[])
                    .filter((l) => l.enabled && l.amount > 0)
                    .map((l) => (
                      <li key={l.component_type} className="flex justify-between gap-4">
                        <span>{componentLabel(l.component_type as FeeComponentType)}</span>
                        <span>{formatCurrency(Number(l.amount))}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Annual fees: {feePlan.annual_fee_schedule} · {feePlan.installment_count} installments starting after{" "}
              {feePlan.start_after_months} month(s)
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/finance/collect">Collect fee</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/finance/vouchers/new">Manual voucher</Link>
              </Button>
            </div>
            {installments && installments.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Due date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installments.map((row) => {
                    const bal = installmentBalance(row);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>{row.due_date}</TableCell>
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="text-right">{formatCurrency(bal)}</TableCell>
                        <TableCell className="capitalize">{row.status}</TableCell>
                        <TableCell className="space-x-1 text-right">
                          {bal > 0 && (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => setPayInst(row as FeeInstallment)}>
                                Pay
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    const v = await createVoucherFromInstallment(row.id);
                                    toast.success(`Voucher ${v.voucher_number}`);
                                    qc.invalidateQueries({ queryKey: ["fee-vouchers"] });
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
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {payInst && (
              <RecordPaymentDialog
                open={!!payInst}
                onOpenChange={(o) => !o && setPayInst(null)}
                studentId={id}
                installment={payInst}
                onSuccess={() => {
                  qc.invalidateQueries({ queryKey: ["student-installments", id] });
                }}
              />
            )}
          </div>
        )}
      </InfoCard>
    </DetailPage>
  );
}
