import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FEE_COMPONENTS,
  admissionLinesTotal,
  buildAdmissionPaymentLines,
  buildFutureFeeProjections,
  buildFutureInstallmentSchedule,
  buildSavedInstallmentSchedule,
  balanceAnnualInstallmentAmounts,
  componentMap,
  defaultFirstInstallmentDate,
  fetchFeePolicy,
  findScholarshipSlab,
  formatCurrency,
  matricPercentage,
  scholarshipAmount,
} from "@/lib/fees";
import type { StudentFeeStructure } from "@/lib/fees";
import type {
  AdmissionPaymentLine,
  AnnualFeeScheduleType,
  FeeComponentType,
  FeeStructurePayload,
  InstallmentPreview,
} from "@/lib/fees-types";
import {
  INSTALLMENT_COUNT_OPTIONS,
  monthNameForOffset,
  scheduleForInstallmentCount,
} from "@/lib/fees-types";
import {
  ENROLLMENT_TYPE_OPTIONS,
  buildClassesOnlyInstallments,
  type StudentEnrollmentType,
} from "@/lib/student-enrollment";
import {
  OTHER_COLLECTION_PLAN_ID,
  fetchCollectionPlans,
  formatCollectionMonths,
  sessionStartYearFromDate,
} from "@/lib/fee-collection-plans";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Props = {
  programId: string;
  academicSessionId: string;
  matricObtained: string;
  matricTotal: string;
  onChange: (payload: FeeStructurePayload) => void;
  initialStructure?: StudentFeeStructure | null;
  /** When true, remaining annual fee and installment amounts cannot be changed (student edit). */
  readOnlyFeePlan?: boolean;
};

function monthNameFromDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day || 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function installmentLabelForDueDate(row: InstallmentPreview, dueDate: string): string {
  if (row.component_type === "annual_fee" || /^Annual fee - /i.test(row.label)) {
    return `Annual fee - ${monthNameFromDate(dueDate)}`;
  }
  return row.label;
}

function mergePreservingUserEdits(prev: InstallmentPreview[], built: InstallmentPreview[]): InstallmentPreview[] {
  if (prev.length !== built.length) return built;
  return built.map((row, i) => {
    const due_date = prev[i]?.due_date || row.due_date;
    const amount = prev[i]?.amount ?? row.amount;
    const source = prev[i] ?? row;
    const autoLabel =
      source.component_type === "annual_fee" || /^Annual fee - /i.test(source.label);
    return {
      ...row,
      due_date,
      amount,
      label: autoLabel ? installmentLabelForDueDate(source, due_date) : source.label || row.label,
    };
  });
}

function todayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cleanMoneyInput(value: string): string {
  if (value === "") return "";
  const cleaned = value.replace(/^0+(?=\d)/, "");
  return cleaned === "" ? "0" : cleaned;
}

function moneyInputValue(value: number): string {
  return value > 0 ? String(Math.round(value)) : "";
}

