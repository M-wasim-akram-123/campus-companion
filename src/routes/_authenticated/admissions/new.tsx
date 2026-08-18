import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { studentGenderToSectionGender, sectionGenderLabel } from "@/lib/academic";
import {
  listAcademicSessions,
  resolveDefaultSessionId,
  sessionsForProgramType,
  sessionActiveBadge,
  type AcademicSessionRow,
} from "@/lib/academic-sessions";
import { enrollBsStudentOnAdmission } from "@/lib/lms/api";
import { generateAdmissionNumber } from "@/lib/admission-number";
import {
  admissionLinesTotal,
  buildAdmissionPaymentLines,
  buildFutureFeeProjections,
  buildFutureInstallmentSchedule,
  buildSavedInstallmentSchedule,
  componentMap,
  defaultFirstInstallmentDate,
  fetchFeePolicy,
  findScholarshipSlab,
  saveStudentFeePlan,
} from "@/lib/fees";
import type { FeeComponentType, FeeStructurePayload } from "@/lib/fees-types";
import { INSTALLMENT_COUNT_OPTIONS, scheduleForInstallmentCount } from "@/lib/fees-types";
import { FeeStructureSection } from "@/components/admission/FeeStructureSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { getPhotoUrl, uploadStudentPhoto } from "@/lib/photo-upload";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, recordAdmissionOfficePayment } from "@/lib/finance";
import { CAMPUS_ADDRESS, CAMPUS_LOGO_URL, CAMPUS_NAME, CAMPUS_TAGLINE } from "@/lib/campus";
import { formatCnicForStorage, formatPakistanCnic, validatePakistanCnic } from "@/lib/cnic";
import { CnicInput } from "@/components/forms/CnicInput";
import { Printer } from "lucide-react";

type Search = { inquiryId?: string };

function printValue(value: unknown) {
  return value == null || value === "" ? "—" : String(value);
}

function printField(label: string, value: unknown) {
  return `<div class="field"><span class="label">${label}</span><span class="value">${printValue(value)}</span></div>`;
}

export const Route = createFileRoute("/_authenticated/admissions/new")({
  component: NewAdmission,
  validateSearch: (s: Record<string, unknown>): Search => ({
    inquiryId: typeof s.inquiryId === "string" ? s.inquiryId : undefined,
  }),
});

