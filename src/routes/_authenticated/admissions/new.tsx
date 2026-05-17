import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { uploadStudentPhoto } from "@/lib/photo-upload";

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
    program_id: "", class_id: "", section_id: "", session: new Date().getFullYear().toString(),
    roll_number: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await supabase.from("programs").select("*")).data ?? [],
  });
  const { data: classes } = useQuery({
    queryKey: ["classes", form.program_id],
    enabled: !!form.program_id,
    queryFn: async () => (await supabase.from("classes").select("*").eq("program_id", form.program_id)).data ?? [],
  });
  const { data: sections } = useQuery({
    queryKey: ["sections", form.class_id],
    enabled: !!form.class_id,
    queryFn: async () => (await supabase.from("sections").select("*").eq("class_id", form.class_id)).data ?? [],
  });

  // Pre-fill from inquiry
  useEffect(() => {
    if (!inquiryId) return;
    supabase.from("inquiries").select("*").eq("id", inquiryId).single().then(({ data }) => {
      if (!data) return;
      setForm((f) => ({
        ...f,
        full_name: data.full_name,
        phone: data.phone,
        email: data.email || "",
        program_id: data.program_id || "",
      }));
    });
  }, [inquiryId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let photo_url: string | null = null;
      if (photo) photo_url = await uploadStudentPhoto(photo, "students");

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
        session: form.session,
        roll_number: form.roll_number,
        photo_url,
        inquiry_id: inquiryId || null,
      }).select().single();
      if (error) throw error;

      if (inquiryId) {
        await supabase.from("inquiries")
          .update({ status: "converted", converted_student_id: student.id })
          .eq("id", inquiryId);
      }

      toast.success("Student admitted");
      navigate({ to: "/students/$id", params: { id: student.id } });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Admission</h1>
        <p className="text-muted-foreground">{inquiryId ? "Converting inquiry to admission" : "Admit a new student"}</p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Personal information</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Roll number *"><Input required value={form.roll_number} onChange={(e) => setForm({ ...form, roll_number: e.target.value })} /></Field>
            <Field label="Full name *"><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="Father's name"><Input value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} /></Field>
            <Field label="CNIC / B-Form"><Input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} /></Field>
            <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></Field>
            <Field label="Gender">
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Photo"><Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></Field>
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
          <CardHeader><CardTitle>Academic</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Program *">
              <Select value={form.program_id} onValueChange={(v) => setForm({ ...form, program_id: v, class_id: "", section_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{programs?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Class">
              <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v, section_id: "" })} disabled={!form.program_id}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Section">
              <Select value={form.section_id} onValueChange={(v) => setForm({ ...form, section_id: v })} disabled={!form.class_id}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{sections?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Session"><Input value={form.session} onChange={(e) => setForm({ ...form, session: e.target.value })} /></Field>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Admit student"}</Button>
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/students" })}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-2 ${className}`}><Label>{label}</Label>{children}</div>;
}