export function FeeStructureSection({
  programId,
  academicSessionId,
  matricObtained,
  matricTotal,
  onChange,
  initialStructure,
  readOnlyFeePlan = false,
}: Props) {
  const [fees, setFees] = useState<Record<FeeComponentType, number>>(
    () => Object.fromEntries(FEE_COMPONENTS.map((c) => [c.key, 0])) as Record<FeeComponentType, number>,
  );
  const [admissionLines, setAdmissionLines] = useState<AdmissionPaymentLine[]>([]);
  const [schedule, setSchedule] = useState<AnnualFeeScheduleType>("quarterly");
  const [installmentCount, setInstallmentCount] = useState<number>(4);
  const [startAfterMonths, setStartAfterMonths] = useState(2);
  const [firstInstallmentDate, setFirstInstallmentDate] = useState("");
  const [dateTouched, setDateTouched] = useState(false);
  const [policyLoaded, setPolicyLoaded] = useState<string | null>(null);
  const [futureInstallments, setFutureInstallments] = useState<InstallmentPreview[]>([]);
  const [datesEdited, setDatesEdited] = useState(false);
  const [remainingAnnualFee, setRemainingAnnualFee] = useState(0);
  const [remainingAnnualFeeInput, setRemainingAnnualFeeInput] = useState("");
  const [annualFeeTouched, setAnnualFeeTouched] = useState(false);
  const [annualAmountEdited, setAnnualAmountEdited] = useState(false);
  const [receivedAtAdmission, setReceivedAtAdmission] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank" | "online" | "other">("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [enrollmentType, setEnrollmentType] = useState<StudentEnrollmentType>("regular");
  const [feeClearanceMonths, setFeeClearanceMonths] = useState<2 | 3>(3);
  const [classesFeeTotal, setClassesFeeTotal] = useState("");
  const isClassesOnly = enrollmentType === "classes_only";
  const [admissionDueDates, setAdmissionDueDates] = useState<Record<string, string>>({});
  const [paidByInstallmentId, setPaidByInstallmentId] = useState<Record<string, number>>({});
  const [amountDrafts, setAmountDrafts] = useState<Record<number, string>>({});
  const [collectionPlanId, setCollectionPlanId] = useState<string | null>(null);

  const { data: policy, isLoading } = useQuery({
    queryKey: ["fee-policy", programId, academicSessionId],
    enabled: !!programId && !!academicSessionId,
    queryFn: () => fetchFeePolicy(programId, academicSessionId),
  });

  const { data: collectionPlans = [] } = useQuery({
    queryKey: ["fee-collection-plans"],
    queryFn: () => fetchCollectionPlans(true),
  });

  const { data: sessionMeta } = useQuery({
    queryKey: ["academic-session-meta", academicSessionId],
    enabled: !!academicSessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_sessions")
        .select("start_year, label")
        .eq("id", academicSessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const sessionStartYear = sessionMeta?.start_year ?? sessionStartYearFromDate(new Date());
  const selectedCollectionPlan = useMemo(
    () => collectionPlans.find((plan) => plan.id === collectionPlanId) ?? null,
    [collectionPlans, collectionPlanId],
  );
  const usesCollectionPlan = selectedCollectionPlan != null;

  useEffect(() => {
    setPolicyLoaded(null);
    setDatesEdited(false);
    setCollectionPlanId(null);
  }, [programId, academicSessionId]);

  const pct = matricPercentage(
    matricObtained ? parseFloat(matricObtained) : null,
    matricTotal ? parseFloat(matricTotal) : null,
  );

  const scholarship = useMemo(() => findScholarshipSlab(policy?.fee_scholarship_slabs, pct), [policy, pct]);

  const scholarshipDiscount = useMemo(() => {
    if (!scholarship) return 0;
    return scholarshipAmount(fees[scholarship.applies_to] ?? 0, scholarship.discount);
  }, [scholarship, fees]);

  const feeBreakdown = useMemo(
    () =>
      FEE_COMPONENTS.map((component) => {
        const amount = fees[component.key] ?? 0;
        const discount =
          scholarship?.applies_to === component.key ? scholarshipAmount(amount, scholarship.discount) : 0;
        return {
          ...component,
          amount,
          discount,
          remaining: Math.max(0, amount - discount),
        };
      }).filter((row) => row.amount > 0),
    [fees, scholarship],
  );

  const scholarshipPayableFees = useMemo(
    () =>
      Object.fromEntries(
        FEE_COMPONENTS.map((component) => {
          const amount = fees[component.key] ?? 0;
          const discount =
            scholarship?.applies_to === component.key ? scholarshipAmount(amount, scholarship.discount) : 0;
          return [component.key, Math.max(0, amount - discount)];
        }),
      ) as Record<FeeComponentType, number>,
    [fees, scholarship],
  );

  useEffect(() => {
    if (annualFeeTouched) return;
    const next = Math.max(0, Math.round(scholarshipPayableFees.annual_fee ?? 0));
    setRemainingAnnualFee(next);
    setRemainingAnnualFeeInput(next > 0 ? String(next) : "");
  }, [scholarshipPayableFees.annual_fee, annualFeeTouched]);

  const receivedAmount = receivedAtAdmission ? Number(receivedAtAdmission) : 0;
  const admissionFeeAndFundTotal = useMemo(
    () =>
      Number(scholarshipPayableFees.admission_fee ?? 0) + Number(scholarshipPayableFees.annual_fund ?? 0),
    [scholarshipPayableFees],
  );
  const annualFeePaidAtAdmission = Math.min(Math.max(0, receivedAmount - admissionFeeAndFundTotal), remainingAnnualFee);
  const installmentAnnualFee = Math.max(0, remainingAnnualFee - annualFeePaidAtAdmission);

  const payableFees = useMemo(
    () => ({
      ...scholarshipPayableFees,
      annual_fee: Math.max(0, installmentAnnualFee),
    }),
    [scholarshipPayableFees, installmentAnnualFee],
  );

  const classesOnlyInstallmentRows = useMemo(() => {
    if (!isClassesOnly) return [] as InstallmentPreview[];
    const total = Number(classesFeeTotal) || 0;
    return buildClassesOnlyInstallments({
      classesFeeTotal: total,
      clearanceMonths: feeClearanceMonths,
    }).map((row) => ({
      label: row.label,
      amount: row.amount,
      due_date: row.due_date,
      sort_order: row.sort_order,
      component_type: "annual_fee" as FeeComponentType,
    }));
  }, [isClassesOnly, classesFeeTotal, feeClearanceMonths]);

  const classesOnlyPayloadFees = useMemo(
    () =>
      ({
        admission_fee: 0,
        annual_fund: 0,
        annual_fee: Number(classesFeeTotal) || 0,
        semester_fee: 0,
        board_registration_fee: 0,
        board_examination_fee: 0,
      }) as Record<FeeComponentType, number>,
    [classesFeeTotal],
  );

  const payloadFees = isClassesOnly ? classesOnlyPayloadFees : payableFees;

  const projectionBaseFees = useMemo(
    () => ({
      ...scholarshipPayableFees,
      annual_fee: Math.max(0, remainingAnnualFee),
    }),
    [scholarshipPayableFees, remainingAnnualFee],
  );

  const admissionDueLines = useMemo(
    () =>
      admissionLines.map((line) => {
        if (
          (line.component_type === "admission_fee" || line.component_type === "annual_fund") &&
          (payableFees[line.component_type] ?? 0) > 0
        ) {
          return {
            ...line,
            enabled: true,
            amount: payableFees[line.component_type] ?? line.amount,
            policy_amount: payableFees[line.component_type] ?? line.policy_amount,
          };
        }
        return line;
      }),
    [admissionLines, payableFees],
  );

  const payAtAdmission = useMemo(() => {
    if (isClassesOnly) return classesOnlyInstallmentRows[0]?.amount ?? 0;
    return admissionLinesTotal(admissionDueLines, null);
  }, [isClassesOnly, classesOnlyInstallmentRows, admissionDueLines]);

  const totalPolicyFee = useMemo(() => feeBreakdown.reduce((sum, row) => sum + row.amount, 0), [feeBreakdown]);
  const totalScholarship = useMemo(() => feeBreakdown.reduce((sum, row) => sum + row.discount, 0), [feeBreakdown]);
  const totalRemainingFee = useMemo(() => feeBreakdown.reduce((sum, row) => sum + row.remaining, 0), [feeBreakdown]);

  const firstDue =
    firstInstallmentDate || defaultFirstInstallmentDate(new Date(), startAfterMonths);

  const rebuildFuture = useCallback(
    (preserveDates: boolean) => {
      const built = buildFutureInstallmentSchedule({
        fees: payableFees,
        admissionLines: admissionDueLines,
        templates: policy?.fee_policy_installment_templates,
        schedule,
        installmentCount: usesCollectionPlan
          ? selectedCollectionPlan!.collection_months.length
          : installmentCount,
        firstInstallmentDate: firstDue,
        startAfterMonths,
        collectionPlan: usesCollectionPlan ? selectedCollectionPlan : null,
        sessionStartYear,
      });
      setFutureInstallments((prev) => (preserveDates ? mergePreservingUserEdits(prev, built) : built));
    },
    [
      payableFees,
      admissionDueLines,
      policy?.fee_policy_installment_templates,
      schedule,
      installmentCount,
      firstDue,
      startAfterMonths,
      usesCollectionPlan,
      selectedCollectionPlan,
      sessionStartYear,
    ],
  );

  useEffect(() => {
    if (!policy?.id) return;

    if (initialStructure && policyLoaded !== `student-${initialStructure.plan.id}`) {
      const plan = initialStructure.plan;
      const map = Object.fromEntries(FEE_COMPONENTS.map((c) => [c.key, Number(plan[c.key] ?? 0)])) as Record<
        FeeComponentType,
        number
      >;
      const admissionComponents = new Set(
        initialStructure.installments
          .filter((i) => i.label.includes("(at admission)"))
          .map((i) => i.component_type)
          .filter(Boolean) as FeeComponentType[],
      );
      const lines = plan.admission_payment_breakdown?.length
        ? plan.admission_payment_breakdown
        : buildAdmissionPaymentLines(map).map((line) => ({
            ...line,
            enabled: admissionComponents.has(line.component_type),
          }));
      const future = initialStructure.installments
        .filter((i) => !i.label.includes("(at admission)"))
        .map((i, index) => ({ ...i, sort_order: index }));
      const paidMap = Object.fromEntries(
        initialStructure.installments
          .filter((i) => i.id)
          .map((i) => [i.id as string, Number(i.paid_amount ?? 0)]),
      );
      const sched = scheduleForInstallmentCount(plan.installment_count ?? 4);

      setFees(map);
      setAdmissionLines(lines);
      setSchedule(sched);
      setInstallmentCount(
        INSTALLMENT_COUNT_OPTIONS.includes(plan.installment_count as (typeof INSTALLMENT_COUNT_OPTIONS)[number])
          ? plan.installment_count
          : 4,
      );
      const startMonths = Math.min(plan.start_after_months ?? 1, 2);
      setStartAfterMonths(startMonths);
      setFirstInstallmentDate(future[0]?.due_date || defaultFirstInstallmentDate(new Date(), startMonths));
      setDateTouched(!!future[0]?.due_date);
      setDatesEdited(true);
      setPolicyLoaded(`student-${plan.id}`);
      setPaidByInstallmentId(paidMap);
      setFutureInstallments(future);
      const savedCollectionPlanId = (plan as { collection_plan_id?: string | null }).collection_plan_id ?? null;
      setCollectionPlanId(savedCollectionPlanId);
      setRemainingAnnualFee(Number(plan.annual_fee ?? 0));
      setRemainingAnnualFeeInput(Number(plan.annual_fee ?? 0) > 0 ? String(Math.round(Number(plan.annual_fee ?? 0))) : "");
      setAnnualFeeTouched(true);
      const planEnrollment = (plan as { enrollment_type?: StudentEnrollmentType }).enrollment_type ?? "regular";
      setEnrollmentType(planEnrollment);
      if (planEnrollment === "classes_only") {
        const months = (plan as { fee_clearance_months?: number }).fee_clearance_months;
        setFeeClearanceMonths(months === 2 ? 2 : 3);
        setClassesFeeTotal(
          String((plan as { classes_fee_total?: number }).classes_fee_total ?? plan.annual_fee ?? 0),
        );
      }
      return;
    }

    if (policyLoaded === policy.id || initialStructure) return;
    const map = componentMap(policy.fee_policy_components);
    const lines = buildAdmissionPaymentLines(
      map,
      policy.default_admission_components as FeeComponentType[] | undefined,
    ).map((line) =>
      (line.component_type === "admission_fee" || line.component_type === "annual_fund") && line.amount > 0
        ? { ...line, enabled: true }
        : line,
    );
    const months = Math.min(policy.default_start_after_months ?? 1, 2);
    const count = policy.default_installment_count ?? 4;
    const normalizedCount = INSTALLMENT_COUNT_OPTIONS.includes(count as (typeof INSTALLMENT_COUNT_OPTIONS)[number])
      ? count
      : 4;
    const sched = scheduleForInstallmentCount(normalizedCount);

    setFees(map);
    setSchedule(sched);
    setInstallmentCount(normalizedCount);
    setStartAfterMonths(months);
    setFirstInstallmentDate(defaultFirstInstallmentDate(new Date(), months));
    setDateTouched(false);
    setDatesEdited(false);
    setPolicyLoaded(policy.id);
    setPaidByInstallmentId({});
    setAnnualFeeTouched(false);

    const payableMap = { ...map };
    if (scholarship) {
      payableMap[scholarship.applies_to] = Math.max(
        0,
        payableMap[scholarship.applies_to] - scholarshipAmount(payableMap[scholarship.applies_to], scholarship.discount),
      );
    }
    const payableLines = lines.map((line) => ({
      ...line,
      amount: payableMap[line.component_type] ?? line.amount,
    }));
    setAdmissionLines(payableLines);

    setFutureInstallments(
      buildFutureInstallmentSchedule({
        fees: payableMap,
        admissionLines: payableLines,
        templates: policy.fee_policy_installment_templates,
        schedule: sched,
        installmentCount: normalizedCount,
        firstInstallmentDate: defaultFirstInstallmentDate(new Date(), months),
        startAfterMonths: months,
      }),
    );
  }, [policy, policyLoaded, initialStructure]);

  useEffect(() => {
    if (!policyLoaded) return;
    setAdmissionLines((lines) =>
      lines.map((line) => ({
        ...line,
        amount: payableFees[line.component_type] ?? 0,
        policy_amount: payableFees[line.component_type] ?? 0,
      })),
    );
  }, [payableFees, policyLoaded]);

  useEffect(() => {
    if (dateTouched) return;
    setFirstInstallmentDate(defaultFirstInstallmentDate(new Date(), startAfterMonths));
  }, [startAfterMonths, dateTouched]);

  useEffect(() => {
    if (!policyLoaded) return;
    rebuildFuture(datesEdited);
  }, [
    policyLoaded,
    fees,
    admissionLines,
    schedule,
    installmentCount,
    firstDue,
    startAfterMonths,
    policy?.fee_policy_installment_templates,
    rebuildFuture,
    datesEdited,
    usesCollectionPlan,
    selectedCollectionPlan,
    sessionStartYear,
  ]);

  useEffect(() => {
    if (!policyLoaded || annualAmountEdited) return;
    if (payableFees.annual_fee <= 0.5) return;

    const annualRows = futureInstallments.filter((row) => row.component_type === "annual_fee");
    if (!annualRows.length) return;

    const currentTotal = annualRows.reduce((sum, row) => sum + row.amount, 0);
    if (Math.abs(currentTotal - payableFees.annual_fee) <= 0.5) return;

    const result = balanceAnnualInstallmentAmounts(futureInstallments, payableFees.annual_fee, {
      paidByInstallmentId,
    });
    if (result.ok) {
      setFutureInstallments(result.rows);
    }
  }, [policyLoaded, payableFees.annual_fee, installmentCount, paidByInstallmentId, annualAmountEdited]);

  const installmentBalanceResult = useMemo(() => {
    if (payableFees.annual_fee <= 0.5) {
      return { ok: true as const, error: null as string | null, rows: futureInstallments };
    }

    const annualRows = futureInstallments.filter((row) => row.component_type === "annual_fee");
    if (!annualRows.length) {
      return {
        ok: false as const,
        error: "No annual fee installments to allocate.",
        rows: futureInstallments,
      };
    }

    const total = annualRows.reduce((sum, row) => sum + row.amount, 0);
    if (Math.abs(total - payableFees.annual_fee) <= 0.5) {
      return { ok: true as const, error: null as string | null, rows: futureInstallments };
    }

    if (annualAmountEdited) {
      return {
        ok: false as const,
        error: `Installments total ${formatCurrency(total)} but annual fee payable is ${formatCurrency(payableFees.annual_fee)}.`,
        rows: futureInstallments,
      };
    }

    const result = balanceAnnualInstallmentAmounts(futureInstallments, payableFees.annual_fee, {
      paidByInstallmentId,
    });
    return {
      ok: result.ok,
      error:
        result.error ??
        `Installments total ${formatCurrency(total)} but annual fee payable is ${formatCurrency(payableFees.annual_fee)}.`,
      rows: result.ok ? result.rows : futureInstallments,
    };
  }, [futureInstallments, payableFees.annual_fee, paidByInstallmentId, annualAmountEdited]);

  const savedInstallments = useMemo(
    () => {
      if (isClassesOnly) {
        return classesOnlyInstallmentRows.map((row) => ({
          label: row.label,
          amount: row.amount,
          due_date: row.due_date,
          component_type: row.component_type ?? null,
          sort_order: row.sort_order,
        }));
      }
      const sourceRows = installmentBalanceResult.ok
        ? installmentBalanceResult.rows
        : futureInstallments;
      const rows = buildSavedInstallmentSchedule({
        admissionLines: admissionDueLines,
        fees: payableFees,
        templates: policy?.fee_policy_installment_templates,
        schedule,
        installmentCount,
        firstInstallmentDate: firstDue,
        startAfterMonths,
        scholarship: null,
        futureInstallments: sourceRows,
      });
      return rows.map((row) => {
        if (row.label.includes("(at admission)")) {
          return { ...row, due_date: admissionDueDates[row.component_type ?? row.label] || todayString() };
        }
        return { ...row, label: installmentLabelForDueDate(row, row.due_date) };
      });
    },
    [
      isClassesOnly,
      classesOnlyInstallmentRows,
      admissionDueLines,
      payableFees,
      policy?.fee_policy_installment_templates,
      schedule,
      installmentCount,
      firstDue,
      startAfterMonths,
      installmentBalanceResult,
      futureInstallments,
      admissionDueDates,
    ],
  );

  const installmentValidation = useMemo(() => {
    if (isClassesOnly) {
      const total = Number(classesFeeTotal) || 0;
      if (total <= 0) {
        return { ok: false, error: "Enter total classes fee." };
      }
      const sum = savedInstallments.reduce((s, row) => s + row.amount, 0);
      if (Math.abs(sum - total) > 0.5) {
        return {
          ok: false,
          error: `Installments must total ${formatCurrency(total)} (currently ${formatCurrency(sum)}).`,
        };
      }
      return { ok: true, error: null };
    }
    return {
      ok: installmentBalanceResult.ok,
      error: installmentBalanceResult.error,
    };
  }, [isClassesOnly, classesFeeTotal, savedInstallments, installmentBalanceResult]);

  const futureProjections = useMemo(
    () =>
      isClassesOnly || !policy
        ? []
        : buildFutureFeeProjections({
            policy,
            fees: projectionBaseFees,
          }),
    [isClassesOnly, policy, projectionBaseFees],
  );
  const futureProjectionTotals = useMemo(
    () => ({
      policy: futureProjections.reduce((sum, row) => sum + row.policy_amount, 0),
      scholarship: futureProjections.reduce((sum, row) => sum + row.scholarship_discount, 0),
      increment: futureProjections.reduce((sum, row) => sum + (row.increment_amount ?? 0), 0),
      payable: futureProjections.reduce((sum, row) => sum + row.payable_amount, 0),
    }),
    [futureProjections],
  );

  const futureTotal = futureInstallments.reduce((s, r) => s + r.amount, 0);
  const futureAnnualTotal = futureInstallments
    .filter((row) => row.component_type === "annual_fee")
    .reduce((sum, row) => sum + row.amount, 0);
  const displayFutureInstallments = useMemo(
    () =>
      futureInstallments.map((row) => ({
        ...row,
        label: installmentLabelForDueDate(row, row.due_date),
      })),
    [futureInstallments],
  );
  const admissionDueInstallments = savedInstallments.filter((row) => row.label.includes("(at admission)"));
  const admissionDuePreview = useMemo(() => {
    let remainingPayment = receivedAmount;
    return admissionDueInstallments.map((row) => {
      const paidNow = Math.min(row.amount, Math.max(0, remainingPayment));
      remainingPayment -= paidNow;
      return {
        ...row,
        paidNow,
        balance: Math.max(0, row.amount - paidNow),
      };
    });
  }, [admissionDueInstallments, receivedAmount]);
  const firstDueOptions = [0, 1, 2].map((offset) => ({
    value: String(offset),
    label: monthNameForOffset(offset),
  }));

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    onChangeRef.current({
      enrollmentType,
      feeClearanceMonths: isClassesOnly ? feeClearanceMonths : null,
      classesFeeTotal: isClassesOnly ? Number(classesFeeTotal) || 0 : 0,
      fees: payloadFees,
      scholarshipDiscount: isClassesOnly ? 0 : scholarshipDiscount,
      scholarshipLabel: isClassesOnly ? null : scholarship?.label ?? null,
      payAtAdmission,
      receivedAtAdmission: receivedAtAdmission ? Number(receivedAtAdmission) : 0,
      receiptNumber: receiptNumber.trim(),
      paymentMethod,
      paymentNotes: paymentNotes.trim() || null,
      admissionPayments: isClassesOnly ? [] : admissionDueLines,
      schedule: isClassesOnly ? "monthly" : schedule,
      installmentCount: isClassesOnly
        ? feeClearanceMonths
        : usesCollectionPlan
          ? selectedCollectionPlan!.collection_months.length
          : installmentCount,
      startAfterMonths: isClassesOnly ? 0 : startAfterMonths,
      firstInstallmentDate: isClassesOnly
        ? classesOnlyInstallmentRows[0]?.due_date ?? todayString()
        : firstDue,
      collectionPlanId: usesCollectionPlan ? collectionPlanId : null,
      policyId: policy?.id ?? null,
      installments: savedInstallments,
      projections: futureProjections,
      isValid: installmentValidation.ok,
      validationError: installmentValidation.error,
    });
  }, [
    enrollmentType,
    isClassesOnly,
    feeClearanceMonths,
    classesFeeTotal,
    payloadFees,
    scholarshipDiscount,
    scholarship,
    payAtAdmission,
    receivedAtAdmission,
    receiptNumber,
    paymentMethod,
    paymentNotes,
    admissionDueLines,
    schedule,
    installmentCount,
    startAfterMonths,
    firstDue,
    usesCollectionPlan,
    collectionPlanId,
    selectedCollectionPlan,
    classesOnlyInstallmentRows,
    policy,
    savedInstallments,
    futureProjections,
    installmentValidation,
  ]);

  useEffect(() => {
    if (!isClassesOnly || classesFeeTotal.trim()) return;
    const suggested = Math.max(0, Math.round(Number(fees.annual_fee ?? 0)));
    if (suggested > 0) setClassesFeeTotal(String(suggested));
  }, [isClassesOnly, fees.annual_fee, classesFeeTotal]);

  const updateAdmissionLine = (index: number, patch: Partial<AdmissionPaymentLine>) => {
    setAdmissionLines((lines) => lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const updateFutureRow = (index: number, patch: Partial<InstallmentPreview>) => {
    setDatesEdited(true);
    setFutureInstallments((rows) =>
      rows.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, ...patch };
        if (patch.due_date) {
          next.label = installmentLabelForDueDate(r, patch.due_date);
        }
        return next;
      }),
    );
  };

  const updateInstallmentAmount = (index: number, amount: number) => {
    setDatesEdited(true);
    setAnnualAmountEdited(true);
    setFutureInstallments((rows) => {
      const edited = rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, amount: Math.max(0, Math.round(amount)) } : row,
      );
      const result = balanceAnnualInstallmentAmounts(edited, payableFees.annual_fee, {
        paidByInstallmentId,
        fixedRowIndexes: new Set([index]),
      });
      return result.ok ? result.rows : edited;
    });
  };

  const commitInstallmentAmount = (index: number, rawValue: string) => {
    const amount = rawValue === "" ? 0 : Math.max(0, Math.round(parseFloat(rawValue) || 0));
    setAmountDrafts((drafts) => {
      const next = { ...drafts };
      delete next[index];
      return next;
    });
    updateInstallmentAmount(index, amount);
  };

  const onCountChange = (value: string) => {
    setDatesEdited(false);
    setAnnualAmountEdited(false);
    setAmountDrafts({});
    const count = parseInt(value, 10);
    setInstallmentCount(count);
    setSchedule(scheduleForInstallmentCount(count));
  };

  if (!programId || !academicSessionId) {
    return (
      <Card>
        <CardHeader><CardTitle>Fee structure</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Select program and academic session to load fees.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <Card><CardContent className="p-6 text-muted-foreground">Loading fee policy…</CardContent></Card>;
  }

  if (!policy) {
    return (
      <Card className="border-amber-500/50">
        <CardHeader><CardTitle>Fee structure</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>No fee policy for this program and session.</p>
          <Link to="/settings/fees" className="text-primary underline">Create a fee policy</Link>
        </CardContent>
      </Card>
    );
  }

  const programLabel = (policy.programs as { name?: string })?.name;
  const sessionLabel = (policy.academic_sessions as { label?: string })?.label;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fee structure — {policy.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {programLabel} · {sessionLabel}
          {pct != null && (
            <>
              {" "}
              · Matric {pct.toFixed(1)}%
              {scholarship ? ` · ${scholarship.label}` : ""}
            </>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-medium">Enrollment type</h4>
              <p className="text-xs text-muted-foreground">
                Classes-only students attend lectures but do not sit board exams from this college.
              </p>
            </div>
            {isClassesOnly && <Badge variant="secondary">Classes only</Badge>}
          </div>
          <RadioGroup
            value={enrollmentType}
            onValueChange={(value) => setEnrollmentType(value as StudentEnrollmentType)}
            className="grid gap-3 sm:grid-cols-2"
            disabled={readOnlyFeePlan}
          >
            {ENROLLMENT_TYPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${
                  enrollmentType === option.value ? "border-primary bg-primary/5" : "bg-background"
                } ${readOnlyFeePlan ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <RadioGroupItem value={option.value} className="mt-1" disabled={readOnlyFeePlan} />
                <div>
                  <p className="font-medium">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        {isClassesOnly ? (
          <div className="space-y-4 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
            <div>
              <h4 className="font-medium">Classes-only fee plan</h4>
              <p className="text-xs text-muted-foreground">
                Total fee is split evenly across 2 or 3 months from admission. First installment is due at
                admission.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Total classes fee (PKR) *</Label>
                <Input
                  type="number"
                  min={0}
                  readOnly={readOnlyFeePlan}
                  className={readOnlyFeePlan ? "bg-muted/40" : undefined}
                  value={classesFeeTotal}
                  onChange={(e) => setClassesFeeTotal(cleanMoneyInput(e.target.value))}
                  placeholder="e.g. 45000"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Clear fees within</Label>
                <Select
                  value={String(feeClearanceMonths)}
                  onValueChange={(value) => setFeeClearanceMonths(value === "2" ? 2 : 3)}
                  disabled={readOnlyFeePlan}
                >
                  <SelectTrigger className={readOnlyFeePlan ? "bg-muted/40" : undefined}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 months</SelectItem>
                    <SelectItem value="3">3 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-2xl border bg-background p-3">
                <p className="text-xs text-muted-foreground">Due at admission</p>
                <p className="text-lg font-black">{formatCurrency(payAtAdmission)}</p>
              </div>
            </div>
            {!installmentValidation.ok && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {installmentValidation.error} Saving is blocked until this is resolved.
              </p>
            )}
            {savedInstallments.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Due date</TableHead>
                    <TableHead>Installment</TableHead>
                    <TableHead className="text-right">Amount (PKR)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {savedInstallments.map((row, i) => (
                    <TableRow key={`classes-only-${i}`}>
                      <TableCell>{row.due_date}</TableCell>
                      <TableCell>{row.label}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(row.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ) : (
          <>
        <div>
          <h4 className="mb-3 font-medium">Fee amounts (from policy)</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEE_COMPONENTS.map((c) => (
              <div key={c.key} className="space-y-1">
                <Label className="text-xs">{c.label}</Label>
                <Input
                  type="number"
                  min={0}
                  value={fees[c.key] ?? 0}
                  readOnly
                  className="bg-muted/40"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">Total policy fee</p>
              <p className="text-lg font-black">{formatCurrency(totalPolicyFee)}</p>
            </div>
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">Scholarship discount</p>
              <p className="text-lg font-black text-emerald-700">{formatCurrency(totalScholarship)}</p>
            </div>
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">Remaining fee</p>
              <p className="text-lg font-black">{formatCurrency(totalRemainingFee)}</p>
            </div>
            <div className="rounded-2xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">Matric percentage</p>
              <p className="text-lg font-black">{pct != null ? `${pct.toFixed(1)}%` : "—"}</p>
            </div>
          </div>

          {scholarship ? (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
              <p className="font-semibold text-emerald-700">{scholarship.label} scholarship applied</p>
              <p className="text-muted-foreground">
                {scholarship.discount}% off {FEE_COMPONENTS.find((c) => c.key === scholarship.applies_to)?.label}.
                Installments are calculated from the remaining payable amount.
              </p>
            </div>
          ) : (
            <p className="rounded-2xl border bg-background p-3 text-sm text-muted-foreground">
              No scholarship rule matched the entered matric marks.
            </p>
          )}

          <div className="overflow-hidden rounded-2xl border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee head</TableHead>
                  <TableHead className="text-right">Policy amount</TableHead>
                  <TableHead className="text-right">Scholarship</TableHead>
                  <TableHead className="text-right">Payable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeBreakdown.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                    <TableCell className="text-right text-emerald-700">
                      {row.discount > 0 ? `${scholarship?.discount}% (${formatCurrency(row.discount)})` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.remaining)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-medium">Due at admission</h4>
              <p className="text-xs text-muted-foreground">
                Checked items are collected now and are not repeated in installments below.
              </p>
            </div>
            <p className="text-xl font-semibold">{formatCurrency(payAtAdmission)}</p>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Remaining annual fee for installments</Label>
              <Input
                type="number"
                min={0}
                readOnly={readOnlyFeePlan}
                className={readOnlyFeePlan ? "bg-muted/40" : undefined}
                value={remainingAnnualFeeInput}
                onChange={(e) => {
                  if (readOnlyFeePlan) return;
                  const value = cleanMoneyInput(e.target.value);
                  setAnnualFeeTouched(true);
                  setRemainingAnnualFeeInput(value);
                  setRemainingAnnualFee(value === "" ? 0 : parseFloat(value) || 0);
                  setAnnualAmountEdited(false);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {readOnlyFeePlan
                  ? "Only Super Admin can change remaining fees when editing a student."
                  : "Installments are made from this annual fee amount after scholarship/adjustment."}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {admissionLines.map((line, i) => (
              <div
                key={line.component_type}
                className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-2"
              >
                <Checkbox
                  checked={line.enabled}
                  onCheckedChange={(v) => updateAdmissionLine(i, { enabled: v === true })}
                />
                <span className="min-w-[120px] flex-1 text-sm">
                  {FEE_COMPONENTS.find((c) => c.key === line.component_type)?.label}
                </span>
                <Input
                  type="number"
                  min={0}
                  className="w-28"
                  disabled={!line.enabled}
                  value={moneyInputValue(line.amount)}
                  onChange={(e) => {
                    const value = cleanMoneyInput(e.target.value);
                    updateAdmissionLine(i, { amount: value === "" ? 0 : parseFloat(value) || 0 });
                  }}
                />
                {scholarship?.applies_to === line.component_type && line.enabled && scholarshipDiscount > 0 && (
                  <span className="text-xs text-primary">−{formatCurrency(scholarshipDiscount)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
          </>
        )}

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-3">
            <h4 className="font-medium">Receive payment at admission</h4>
            <p className="text-xs text-muted-foreground">
              {isClassesOnly
                ? "Payment is applied to installments in due-date order, starting with the first month."
                : "Received amount is allocated first to admission fee, then annual fund, then remaining annual fee."}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Received amount</Label>
              <Input
                type="number"
                min={0}
                value={receivedAtAdmission}
                onChange={(e) => setReceivedAtAdmission(cleanMoneyInput(e.target.value))}
                placeholder="e.g. 20000"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Receipt number</Label>
              <Input
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                placeholder="Manual receipt no."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
        </div>

        {!isClassesOnly && (
        <>
        <div className="mb-4">
          <h4 className="mb-3 font-medium">Fee collection plan</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Collection policy</Label>
              <Select
                value={collectionPlanId ?? OTHER_COLLECTION_PLAN_ID}
                onValueChange={(value) => {
                  if (value === OTHER_COLLECTION_PLAN_ID) {
                    setCollectionPlanId(null);
                  } else {
                    setCollectionPlanId(value);
                  }
                  setDatesEdited(false);
                  setAnnualAmountEdited(false);
                }}
                disabled={readOnlyFeePlan}
              >
                <SelectTrigger className={readOnlyFeePlan ? "bg-muted/40" : undefined}>
                  <SelectValue placeholder="Select collection plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={OTHER_COLLECTION_PLAN_ID}>
                    Other plan (custom installment dates)
                  </SelectItem>
                  {collectionPlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} — {formatCollectionMonths(plan.collection_months)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {collectionPlans.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No collection plans yet.{" "}
                  <Link to="/settings/collection-plans" className="text-primary underline">
                    Create one in settings
                  </Link>
                  .
                </p>
              )}
            </div>
            {usesCollectionPlan && selectedCollectionPlan && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium">{selectedCollectionPlan.name}</p>
                <p className="text-muted-foreground">
                  Collections in {formatCollectionMonths(selectedCollectionPlan.collection_months, false)} (due
                  day {selectedCollectionPlan.due_day})
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Session {sessionMeta?.label ?? sessionStartYear} — annual fee splits into{" "}
                  {selectedCollectionPlan.collection_months.length} installments on these months.
                </p>
              </div>
            )}
          </div>
        </div>

        <div>
          <h4 className="mb-3 font-medium">Annual fee installments</h4>
          {!usesCollectionPlan && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Annual fee split into</Label>
              <Select
                value={String(installmentCount)}
                onValueChange={onCountChange}
                disabled={readOnlyFeePlan}
              >
                <SelectTrigger className={readOnlyFeePlan ? "bg-muted/40" : undefined}>
                  <SelectValue placeholder="Select count" />
                </SelectTrigger>
                <SelectContent>
                  {INSTALLMENT_COUNT_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} installment{n > 1 ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">First installment month</Label>
              <Select
                value={String(startAfterMonths)}
                onValueChange={(value) => {
                  setStartAfterMonths(parseInt(value, 10));
                  setDateTouched(false);
                  setDatesEdited(false);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {firstDueOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Sets the default first due date. You can change each row below individually.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">First installment date</Label>
              <Input
                type="date"
                value={firstInstallmentDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setFirstInstallmentDate(next);
                  setDateTouched(true);
                  if (datesEdited) {
                    setFutureInstallments((rows) =>
                      rows.map((row, index) =>
                        index === 0
                          ? {
                              ...row,
                              due_date: next,
                              label: installmentLabelForDueDate(row, next),
                            }
                          : row,
                      ),
                    );
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Auto-splits {formatCurrency(payableFees.annual_fee)} into {installmentCount} installment
                {installmentCount === 1 ? "" : "s"}. Edit dates and amounts per row as needed.
              </p>
            </div>
          </div>
          )}
          {usesCollectionPlan && (
            <p className="mb-3 text-sm text-muted-foreground">
              Due dates follow the selected collection plan. You can still adjust amounts per row below.
            </p>
          )}
        </div>

        <div>
          {admissionDuePreview.length > 0 && (
            <div className="mb-6">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="font-medium">Admission dues</h4>
                <p className="text-sm text-muted-foreground">
                  Cleared first when payment is received.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Due date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount (PKR)</TableHead>
                    <TableHead className="text-right">Paid now</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admissionDuePreview.map((row, i) => (
                    <TableRow key={`${row.component_type}-admission-${i}`}>
                      <TableCell>
                        <Input
                          type="date"
                          className="min-w-[140px]"
                          value={row.due_date}
                          onChange={(e) =>
                            setAdmissionDueDates((prev) => ({
                              ...prev,
                              [row.component_type ?? row.label]: e.target.value,
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>{row.label}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(row.amount)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{formatCurrency(row.paidNow)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="font-medium">Installment schedule</h4>
            <p className="text-sm text-muted-foreground">
              Future: {formatCurrency(futureTotal)}
              {payAtAdmission > 0 && ` · At admission: ${formatCurrency(payAtAdmission)}`}
            </p>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Each row has its own due date and amount. Example: split into 4 installments, then change May to
            June, second to August, third to November, and fourth to February.
          </p>
          {installmentValidation.ok && futureAnnualTotal > 0 && !annualAmountEdited && (
            <p className="mb-3 text-xs text-muted-foreground">
              Installment amounts auto-balance to {formatCurrency(payableFees.annual_fee)} when the annual fee
              total changes. Edit any row — other rows adjust when you leave the field.
            </p>
          )}
          {!installmentValidation.ok && (
            <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {installmentValidation.error} Saving is blocked until this is resolved.
            </p>
          )}
          {futureInstallments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No future installments — everything is collected at admission or amounts are zero.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Due month / date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount (PKR)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayFutureInstallments.map((row, i) => (
                  <TableRow key={`${row.component_type}-${i}`}>
                    <TableCell>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {monthNameFromDate(row.due_date)}
                      </p>
                      <Input
                        type="date"
                        className="min-w-[140px]"
                        value={row.due_date}
                        onChange={(e) => updateFutureRow(i, { due_date: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      {row.component_type === "annual_fee" || /^Annual fee - /i.test(row.label) ? (
                        <p className="min-h-9 rounded-md border border-transparent bg-muted/40 px-3 py-2 text-sm">
                          {row.label}
                        </p>
                      ) : (
                        <Input
                          value={futureInstallments[i]?.label ?? row.label}
                          onChange={(e) => updateFutureRow(i, { label: e.target.value })}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        readOnly={readOnlyFeePlan}
                        className={readOnlyFeePlan ? "ml-auto max-w-[120px] bg-muted/40 text-right" : "ml-auto max-w-[120px] text-right"}
                        value={
                          amountDrafts[i] ??
                          moneyInputValue(futureInstallments[i]?.amount ?? 0)
                        }
                        onChange={(e) => {
                          if (readOnlyFeePlan) return;
                          setAmountDrafts((drafts) => ({
                            ...drafts,
                            [i]: cleanMoneyInput(e.target.value),
                          }));
                        }}
                        onBlur={(e) => {
                          if (readOnlyFeePlan) return;
                          commitInstallmentAmount(i, cleanMoneyInput(e.target.value));
                        }}
                        onKeyDown={(e) => {
                          if (readOnlyFeePlan) return;
                          if (e.key === "Enter") {
                            commitInstallmentAmount(i, cleanMoneyInput(e.currentTarget.value));
                            e.currentTarget.blur();
                          }
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {savedInstallments.length} line(s) saved (including admission).
          </p>
        </div>
        </>
        )}

        {futureProjections.length > 0 && (
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-medium">Future fee projection</h4>
              <p className="text-sm text-muted-foreground">
                Saved for later voucher generation. Scholarship continues through the session.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Fee head</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="text-right">Finalized base fee</TableHead>
                  <TableHead className="text-right">Increment</TableHead>
                  <TableHead className="text-right">Payable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {futureProjections.map((row, index) => (
                  <TableRow key={`${row.cycle_no}-${row.component_type}-${index}`}>
                    <TableCell>{row.cycle_label}</TableCell>
                    <TableCell>{FEE_COMPONENTS.find((c) => c.key === row.component_type)?.label}</TableCell>
                    <TableCell>{row.due_date ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.policy_amount)}</TableCell>
                    <TableCell className="text-right text-amber-700">
                      {(row.increment_amount ?? 0) > 0
                        ? `${row.increment_label ? `${row.increment_label} ` : ""}${formatCurrency(row.increment_amount ?? 0)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.payable_amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={3}>Total future projection</TableCell>
                  <TableCell className="text-right">{formatCurrency(futureProjectionTotals.policy)}</TableCell>
                  <TableCell className="text-right text-amber-700">
                    {futureProjectionTotals.increment > 0 ? formatCurrency(futureProjectionTotals.increment) : "—"}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(futureProjectionTotals.payable)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