function NewAdmission() {
  const navigate = useNavigate();
  const { inquiryId } = Route.useSearch();
  const { user } = useAuth();

  const [form, setForm] = useState({
    full_name: "",
    father_name: "",
    cnic: "",
    date_of_birth: "",
    gender: "",
    phone: "",
    email: "",
    address: "",
    guardian_name: "",
    guardian_phone: "",
    guardian_occupation: "",
    guardian_details: "",
    program_id: "",
    class_id: "",
    section_id: "",
    academic_session_id: "",
    session: "",
    matric_school: "",
    matric_marks_obtained: "",
    matric_marks_total: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [inquiryPhotoPath, setInquiryPhotoPath] = useState<string | null>(null);
  const [inquiryPhotoPreview, setInquiryPhotoPreview] = useState<string | null>(null);
  const [feePayload, setFeePayload] = useState<FeeStructurePayload | null>(null);
  const [sectionManuallySelected, setSectionManuallySelected] = useState(false);
  const [saving, setSaving] = useState(false);
  const canConfirmAdmission =
    (feePayload?.receivedAtAdmission ?? 0) > 0 &&
    !!feePayload?.receiptNumber.trim() &&
    (feePayload?.isValid ?? true);

  const handleFeeChange = useCallback((p: FeeStructurePayload) => setFeePayload(p), []);

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: listAcademicSessions,
  });

  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await supabase.from("programs").select("*").order("name")).data ?? [],
  });

  const selectedProgram = useMemo(
    () => programs?.find((p) => p.id === form.program_id) ?? null,
    [programs, form.program_id],
  );
  const isBsProgram = selectedProgram?.type === "bs";
  const isIntermediateProgram = selectedProgram?.type === "intermediate";
  const compatibleSessions = useMemo(
    () =>
      selectedProgram
        ? sessionsForProgramType(sessions, selectedProgram.type)
        : sessions,
    [sessions, selectedProgram],
  );

  const { data: classes } = useQuery({
    queryKey: ["classes", form.program_id],
    enabled: !!form.program_id && !isBsProgram,
    queryFn: async () =>
      (
        await supabase
          .from("classes")
          .select("*")
          .eq("program_id", form.program_id)
          .order("year_level")
      ).data ?? [],
  });

  const { data: feePolicy } = useQuery({
    queryKey: ["admission-prefill-fee-policy", form.program_id, form.academic_session_id],
    enabled: !!form.program_id && !!form.academic_session_id,
    queryFn: () => fetchFeePolicy(form.program_id, form.academic_session_id),
  });

  const sectionGender = useMemo(() => studentGenderToSectionGender(form.gender), [form.gender]);
  const matricPercentage = useMemo(() => {
    const obtained = form.matric_marks_obtained ? Number(form.matric_marks_obtained) : null;
    const total = form.matric_marks_total ? Number(form.matric_marks_total) : null;
    if (obtained == null || total == null || total <= 0) return null;
    return (obtained / total) * 100;
  }, [form.matric_marks_obtained, form.matric_marks_total]);

  const { data: sections } = useQuery({
    queryKey: ["sections", form.class_id, form.academic_session_id, sectionGender],
    enabled:
      isIntermediateProgram &&
      !!form.class_id &&
      !!form.academic_session_id,
    queryFn: async () => {
      let q = supabase
        .from("sections")
        .select("*")
        .eq("class_id", form.class_id)
        .eq("session_id", form.academic_session_id)
        .order("name");
      if (sectionGender) q = q.eq("gender", sectionGender);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!feePolicy?.id) {
      setFeePayload(null);
      return;
    }

    const fees = componentMap(feePolicy.fee_policy_components);
    const admissionPayments = buildAdmissionPaymentLines(
      fees,
      feePolicy.default_admission_components as FeeComponentType[] | undefined,
    ).map((line) =>
      (line.component_type === "admission_fee" || line.component_type === "annual_fund") &&
      line.amount > 0
        ? { ...line, enabled: true }
        : line,
    );
    const scholarship = findScholarshipSlab(feePolicy.fee_scholarship_slabs, matricPercentage);
    const payableFees = { ...fees };
    if (scholarship) {
      payableFees[scholarship.applies_to] = Math.max(
        0,
        payableFees[scholarship.applies_to] -
          Math.round(((payableFees[scholarship.applies_to] ?? 0) * scholarship.discount) / 100),
      );
    }
    const payableAdmissionPayments = admissionPayments.map((line) => ({
      ...line,
      amount: payableFees[line.component_type] ?? line.amount,
      policy_amount: payableFees[line.component_type] ?? line.policy_amount,
    }));
    const count = feePolicy.default_installment_count ?? 4;
    const installmentCount = INSTALLMENT_COUNT_OPTIONS.includes(
      count as (typeof INSTALLMENT_COUNT_OPTIONS)[number],
    )
      ? count
      : 4;
    const startAfterMonths = Math.min(feePolicy.default_start_after_months ?? 1, 2);
    const schedule = scheduleForInstallmentCount(installmentCount);
    const firstInstallmentDate = defaultFirstInstallmentDate(new Date(), startAfterMonths);
    const futureInstallments = buildFutureInstallmentSchedule({
      fees: payableFees,
      admissionLines: payableAdmissionPayments,
      templates: feePolicy.fee_policy_installment_templates,
      schedule,
      installmentCount,
      firstInstallmentDate,
      startAfterMonths,
    });
    const installments = buildSavedInstallmentSchedule({
      admissionLines: payableAdmissionPayments,
      fees: payableFees,
      templates: feePolicy.fee_policy_installment_templates,
      schedule,
      installmentCount,
      firstInstallmentDate,
      startAfterMonths,
      scholarship: null,
      futureInstallments,
    });
    const projections = buildFutureFeeProjections({
      policy: feePolicy,
      fees: payableFees,
    });

    setFeePayload({
      fees: payableFees,
      scholarshipDiscount: scholarship
        ? Math.round(((fees[scholarship.applies_to] ?? 0) * scholarship.discount) / 100)
        : 0,
      scholarshipLabel: scholarship?.label ?? null,
      payAtAdmission: admissionLinesTotal(payableAdmissionPayments, null),
      receivedAtAdmission: 0,
      receiptNumber: "",
      paymentMethod: "cash",
      paymentNotes: null,
      admissionPayments: payableAdmissionPayments,
      schedule,
      installmentCount,
      startAfterMonths,
      firstInstallmentDate,
      policyId: feePolicy.id,
      installments,
      projections,
    });
  }, [feePolicy, matricPercentage]);

  useEffect(() => {
    if (sectionManuallySelected || !sections?.length || matricPercentage == null) return;
    const match = [...sections]
      .sort((a, b) => Number(b.merit_min_percentage ?? 0) - Number(a.merit_min_percentage ?? 0))
      .find((section) => {
        const min = section.merit_min_percentage != null ? Number(section.merit_min_percentage) : 0;
        const max =
          section.merit_max_percentage != null ? Number(section.merit_max_percentage) : 100;
        return matricPercentage >= min && matricPercentage <= max;
      });
    if (match && form.section_id !== match.id) {
      setForm((f) => ({ ...f, section_id: match.id }));
    }
  }, [sections, matricPercentage, sectionManuallySelected, form.section_id]);

  const recordAdmissionPayment = async (studentId: string, payload: FeeStructurePayload) => {
    const amount = Number(payload.receivedAtAdmission ?? 0);
    if (amount <= 0) return;
    if (!payload.receiptNumber.trim())
      throw new Error("Receipt number is required when receiving admission payment.");
    const { data: installments, error: instErr } = await supabase
      .from("student_fee_installments")
      .select("*")
      .eq("student_id", studentId)
      .order("sort_order");
    if (instErr) throw instErr;

    const priority = (component: string | null) => {
      if (component === "admission_fee") return 0;
      if (component === "annual_fund") return 1;
      if (component === "annual_fee") return 2;
      return 3;
    };
    let remaining = amount;
    const allocations: { installmentId: string; amount: number }[] = [];
    for (const installment of [...(installments ?? [])].sort((a, b) => {
      const p = priority(a.component_type) - priority(b.component_type);
      return p !== 0 ? p : Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    })) {
      if (remaining <= 0) break;
      const currentPaid = Number(installment.paid_amount ?? 0);
      const total = Number(installment.amount ?? 0);
      const balance = Math.max(0, total - currentPaid);
      if (balance <= 0) continue;
      const applied = Math.min(balance, remaining);
      allocations.push({ installmentId: installment.id, amount: applied });
      remaining -= applied;
    }

    if (remaining > 0.01) {
      throw new Error("Admission payment is greater than the generated fee balance.");
    }

    await recordAdmissionOfficePayment({
      studentId,
      amount,
      receiptNumber: payload.receiptNumber,
      paymentMethod: payload.paymentMethod,
      notes: payload.paymentNotes || "Received during admission.",
      allocations,
    });
  };

  useEffect(() => {
    if (form.academic_session_id || !compatibleSessions.length) return;
    const defaultId = resolveDefaultSessionId(compatibleSessions as AcademicSessionRow[], {
      programType: selectedProgram?.type ?? null,
    });
    const session = compatibleSessions.find((s) => s.id === defaultId);
    if (session) {
      setForm((f) => ({ ...f, academic_session_id: session.id, session: session.label }));
    }
  }, [compatibleSessions, form.academic_session_id, selectedProgram?.type]);

  useEffect(() => {
    if (!selectedProgram || !form.academic_session_id) return;
    const stillValid = compatibleSessions.some((s) => s.id === form.academic_session_id);
    if (!stillValid) {
      const defaultId = resolveDefaultSessionId(compatibleSessions as AcademicSessionRow[], {
        programType: selectedProgram.type,
      });
      const session = compatibleSessions.find((s) => s.id === defaultId);
      setForm((f) => ({
        ...f,
        academic_session_id: session?.id ?? "",
        session: session?.label ?? "",
        class_id: "",
        section_id: "",
      }));
    }
  }, [selectedProgram, compatibleSessions, form.academic_session_id]);

  useEffect(() => {
    if (!inquiryId) return;
    supabase
      .from("inquiries")
      .select("*")
      .eq("id", inquiryId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setForm((f) => ({
          ...f,
          full_name: data.full_name,
          father_name: data.father_name || "",
          cnic: formatPakistanCnic(data.cnic || ""),
          gender: data.gender || "",
          phone: data.phone,
          email: data.email || "",
          program_id: data.program_id || "",
          class_id: data.class_id || f.class_id,
          academic_session_id: data.academic_session_id || f.academic_session_id,
          session: sessions?.find((s) => s.id === data.academic_session_id)?.label || f.session,
          guardian_name: data.guardian_name || "",
          guardian_phone: data.guardian_phone || "",
          guardian_occupation: data.guardian_occupation || "",
          guardian_details: data.guardian_details || "",
          matric_school: data.matric_school || "",
          matric_marks_obtained:
            data.matric_marks_obtained != null ? String(data.matric_marks_obtained) : "",
          matric_marks_total:
            data.matric_marks_total != null ? String(data.matric_marks_total) : "",
        }));
        if (data.photo_url) {
          setInquiryPhotoPath(data.photo_url);
          getPhotoUrl(data.photo_url).then(setInquiryPhotoPreview);
        }
        if (data.preferred_section_id) {
          supabase
            .from("sections")
            .select("class_id, session_id, academic_sessions(label)")
            .eq("id", data.preferred_section_id)
            .single()
            .then(({ data: sec }) => {
              if (!sec) return;
              setForm((f) => ({
                ...f,
                class_id: sec.class_id,
                academic_session_id: sec.session_id ?? "",
                session: (sec.academic_sessions as { label?: string })?.label || f.session,
              }));
            });
        } else if (data.program_id) {
          supabase
            .from("classes")
            .select("id")
            .eq("program_id", data.program_id)
            .eq("year_level", 1)
            .maybeSingle()
            .then(({ data: cls }) => {
              if (cls) setForm((f) => ({ ...f, class_id: f.class_id || cls.id }));
            });
        }
      });
  }, [inquiryId, sessions]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.academic_session_id) return toast.error("Select an academic session");
    if (!form.program_id) return toast.error("Select a program");
    if (!form.gender) return toast.error("Gender is required");
    if (isIntermediateProgram) {
      if (!form.class_id) return toast.error("Select year / class");
      if (!form.section_id) return toast.error("Select a boys/girls section");
    }
    const matricObtained = Number(form.matric_marks_obtained);
    const matricTotal = Number(form.matric_marks_total);
    if (!form.matric_school.trim()) return toast.error("Matric school is required");
    if (!form.matric_marks_obtained || !Number.isFinite(matricObtained) || matricObtained < 0) {
      return toast.error("Valid matric marks obtained are required");
    }
    if (!form.matric_marks_total || !Number.isFinite(matricTotal) || matricTotal <= 0) {
      return toast.error("Valid matric total marks are required");
    }
    if (matricObtained > matricTotal) {
      return toast.error("Matric marks obtained cannot be greater than total marks");
    }
    if ((feePayload?.receivedAtAdmission ?? 0) <= 0) {
      return toast.error("Receive some fee before confirming admission");
    }
    if ((feePayload?.receivedAtAdmission ?? 0) > 0 && !feePayload?.receiptNumber.trim()) {
      return toast.error("Receipt number is required when receiving admission payment");
    }
    if (feePayload && !feePayload.isValid) {
      return toast.error(feePayload.validationError ?? "Fee installments could not be balanced.");
    }
    if (form.cnic.trim()) {
      const cnicCheck = validatePakistanCnic(form.cnic);
      if (!cnicCheck.valid) return toast.error(cnicCheck.error ?? "Enter a valid CNIC / B-Form");
    }
    setSaving(true);
    let createdStudentId: string | null = null;
    try {
      const roll_number = await generateAdmissionNumber(form.academic_session_id);

      let photo_url: string | null = null;
      if (photo) {
        photo_url = await uploadStudentPhoto(photo, "students");
      } else if (inquiryPhotoPath) {
        photo_url = inquiryPhotoPath;
      }

      const admissionClass = isBsProgram
        ? null
        : classes?.find((c) => c.id === form.class_id);

      const { data: student, error } = await supabase
        .from("students")
        .insert({
          full_name: form.full_name,
          father_name: form.father_name || null,
          cnic: formatCnicForStorage(form.cnic),
          date_of_birth: form.date_of_birth || null,
          gender: form.gender || null,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          guardian_name: form.guardian_name || null,
          guardian_phone: form.guardian_phone || null,
          guardian_occupation: form.guardian_occupation || null,
          guardian_details: form.guardian_details || null,
          program_id: form.program_id || null,
          class_id: isBsProgram ? null : form.class_id || null,
          section_id: isBsProgram ? null : form.section_id || null,
          admission_year_level: admissionClass?.year_level ?? 1,
          academic_session_id: form.academic_session_id,
          session: form.session,
          roll_number,
          photo_url,
          inquiry_id: inquiryId || null,
          enrollment_type: feePayload?.enrollmentType ?? "regular",
          matric_school: form.matric_school.trim() || null,
          matric_marks_obtained: matricObtained,
          matric_marks_total: matricTotal,
        })
        .select()
        .single();
      if (error) throw error;
      createdStudentId = student.id;

      if (isBsProgram) {
        await enrollBsStudentOnAdmission(student.id);
      }

      if (feePayload) {
        const f = feePayload.fees;
        await saveStudentFeePlan(
          student.id,
          {
            policy_id: feePayload.policyId,
            enrollment_type: feePayload.enrollmentType,
            fee_clearance_months: feePayload.feeClearanceMonths,
            classes_fee_total: feePayload.classesFeeTotal || null,
            admission_fee: f.admission_fee ?? 0,
            annual_fund: f.annual_fund ?? 0,
            annual_fee: f.annual_fee ?? 0,
            semester_fee: f.semester_fee ?? 0,
            board_registration_fee: f.board_registration_fee ?? 0,
            board_examination_fee: f.board_examination_fee ?? 0,
            scholarship_discount: feePayload.scholarshipDiscount,
            scholarship_label: feePayload.scholarshipLabel,
            pay_at_admission: feePayload.payAtAdmission,
            annual_fee_schedule: feePayload.schedule,
            installment_count: feePayload.installmentCount,
            start_after_months: feePayload.startAfterMonths,
            collection_plan_id: feePayload.collectionPlanId,
            admission_payment_breakdown: feePayload.admissionPayments,
          },
          feePayload.installments,
          feePayload.projections,
        );
        await recordAdmissionPayment(student.id, feePayload);
      }

      if (inquiryId) {
        const convertedAt = new Date().toISOString();
        await supabase
          .from("inquiries")
          .update({
            status: "converted",
            converted_student_id: student.id,
            converted_by: user?.id ?? null,
            converted_at: convertedAt,
            updated_at: convertedAt,
          })
          .eq("id", inquiryId);
        await supabase.from("inquiry_interactions").insert({
          inquiry_id: inquiryId,
          interaction_type: "conversion",
          remarks: `Inquiry converted to admission ${roll_number}.`,
          status_after: "converted",
          created_by: user?.id ?? null,
        });
      }

      toast.success(`Student admitted — ${roll_number}`);
      navigate({ to: "/students/$id", params: { id: student.id } });
    } catch (e: unknown) {
      if (createdStudentId) {
        await supabase.rpc("admin_purge_student", { p_student_id: createdStudentId });
      }
      toast.error(e instanceof Error ? e.message : "Admission failed");
    } finally {
      setSaving(false);
    }
  };

  const resetAcademic = (patch: Partial<typeof form>) => {
    setSectionManuallySelected(false);
    setForm((f) => ({ ...f, ...patch, section_id: patch.section_id ?? "" }));
  };

  const printAdmissionDraft = () => {
    const programName = programs?.find((p) => p.id === form.program_id)?.name;
    const className = classes?.find((c) => c.id === form.class_id)?.name;
    const sectionName = sections?.find((s) => s.id === form.section_id)?.name;
    const feeRows = feePayload?.installments ?? [];
    const feeHtml = feeRows.length
      ? feeRows
          .map(
            (row) => `
              <tr>
                <td>${row.label}</td>
                <td>${row.due_date}</td>
                <td class="right">${formatCurrency(Number(row.amount ?? 0))}</td>
              </tr>
            `,
          )
          .join("")
      : `<tr><td colspan="3" class="muted">Fee schedule is not calculated yet.</td></tr>`;
    const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8" />
  <title>Admission Form - ${form.full_name || "Student"}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
    .sheet { border: 2px solid #111827; padding: 16px; min-height: calc(297mm - 24mm); }
    .header { display: grid; grid-template-columns: 88px 1fr 88px; gap: 12px; align-items: center; border-bottom: 2px solid #111827; padding-bottom: 10px; text-align: center; }
    .logo, .photo { width: 78px; height: 78px; border: 1px solid #9ca3af; object-fit: contain; }
    .photo { object-fit: cover; }
    h1 { margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: .05em; }
    h2 { margin: 12px 0 7px; padding-bottom: 4px; border-bottom: 1px solid #d1d5db; font-size: 14px; text-transform: uppercase; }
    .muted { color: #6b7280; }
    .form-title { margin-top: 6px; font-size: 14px; font-weight: 700; }
    .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 14px; }
    .field { min-height: 34px; border-bottom: 1px solid #d1d5db; }
    .label { display: block; color: #6b7280; font-size: 10px; text-transform: uppercase; }
    .value { font-weight: 700; white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; }
    th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; }
    .right { text-align: right; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; margin-top: 48px; text-align: center; }
    .signatures div { border-top: 1px solid #111827; padding-top: 8px; font-weight: 700; }
  </style>
</head><body>
  <div class="sheet">
    <div class="header">
      <div>${CAMPUS_LOGO_URL ? `<img class="logo" src="${CAMPUS_LOGO_URL}" />` : `<div class="logo"></div>`}</div>
      <div>
        <h1>${CAMPUS_NAME}</h1>
        ${CAMPUS_TAGLINE ? `<div class="muted">${CAMPUS_TAGLINE}</div>` : ""}
        ${CAMPUS_ADDRESS ? `<div class="muted">${CAMPUS_ADDRESS}</div>` : ""}
        <div class="form-title">Admission Form</div>
      </div>
      <div>${inquiryPhotoPreview ? `<img class="photo" src="${inquiryPhotoPreview}" />` : `<div class="photo"></div>`}</div>
    </div>

    <h2>Student Information</h2>
    <div class="grid">
      ${printField("Student name", form.full_name)}
      ${printField("Father name", form.father_name)}
      ${printField("Admission no.", "Auto generated on confirm")}
      ${printField("CNIC / B-Form", form.cnic)}
      ${printField("Date of birth", form.date_of_birth)}
      ${printField("Gender", form.gender)}
      ${printField("Phone", form.phone)}
      ${printField("Email", form.email)}
      ${printField("Address", form.address)}
    </div>

    <h2>Guardian & Academic</h2>
    <div class="grid">
      ${printField("Guardian name", form.guardian_name)}
      ${printField("Guardian phone", form.guardian_phone)}
      ${printField("Occupation", form.guardian_occupation)}
      ${printField("Session", form.session)}
      ${printField("Program", programName)}
      ${printField("Class", className)}
      ${printField("Section", sectionName)}
      ${printField("Matric school", form.matric_school)}
      ${printField("Matric marks", form.matric_marks_obtained && form.matric_marks_total ? `${form.matric_marks_obtained} / ${form.matric_marks_total}` : "")}
    </div>

    <h2>Fee Summary</h2>
    <div class="grid">
      ${printField("Scholarship", feePayload?.scholarshipLabel || "—")}
      ${printField("Scholarship discount", formatCurrency(feePayload?.scholarshipDiscount ?? 0))}
      ${printField("Pay at admission", formatCurrency(feePayload?.payAtAdmission ?? 0))}
      ${printField("Received now", formatCurrency(feePayload?.receivedAtAdmission ?? 0))}
      ${printField("Receipt no.", feePayload?.receiptNumber || "—")}
      ${printField("Payment method", feePayload?.paymentMethod || "—")}
    </div>
    <table>
      <thead><tr><th>Description</th><th>Due date</th><th class="right">Amount</th></tr></thead>
      <tbody>${feeHtml}</tbody>
    </table>

    <div class="signatures">
      <div>Principal</div>
      <div>Parent / Guardian</div>
      <div>Admission Officer</div>
    </div>
  </div>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-3xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="secondary" className="mb-3">
              {inquiryId ? "Inquiry conversion" : "Direct admission"}
            </Badge>
            <h1 className="text-4xl font-black tracking-tight">New Admission</h1>
            <p className="mt-2 text-muted-foreground">
              Enter student, academic and fee information in focused sections. Admission number is
              assigned automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={printAdmissionDraft}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/students" })}>
              Cancel
            </Button>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Tabs defaultValue="student" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl p-1">
            <TabsTrigger value="student" className="py-3">
              1. Student
            </TabsTrigger>
            <TabsTrigger value="academic" className="py-3">
              2. Academic
            </TabsTrigger>
            <TabsTrigger value="fees" className="py-3">
              3. Fee Structure
            </TabsTrigger>
          </TabsList>

          <TabsContent value="student" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Student & contact information</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Full name *">
                  <Input
                    required
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  />
                </Field>
                <Field label="Father's name">
                  <Input
                    value={form.father_name}
                    onChange={(e) => setForm({ ...form, father_name: e.target.value })}
                  />
                </Field>
                <Field label="Gender *">
                  <Select
                    value={form.gender}
                    onValueChange={(v) => {
                      setSectionManuallySelected(false);
                      setForm({ ...form, gender: v, section_id: "" });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male (Boys section)</SelectItem>
                      <SelectItem value="female">Female (Girls section)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="CNIC / B-Form">
                  <CnicInput
                    id="admission-cnic"
                    label=""
                    value={form.cnic}
                    onChange={(cnic) => setForm({ ...form, cnic })}
                  />
                </Field>
                <Field label="Date of birth">
                  <Input
                    type="date"
                    value={form.date_of_birth}
                    onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label="Photo">
                  {inquiryPhotoPreview && !photo && (
                    <div className="mb-2">
                      <p className="mb-1 text-xs text-muted-foreground">From inquiry</p>
                      <img
                        src={inquiryPhotoPreview}
                        alt=""
                        className="h-20 w-20 rounded object-cover border"
                      />
                    </div>
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  />
                </Field>
                <Field label="Address" className="md:col-span-2 xl:col-span-3">
                  <Textarea
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    rows={3}
                  />
                </Field>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Guardian</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field label="Guardian name">
                    <Input
                      value={form.guardian_name}
                      onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                    />
                  </Field>
                  <Field label="Guardian phone">
                    <Input
                      value={form.guardian_phone}
                      onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
                    />
                  </Field>
                  <Field label="Guardian occupation" className="sm:col-span-2">
                    <Input
                      value={form.guardian_occupation}
                      onChange={(e) => setForm({ ...form, guardian_occupation: e.target.value })}
                    />
                  </Field>
                  <Field label="Guardian details" className="sm:col-span-2">
                    <Textarea
                      rows={3}
                      value={form.guardian_details}
                      onChange={(e) => setForm({ ...form, guardian_details: e.target.value })}
                    />
                  </Field>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Matriculation</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <Field label="School *" className="sm:col-span-2">
                    <Input
                      required
                      value={form.matric_school}
                      onChange={(e) => setForm({ ...form, matric_school: e.target.value })}
                    />
                  </Field>
                  <Field label="Marks obtained *">
                    <Input
                      required
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.matric_marks_obtained}
                      onChange={(e) => setForm({ ...form, matric_marks_obtained: e.target.value })}
                    />
                  </Field>
                  <Field label="Total marks *">
                    <Input
                      required
                      type="number"
                      min={1}
                      step="0.01"
                      value={form.matric_marks_total}
                      onChange={(e) => setForm({ ...form, matric_marks_total: e.target.value })}
                    />
                  </Field>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="academic">
            <Card>
              <CardHeader>
                <CardTitle>Academic placement</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Academic session *">
                  <Select
                    value={form.academic_session_id}
                    onValueChange={(v) => {
                      const s = compatibleSessions.find((x) => x.id === v);
                      resetAcademic({
                        academic_session_id: v,
                        session: s?.label || "",
                        section_id: "",
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select session" />
                    </SelectTrigger>
                    <SelectContent>
                      {compatibleSessions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                          {sessionActiveBadge(s as AcademicSessionRow)
                            ? ` (${sessionActiveBadge(s as AcademicSessionRow)})`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Program *">
                  <Select
                    value={form.program_id}
                    onValueChange={(v) =>
                      resetAcademic({ program_id: v, class_id: "", section_id: "" })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {programs?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.type === "bs" ? "BS" : "Inter"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {isBsProgram ? (
                  <div className="md:col-span-2 xl:col-span-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                    BS is coeducational and semester-based. No Intermediate class/section is assigned.
                    The student is auto-enrolled in LMS Semester 1 for this program and session (must be
                    open/running).
                  </div>
                ) : (
                  <>
                    <Field label="Year / class *">
                      <Select
                        value={form.class_id}
                        onValueChange={(v) => resetAcademic({ class_id: v, section_id: "" })}
                        disabled={!form.program_id}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select year" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes?.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Section *">
                      <Select
                        value={form.section_id}
                        onValueChange={(v) => {
                          setSectionManuallySelected(true);
                          setForm({ ...form, section_id: v });
                        }}
                        disabled={!form.class_id || !form.academic_session_id || !form.gender}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={form.gender ? "Select section" : "Select gender first"}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {sections?.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {sectionGenderLabel(s.gender)} — {s.name}
                              {s.merit_min_percentage != null || s.merit_max_percentage != null
                                ? ` (${s.merit_min_percentage ?? 0}% - ${s.merit_max_percentage ?? 100}%)`
                                : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {matricPercentage != null && (
                        <p className="text-xs text-muted-foreground">
                          Calculated merit: {matricPercentage.toFixed(1)}%. Matching section is selected
                          automatically.
                        </p>
                      )}
                    </Field>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fees">
            <FeeStructureSection
              programId={form.program_id}
              academicSessionId={form.academic_session_id}
              matricObtained={form.matric_marks_obtained}
              matricTotal={form.matric_marks_total}
              onChange={handleFeeChange}
            />
          </TabsContent>
        </Tabs>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Admission summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SummaryRow label="Student" value={form.full_name || "Not entered"} />
              <SummaryRow label="Phone" value={form.phone || "—"} />
              <SummaryRow label="Session" value={form.session || "Select session"} />
              <SummaryRow
                label="Program"
                value={programs?.find((p) => p.id === form.program_id)?.name || "Select program"}
              />
              <SummaryRow
                label="Placement"
                value={
                  isBsProgram
                    ? "BS · Semester 1 (LMS, co-ed)"
                    : [
                        classes?.find((c) => c.id === form.class_id)?.name,
                        sections?.find((s) => s.id === form.section_id)?.name,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Select class / section"
                }
              />
              <SummaryRow
                label="Enrollment"
                value={
                  feePayload?.enrollmentType === "classes_only"
                    ? `Classes only (${feePayload.feeClearanceMonths ?? 3} months)`
                    : "Regular student"
                }
              />
              <div className="rounded-2xl bg-primary/10 p-3">
                <p className="text-xs text-muted-foreground">Pay at admission</p>
                <p className="text-xl font-black">
                  {formatCurrency(feePayload?.payAtAdmission ?? 0)}
                </p>
              </div>
              {(feePayload?.receivedAtAdmission ?? 0) > 0 && (
                <div className="rounded-2xl bg-emerald-500/10 p-3">
                  <p className="text-xs text-muted-foreground">Received now</p>
                  <p className="text-xl font-black text-emerald-700">
                    {formatCurrency(feePayload?.receivedAtAdmission ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Balance from admission dues:{" "}
                    {formatCurrency(
                      Math.max(
                        0,
                        (feePayload?.payAtAdmission ?? 0) - (feePayload?.receivedAtAdmission ?? 0),
                      ),
                    )}
                  </p>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={saving || !canConfirmAdmission}>
                {saving ? "Confirming admission..." : "Confirm admission"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => navigate({ to: "/students" })}
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </aside>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
