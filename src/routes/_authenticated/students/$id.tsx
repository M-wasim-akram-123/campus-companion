import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getPhotoUrl } from "@/lib/photo-upload";
import {
  canChangeStudentStatus,
  canEditStudentProfile,
  canEditStudentRegistrarFields,
  canEditStudentRemainingFees,
} from "@/lib/student-edit-permissions";
import { isCampusInchargeScoped } from "@/lib/campus-incharge";
import { canViewExamMarks } from "@/lib/exam-permissions";
import { formatCnicForStorage, formatPakistanCnic, validatePakistanCnic } from "@/lib/cnic";
import { CnicInput } from "@/components/forms/CnicInput";
import { StudentFeePlanCard } from "@/components/finance/StudentFeePlanCard";
import { StudentFinanceLedgerCard } from "@/components/finance/StudentFinanceLedgerCard";
import { StudentTestResultsCard } from "@/components/exams/StudentTestResultsCard";
import { StudentAcademicLedgerCard } from "@/components/exams/StudentAcademicLedgerCard";
import { StudentBasicInfoSection } from "@/components/students/StudentBasicInfoSection";
import { StudentDocumentsCard } from "@/components/students/StudentDocumentsCard";
import { FeeStructureSection } from "@/components/admission/FeeStructureSection";
import { deriveAcademicStanding, studentGenderToSectionGender } from "@/lib/academic";
import { isClassesOnlyEnrollment, enrollmentTypeLabel } from "@/lib/student-enrollment";
import { updateStudentFeePlan } from "@/lib/fees";
import type { FeeStructurePayload } from "@/lib/fees-types";
import { Pencil, Printer, Trash2, User, Wallet, BookOpen, FileArchive } from "lucide-react";
import { toast } from "sonner";
import { CAMPUS_ADDRESS, CAMPUS_LOGO_URL, CAMPUS_NAME, CAMPUS_TAGLINE } from "@/lib/campus";
import { formatCurrency, isTerminalStudentStatus, writeOffStudentRemainingFees } from "@/lib/finance";
import {
  DetailPage,
  DetailHeader,
} from "@/components/detail/detail-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/students/$id")({ component: StudentDetail });

type StudentStatus = Database["public"]["Enums"]["student_status"];

const STUDENT_STATUS_OPTIONS: { value: StudentStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "graduated", label: "Graduated" },
  { value: "left", label: "Left college" },
  { value: "bad_debt", label: "Bad debt" },
  { value: "dropped", label: "Dropped" },
];

function studentStatusLabel(status: StudentStatus | string | null | undefined) {
  return (
    STUDENT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status ?? "Unknown"
  );
}

function printValue(value: unknown) {
  return value == null || value === "" ? "—" : String(value);
}

function printField(label: string, value: unknown) {
  return `<div class="field"><span class="label">${label}</span><span class="value">${printValue(value)}</span></div>`;
}

function StudentDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles } = useAuth();
  const campusViewOnly = isCampusInchargeScoped(roles);
  const allowExamRecords = canViewExamMarks(roles);
  const allowStatusChange = canChangeStudentStatus(roles);
  const allowProfileEdit = canEditStudentProfile(roles);
  const allowRegistrarFields = canEditStudentRegistrarFields(roles);
  const allowRemainingFees = canEditStudentRemainingFees(roles);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [feePayload, setFeePayload] = useState<FeeStructurePayload | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [editForm, setEditForm] = useState({
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
    roll_number: "",
    status: "active",
    admission_date: "",
    program_id: "",
    class_id: "",
    section_id: "",
    academic_session_id: "",
    session: "",
    matric_school: "",
    matric_marks_obtained: "",
    matric_marks_total: "",
  });

  const { data: s, isLoading, error: studentError } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "*, programs(name, duration_years), classes(name, year_level), sections(name, gender), academic_sessions(label, start_year, end_year)",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: feeStructure } = useQuery({
    queryKey: ["student-fee-structure", id],
    queryFn: async () => {
      const { fetchStudentFeeStructure } = await import("@/lib/fees");
      return fetchStudentFeeStructure(id);
    },
  });

  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () =>
      (
        await supabase
          .from("academic_sessions")
          .select("*")
          .order("start_year", { ascending: false })
      ).data ?? [],
  });

  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await supabase.from("programs").select("*").order("name")).data ?? [],
  });

  const { data: classes } = useQuery({
    queryKey: ["classes", editForm.program_id],
    enabled: !!editForm.program_id,
    queryFn: async () =>
      (
        await supabase
          .from("classes")
          .select("*")
          .eq("program_id", editForm.program_id)
          .order("year_level")
      ).data ?? [],
  });

  const sectionGender = studentGenderToSectionGender(editForm.gender);
  const { data: sections } = useQuery({
    queryKey: ["sections", editForm.class_id, editForm.academic_session_id, sectionGender],
    enabled: !!editForm.class_id && !!editForm.academic_session_id,
    queryFn: async () => {
      let q = supabase
        .from("sections")
        .select("*")
        .eq("class_id", editForm.class_id)
        .eq("session_id", editForm.academic_session_id)
        .order("name");
      if (sectionGender) q = q.eq("gender", sectionGender);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (s?.photo_url) getPhotoUrl(s.photo_url).then(setPhotoUrl);
  }, [s?.photo_url]);

  useEffect(() => {
    if (!s) return;
    setEditForm({
      full_name: s.full_name ?? "",
      father_name: s.father_name ?? "",
      cnic: formatPakistanCnic(s.cnic ?? ""),
      date_of_birth: s.date_of_birth ?? "",
      gender: s.gender ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
      guardian_name: s.guardian_name ?? "",
      guardian_phone: s.guardian_phone ?? "",
      roll_number: s.roll_number ?? "",
      status: s.status ?? "active",
      admission_date: s.admission_date ?? "",
      program_id: s.program_id ?? "",
      class_id: s.class_id ?? "",
      section_id: s.section_id ?? "",
      academic_session_id: s.academic_session_id ?? "",
      session: s.session ?? "",
      matric_school: s.matric_school ?? "",
      matric_marks_obtained: s.matric_marks_obtained != null ? String(s.matric_marks_obtained) : "",
      matric_marks_total: s.matric_marks_total != null ? String(s.matric_marks_total) : "",
    });
  }, [s]);

  const handleFeeChange = useCallback((payload: FeeStructurePayload) => {
    setFeePayload(payload);
  }, []);

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;
  if (studentError || !s) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <p className="text-lg font-semibold">Student not available</p>
        <p className="text-sm text-muted-foreground">
          {campusViewOnly
            ? "This student is not in one of your assigned sections."
            : "The student could not be found or you do not have access."}
        </p>
        <Button variant="outline" onClick={() => navigate({ to: "/students" })}>
          Back to students
        </Button>
      </div>
    );
  }

  const program = s.programs as { name?: string; duration_years?: number } | null;
  const cls = s.classes as { name?: string; year_level?: number } | null;
  const session = s.academic_sessions as {
    label?: string;
    start_year?: number;
    end_year?: number;
  } | null;
  const programName = program?.name;
  const sectionLabel = s.sections
    ? `${(s.sections as { gender?: string }).gender === "girls" ? "Girls" : "Boys"} — ${(s.sections as { name?: string }).name}`
    : null;
  const className = cls?.name;
  const sessionLabel = session?.label || s.session;
  const academicStanding = deriveAcademicStanding({
    sessionStartYear: session?.start_year,
    sessionEndYear: session?.end_year,
    admissionYearLevel:
      (s as { admission_year_level?: number | null }).admission_year_level ?? cls?.year_level,
    programDurationYears: program?.duration_years,
  });
  const matricMarks =
    s.matric_marks_obtained != null && s.matric_marks_total != null
      ? `${s.matric_marks_obtained} / ${s.matric_marks_total}`
      : s.matric_marks_obtained;

  const printAdmissionForm = () => {
    const feeRows = feeStructure?.installments ?? [];
    const feePlan = feeStructure?.plan;
    const feeHtml = feeRows.length
      ? feeRows
          .map(
            (row) => `
              <tr>
                <td>${row.label}</td>
                <td>${row.due_date}</td>
                <td class="right">${formatCurrency(Number(row.amount ?? 0))}</td>
                <td class="right">${formatCurrency(Number(row.paid_amount ?? 0))}</td>
                <td class="right">${formatCurrency(Math.max(0, Number(row.amount ?? 0) - Number(row.paid_amount ?? 0)))}</td>
              </tr>
            `,
          )
          .join("")
      : `<tr><td colspan="5" class="muted">No fee schedule found.</td></tr>`;
    const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8" />
  <title>Admission Form - ${s.full_name}</title>
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
      <div>${photoUrl ? `<img class="photo" src="${photoUrl}" />` : `<div class="photo"></div>`}</div>
    </div>

    <h2>Student Information</h2>
    <div class="grid">
      ${printField("Student name", s.full_name)}
      ${printField("Father name", s.father_name)}
      ${printField("Admission no.", s.roll_number)}
      ${printField("CNIC / B-Form", s.cnic)}
      ${printField("Date of birth", s.date_of_birth)}
      ${printField("Gender", s.gender)}
      ${printField("Phone", s.phone)}
      ${printField("Email", s.email)}
      ${printField("Admission date", s.admission_date)}
    </div>

    <h2>Guardian & Address</h2>
    <div class="grid">
      ${printField("Guardian name", s.guardian_name)}
      ${printField("Guardian phone", s.guardian_phone)}
      ${printField("Address", s.address)}
    </div>

    <h2>Academic Placement</h2>
    <div class="grid">
      ${printField("Program", programName)}
      ${printField("Class", className)}
      ${printField("Current standing", `${academicStanding.label}${academicStanding.isPast ? "" : ` (${academicStanding.detail})`}`)}
      ${printField("Section", sectionLabel)}
      ${printField("Session", sessionLabel)}
      ${printField("Matric school", s.matric_school)}
      ${printField("Matric marks", matricMarks)}
    </div>

    <h2>Fee Summary</h2>
    <div class="grid">
      ${printField("Scholarship", feePlan?.scholarship_label || "—")}
      ${printField("Scholarship discount", feePlan ? formatCurrency(Number(feePlan.scholarship_discount ?? 0)) : "—")}
      ${printField("Pay at admission", feePlan ? formatCurrency(Number(feePlan.pay_at_admission ?? 0)) : "—")}
    </div>
    <table>
      <thead><tr><th>Description</th><th>Due date</th><th class="right">Amount</th><th class="right">Paid</th><th class="right">Balance</th></tr></thead>
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

  const saveStudentEdit = async () => {
    if (editForm.cnic.trim()) {
      const cnicCheck = validatePakistanCnic(editForm.cnic);
      if (!cnicCheck.valid) return toast.error(cnicCheck.error ?? "Enter a valid CNIC / B-Form");
    }
    const selectedSession = sessions?.find(
      (session) => session.id === editForm.academic_session_id,
    );
    const { error } = await supabase
      .from("students")
      .update({
        full_name: editForm.full_name.trim(),
        father_name: editForm.father_name.trim() || null,
        cnic: formatCnicForStorage(editForm.cnic),
        date_of_birth: editForm.date_of_birth || null,
        gender: editForm.gender || null,
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        address: editForm.address.trim() || null,
        guardian_name: editForm.guardian_name.trim() || null,
        guardian_phone: editForm.guardian_phone.trim() || null,
        roll_number: editForm.roll_number.trim(),
        status: (allowStatusChange ? editForm.status : s.status) as StudentStatus,
        admission_date: editForm.admission_date || new Date().toISOString().slice(0, 10),
        program_id: allowRegistrarFields ? editForm.program_id || null : s.program_id,
        class_id: allowRegistrarFields ? editForm.class_id || null : s.class_id,
        section_id: allowRegistrarFields
          ? editForm.section_id === "__none__"
            ? null
            : editForm.section_id || null
          : s.section_id,
        academic_session_id: allowRegistrarFields
          ? editForm.academic_session_id || null
          : s.academic_session_id,
        session: allowRegistrarFields
          ? selectedSession?.label || editForm.session || null
          : s.session,
        matric_school: editForm.matric_school.trim() || null,
        matric_marks_obtained: allowRegistrarFields
          ? editForm.matric_marks_obtained
            ? Number(editForm.matric_marks_obtained)
            : null
          : s.matric_marks_obtained,
        matric_marks_total: editForm.matric_marks_total
          ? Number(editForm.matric_marks_total)
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return toast.error(error.message);

    if (feePayload && !feePayload.isValid) {
      return toast.error(feePayload.validationError ?? "Fee installments could not be balanced.");
    }

    if (feePayload && allowRemainingFees && editForm.program_id && editForm.academic_session_id) {
      const f = feePayload.fees;
      try {
        await updateStudentFeePlan(
          id,
          {
            policy_id: feePayload.policyId,
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
        );
      } catch (e: unknown) {
        return toast.error(
          e instanceof Error ? e.message : "Admission saved, but fee update failed",
        );
      }
    }

    toast.success("Admission updated");
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ["student", id] });
    qc.invalidateQueries({ queryKey: ["student-fee-structure", id] });
    qc.invalidateQueries({ queryKey: ["student-fee-ledger", id] });
    qc.invalidateQueries({ queryKey: ["students"] });
    qc.invalidateQueries({ queryKey: ["session-revenue"] });
  };

  const deleteStudent = async () => {
    // Ledger rows are immutable; cascade delete must go through admin_purge_student.
    const { error } = await supabase.rpc("admin_purge_student", { p_student_id: id });
    if (error) {
      const message = error.message.includes("admin_purge_student")
        ? "Delete is blocked until supabase/patch-admin-purge-student.sql is run in Supabase SQL Editor."
        : error.message;
      return toast.error(message);
    }
    toast.success("Admission deleted");
    qc.invalidateQueries({ queryKey: ["students"] });
    qc.invalidateQueries({ queryKey: ["inquiries"] });
    qc.invalidateQueries({ queryKey: ["session-revenue"] });
    navigate({ to: "/students" });
  };

  const updateStudentStatus = async (status: StudentStatus) => {
    if (!allowStatusChange) {
      return toast.error("Only Super Admin can change student status.");
    }
    if (status === s.status) return;
    setStatusSaving(true);
    try {
      if (isTerminalStudentStatus(status)) {
        const writtenOff = await writeOffStudentRemainingFees(
          id,
          `Student marked as ${studentStatusLabel(status)}`,
        );
        if (writtenOff > 0) {
          toast.info(`${formatCurrency(writtenOff)} written off as bad debt.`);
        }
      }

      const { error } = await supabase
        .from("students")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) {
        const message = error.message.includes("invalid input value for enum student_status")
          ? "This status is not enabled in the database yet. Run supabase/patch-student-status-left-bad-debt.sql in Supabase SQL Editor."
          : error.message;
        return toast.error(message);
      }

      toast.success(`Student marked as ${studentStatusLabel(status)}`);
      setEditForm((current) => ({ ...current, status }));
      qc.invalidateQueries({ queryKey: ["student", id] });
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["session-revenue"] });
      qc.invalidateQueries({ queryKey: ["student-fee-ledger", id] });
      qc.invalidateQueries({ queryKey: ["student-finance-ledger", id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update student status.");
    } finally {
      setStatusSaving(false);
    }
  };

  return (
    <DetailPage>
      <DetailHeader
        title={s.full_name}
        subtitle={`Admission no. ${s.roll_number} · ${programName ?? "—"} · ${(s.academic_sessions as { label?: string })?.label || s.session || "—"}`}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="capitalize">
              {academicStanding.isPast ? "Past student" : studentStatusLabel(s.status)}
            </Badge>
            {isClassesOnlyEnrollment((s as { enrollment_type?: string }).enrollment_type) && (
              <Badge variant="outline" className="border-amber-500/50 text-amber-800">
                {enrollmentTypeLabel("classes_only")}
              </Badge>
            )}
          </div>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/students" })}>
              Back to list
            </Button>
            {allowStatusChange ? (
              <Select
                value={s.status}
                onValueChange={(value) => updateStudentStatus(value as StudentStatus)}
                disabled={statusSaving}
              >
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {STUDENT_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="secondary" className="h-9 px-3 capitalize">
                {studentStatusLabel(s.status)}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={printAdmissionForm}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            {allowProfileEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
            {allowProfileEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this admission?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes {s.full_name} plus fee plans, installments, vouchers,
                    payments, and finance ledger rows for this admission. Prefer changing status to
                    Left / Bad debt when you only need to stop billing.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={deleteStudent}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete admission
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            )}
          </>
        }
        photo={
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted sm:h-24 sm:w-24">
            {photoUrl ? (
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                No photo
              </div>
            )}
          </div>
        }
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit admission</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Student name</Label>
              <Input
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Father&apos;s name</Label>
              <Input
                value={editForm.father_name}
                onChange={(e) => setEditForm({ ...editForm, father_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Admission no.</Label>
              <Input
                value={editForm.roll_number}
                onChange={(e) => setEditForm({ ...editForm, roll_number: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(v) => setEditForm({ ...editForm, status: v })}
                disabled={!allowStatusChange}
              >
                <SelectTrigger className={!allowStatusChange ? "bg-muted/40" : undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STUDENT_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!allowStatusChange && (
                <p className="text-xs text-muted-foreground">
                  Only Super Admin can change status from this screen.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select
                value={editForm.gender || "__none__"}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, gender: v === "__none__" ? "" : v, section_id: "" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not selected</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Admission date</Label>
              <Input
                type="date"
                value={editForm.admission_date}
                onChange={(e) => setEditForm({ ...editForm, admission_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <CnicInput
              id="edit-student-cnic"
              value={editForm.cnic}
              onChange={(cnic) => setEditForm({ ...editForm, cnic })}
            />
            <div className="space-y-2">
              <Label>Date of birth</Label>
              <Input
                type="date"
                value={editForm.date_of_birth}
                onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Guardian name</Label>
              <Input
                value={editForm.guardian_name}
                onChange={(e) => setEditForm({ ...editForm, guardian_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Guardian phone</Label>
              <Input
                value={editForm.guardian_phone}
                onChange={(e) => setEditForm({ ...editForm, guardian_phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Session</Label>
              <Select
                value={editForm.academic_session_id || "__none__"}
                onValueChange={(v) =>
                  setEditForm({
                    ...editForm,
                    academic_session_id: v === "__none__" ? "" : v,
                    section_id: "",
                  })
                }
                disabled={!allowRegistrarFields}
              >
                <SelectTrigger className={!allowRegistrarFields ? "bg-muted/40" : undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No session</SelectItem>
                  {sessions?.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.label}
                      {session.is_active ? " (running)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!allowRegistrarFields && (
                <p className="text-xs text-muted-foreground">Only Registrar can change session.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Program</Label>
              <Select
                value={editForm.program_id || "__none__"}
                onValueChange={(v) =>
                  setEditForm({
                    ...editForm,
                    program_id: v === "__none__" ? "" : v,
                    class_id: "",
                    section_id: "",
                  })
                }
                disabled={!allowRegistrarFields}
              >
                <SelectTrigger className={!allowRegistrarFields ? "bg-muted/40" : undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No program</SelectItem>
                  {programs?.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!allowRegistrarFields && (
                <p className="text-xs text-muted-foreground">Only Registrar can change program.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Class</Label>
              <Select
                value={editForm.class_id || "__none__"}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, class_id: v === "__none__" ? "" : v, section_id: "" })
                }
                disabled={!allowRegistrarFields}
              >
                <SelectTrigger className={!allowRegistrarFields ? "bg-muted/40" : undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No class</SelectItem>
                  {classes?.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Section</Label>
              <Select
                value={editForm.section_id || "__none__"}
                onValueChange={(v) => setEditForm({ ...editForm, section_id: v })}
                disabled={!allowRegistrarFields}
              >
                <SelectTrigger className={!allowRegistrarFields ? "bg-muted/40" : undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No section</SelectItem>
                  {sections?.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.gender === "girls" ? "Girls" : "Boys"} — {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!allowRegistrarFields && (
                <p className="text-xs text-muted-foreground">Only Registrar can change section.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Matric school</Label>
              <Input
                value={editForm.matric_school}
                onChange={(e) => setEditForm({ ...editForm, matric_school: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Marks obtained</Label>
                <Input
                  type="number"
                  readOnly={!allowRegistrarFields}
                  className={!allowRegistrarFields ? "bg-muted/40" : undefined}
                  value={editForm.matric_marks_obtained}
                  onChange={(e) =>
                    setEditForm({ ...editForm, matric_marks_obtained: e.target.value })
                  }
                />
                {!allowRegistrarFields && (
                  <p className="text-xs text-muted-foreground">Only Registrar can change obtained marks.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Total marks</Label>
                <Input
                  type="number"
                  value={editForm.matric_marks_total}
                  onChange={(e) => setEditForm({ ...editForm, matric_marks_total: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Address</Label>
              <Textarea
                rows={3}
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <FeeStructureSection
                programId={editForm.program_id}
                academicSessionId={editForm.academic_session_id}
                matricObtained={editForm.matric_marks_obtained}
                matricTotal={editForm.matric_marks_total}
                initialStructure={feeStructure}
                readOnlyFeePlan={!allowRemainingFees}
                onChange={handleFeeChange}
              />
              <p className="text-xs text-muted-foreground">
                Paid installments keep their paid amount. Removed unpaid rows are deleted; paid
                historical rows are kept.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveStudentEdit}
              disabled={feePayload != null && feePayload.isValid === false}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className={`grid h-auto w-full gap-1 ${campusViewOnly ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
          <TabsTrigger value="overview" className="gap-2 py-2.5">
            <User className="h-4 w-4 shrink-0" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="fee-plan" className="gap-2 py-2.5">
            <Wallet className="h-4 w-4 shrink-0" />
            Fee plan
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-2 py-2.5">
            <BookOpen className="h-4 w-4 shrink-0" />
            Ledger
          </TabsTrigger>
          {!campusViewOnly && (
            <TabsTrigger value="documents" className="gap-2 py-2.5">
              <FileArchive className="h-4 w-4 shrink-0" />
              Documents
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-4">
          <StudentBasicInfoSection
            fullName={s.full_name}
            rollNumber={s.roll_number}
            fatherName={s.father_name}
            cnic={s.cnic}
            dateOfBirth={s.date_of_birth}
            gender={s.gender}
            phone={s.phone}
            email={s.email}
            address={s.address}
            guardianName={s.guardian_name}
            guardianPhone={s.guardian_phone}
            matricSchool={s.matric_school}
            matricMarks={matricMarks}
            programName={programName}
            className={className}
            academicStandingLabel={academicStanding.label}
            academicStandingDetail={academicStanding.detail}
            academicStandingIsPast={academicStanding.isPast}
            sectionLabel={sectionLabel}
            sessionLabel={sessionLabel}
            admissionDate={s.admission_date}
            enrollmentTypeLabel={enrollmentTypeLabel((s as { enrollment_type?: string }).enrollment_type)}
          />
          {allowExamRecords && (
            <>
              <StudentTestResultsCard studentId={id} />
              <StudentAcademicLedgerCard studentId={id} />
            </>
          )}
        </TabsContent>

        <TabsContent value="fee-plan" className="mt-0 space-y-4">
          <StudentFeePlanCard studentId={id} readOnly={campusViewOnly} />
        </TabsContent>

        <TabsContent value="ledger" className="mt-0 space-y-4">
          <StudentFinanceLedgerCard studentId={id} />
        </TabsContent>

        {!campusViewOnly && (
          <TabsContent value="documents" className="mt-0 space-y-4">
            <StudentDocumentsCard studentId={id} />
          </TabsContent>
        )}
      </Tabs>
    </DetailPage>
  );
}
