import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { studentGenderToSectionGender, sectionGenderLabel } from "@/lib/academic";
import { generateAdmissionNumber } from "@/lib/admission-number";
import { saveStudentFeePlan } from "@/lib/fees";
import type { FeeStructurePayload } from "@/lib/fees-types";
import { FeeStructureSection } from "@/components/admission/FeeStructureSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getPhotoUrl, uploadStudentPhoto } from "@/lib/photo-upload";

type Search = { inquiryId?: string };

export const Route = createFileRoute("/_authenticated/admissions/new")({
  component: NewAdmission,
  validateSearch: (s: Record<string, unknown>): Search => ({
    inquiryId: typeof s.inquiryId === "string" ? s.inquiryId : undefined,
  }),
});

function NewAdmission() {
  const navigate = useNavigate();
  const { inquiryId } = Route.useSearch();

  const [form, setForm] = useState({
    full_name: "", father_name: "", cnic: "", date_of_birth: "", gender: "",
    phone: "", email: "", address: "", guardian_name: "", guardian_phone: "",
    program_id: "", class_id: "", section_id: "", academic_session_id: "",
    session: "",
    matric_school: "", matric_marks_obtained: "", matric_marks_total: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [inquiryPhotoPath, setInquiryPhotoPath] = useState<string | null>(null);
  const [inquiryPhotoPreview, setInquiryPhotoPreview] = useState<string | null>(null);
  const [feePayload, setFeePayload] = useState<FeeStructurePayload | null>(null);
  const [saving, setSaving] = useState(false);

  const handleFeeChange = useCallback((p: FeeStructurePayload) => setFeePayload(p), []);

  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () =>
      (await supabase.from("academic_sessions").select("*").order("start_year", { ascending: false })).data ?? [],
  });

  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await supabase.from("programs").select("*").order("name")).data ?? [],
  });

  const { data: classes } = useQuery({
    queryKey: ["classes", form.program_id],
    enabled: !!form.program_id,
    queryFn: async () =>
      (await supabase.from("classes").select("*").eq("program_id", form.program_id).order("year_level")).data ?? [],
  });

  const sectionGender = useMemo(() => studentGenderToSectionGender(form.gender), [form.gender]);

  const { data: sections } = useQuery({
    queryKey: ["sections", form.class_id, form.academic_session_id, sectionGender],
    enabled: !!form.class_id && !!form.academic_session_id,
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
    const active = sessions?.find((s) => s.is_active);
    if (active && !form.academic_session_id) {
      setForm((f) => ({ ...f, academic_session_id: active.id, session: active.label }));
    }
  }, [sessions, form.academic_session_id]);

  useEffect(() => {
    if (!inquiryId) return;
    supabase.from("inquiries").select("*").eq("id", inquiryId).single().then(({ data }) => {
      if (!data) return;
      setForm((f) => ({
        ...f,
        full_name: data.full_name,
        father_name: data.father_name || "",
        gender: data.gender || "",
        phone: data.phone,
        email: data.email || "",
        program_id: data.program_id || "",
        section_id: data.preferred_section_id || "",
        matric_school: data.matric_school || "",
        matric_marks_obtained: data.matric_marks_obtained != null ? String(data.matric_marks_obtained) : "",
        matric_marks_total: data.matric_marks_total != null ? String(data.matric_marks_total) : "",
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
        supabase.from("classes").select("id").eq("program_id", data.program_id).eq("year_level", 1).maybeSingle()
          .then(({ data: cls }) => {
            if (cls) setForm((f) => ({ ...f, class_id: cls.id }));
          });
      }
    });
  }, [inquiryId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.academic_session_id) return toast.error("Select an academic session");
    if (!form.gender) return toast.error("Gender is required");
    setSaving(true);
    try {
      const roll_number = await generateAdmissionNumber(form.academic_session_id);

      let photo_url: string | null = null;
      if (photo) {
        photo_url = await uploadStudentPhoto(photo, "students");
      } else if (inquiryPhotoPath) {
        photo_url = inquiryPhotoPath;
      }

      const { data: student, error } = await supabase.from("students").insert({
        full_name: form.full_name,
        father_name: form.father_name || null,
        cnic: form.cnic || null,
        date_of_birth: form.date_of_birth || null,
        gender: form.gender || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        guardian_name: form.guardian_name || null,
        guardian_phone: form.guardian_phone || null,
        program_id: form.program_id || null,
        class_id: form.class_id || null,
        section_id: form.section_id || null,
        academic_session_id: form.academic_session_id,
        session: form.session,
        roll_number,
        photo_url,
        inquiry_id: inquiryId || null,
        matric_school: form.matric_school.trim() || null,
        matric_marks_obtained: form.matric_marks_obtained ? parseFloat(form.matric_marks_obtained) : null,
        matric_marks_total: form.matric_marks_total ? parseFloat(form.matric_marks_total) : null,
      }).select().single();
      if (error) throw error;

      if (feePayload) {
        const f = feePayload.fees;
        await saveStudentFeePlan(
          student.id,
          {
            policy_id: feePayload.policyId,
            admission_fee: f.admission_fee ?? 0,
            annual_fund: f.annual_fund ?? 0,
            annual_fee: f.annual_fee ?? 0,
            semester_fee: f.semester_fee ?? 0,
            board_admission_fee: f.board_admission_fee ?? 0,
            scholarship_discount: feePayload.scholarshipDiscount,
            scholarship_label: feePayload.scholarshipLabel,
            pay_at_admission: feePayload.payAtAdmission,
            annual_fee_schedule: feePayload.schedule,
            installment_count: feePayload.installmentCount,
            start_after_months: feePayload.startAfterMonths,
            admission_payment_breakdown: feePayload.admissionPayments,
          },
          feePayload.installments,
        );
      }

      if (inquiryId) {
        await supabase.from("inquiries")
          .update({ status: "converted", converted_student_id: student.id })
          .eq("id", inquiryId);
      }

      toast.success(`Student admitted — ${roll_number}`);
      navigate({ to: "/students/$id", params: { id: student.id } });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Admission failed");
    } finally {
      setSaving(false);
    }
  };

  const resetAcademic = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch, section_id: patch.section_id ?? "" }));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Admission</h1>
        <p className="text-muted-foreground">
          {inquiryId ? "Converting inquiry to admission" : "Admit a new student"} — admission number is assigned automatically
        </p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Personal information</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name *"><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="Father's name"><Input value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} /></Field>
            <Field label="CNIC / B-Form"><Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} /></Field>
            <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></Field>
            <Field label="Gender *">
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v, section_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male (Boys section)</SelectItem>
                  <SelectItem value="female">Female (Girls section)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Photo">
              {inquiryPhotoPreview && !photo && (
                <div className="mb-2">
                  <p className="mb-1 text-xs text-muted-foreground">From inquiry</p>
                  <img src={inquiryPhotoPreview} alt="" className="h-24 w-24 rounded object-cover border" />
                </div>
              )}
              <Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Address" className="sm:col-span-2"><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Guardian</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Guardian name"><Input value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} /></Field>
            <Field label="Guardian phone"><Input value={form.guardian_phone} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Matriculation</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="School" className="sm:col-span-2">
              <Input value={form.matric_school} onChange={(e) => setForm({ ...form, matric_school: e.target.value })} />
            </Field>
            <Field label="Marks obtained">
              <Input type="number" min={0} step="0.01" value={form.matric_marks_obtained} onChange={(e) => setForm({ ...form, matric_marks_obtained: e.target.value })} />
            </Field>
            <Field label="Total marks">
              <Input type="number" min={0} step="0.01" value={form.matric_marks_total} onChange={(e) => setForm({ ...form, matric_marks_total: e.target.value })} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Academic</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Academic session *">
              <Select
                value={form.academic_session_id}
                onValueChange={(v) => {
                  const s = sessions?.find((x) => x.id === v);
                  resetAcademic({ academic_session_id: v, session: s?.label || "", section_id: "" });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
                <SelectContent>
                  {sessions?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}{s.is_active ? " (active)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Program *">
              <Select value={form.program_id} onValueChange={(v) => resetAcademic({ program_id: v, class_id: "", section_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{programs?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Year / class *">
              <Select value={form.class_id} onValueChange={(v) => resetAcademic({ class_id: v, section_id: "" })} disabled={!form.program_id}>
                <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                <SelectContent>{classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Section *">
              <Select
                value={form.section_id}
                onValueChange={(v) => setForm({ ...form, section_id: v })}
                disabled={!form.class_id || !form.academic_session_id || !form.gender}
              >
                <SelectTrigger><SelectValue placeholder={form.gender ? "Select section" : "Select gender first"} /></SelectTrigger>
                <SelectContent>
                  {sections?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{sectionGenderLabel(s.gender)} — {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>

        <FeeStructureSection
          programId={form.program_id}
          academicSessionId={form.academic_session_id}
          matricObtained={form.matric_marks_obtained}
          matricTotal={form.matric_marks_total}
          onChange={handleFeeChange}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Confirming admission…" : "Confirm admission"}</Button>
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/students" })}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-2 ${className}`}><Label>{label}</Label>{children}</div>;
}
