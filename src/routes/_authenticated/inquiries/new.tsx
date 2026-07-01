import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canManageInquiries } from "@/lib/inquiry-permissions";
import { formatCnicForStorage, validatePakistanCnic } from "@/lib/cnic";
import { formatPhoneForStorage, validateWhatsAppPhone } from "@/lib/phone";
import { uploadStudentPhoto } from "@/lib/photo-upload";
import { PhoneWhatsAppField } from "@/components/inquiries/PhoneWhatsAppField";
import { CnicInput } from "@/components/forms/CnicInput";
import { BoardRollLookup } from "@/components/inquiries/BoardRollLookup";
import type { BoardGazetteLookupResult } from "@/lib/board-gazette";

export const Route = createFileRoute("/_authenticated/inquiries/new")({ component: NewInquiry });

function NewInquiry() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();

  useEffect(() => {
    if (!canManageInquiries(roles)) navigate({ to: "/inquiries" });
  }, [roles, navigate]);
  const [form, setForm] = useState({
    full_name: "",
    father_name: "",
    cnic: "",
    phone: "",
    email: "",
    program_id: "",
    class_id: "",
    academic_session_id: "",
    gender: "",
    matric_school: "",
    matric_marks_obtained: "",
    matric_marks_total: "",
    board_gazette_import_id: "",
    board_roll_number: "",
    guardian_name: "",
    guardian_phone: "",
    guardian_occupation: "",
    guardian_details: "",
    notes: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const matricPercentage = (() => {
    const obtained = Number(form.matric_marks_obtained);
    const total = Number(form.matric_marks_total);
    if (!Number.isFinite(obtained) || !Number.isFinite(total) || total <= 0) return null;
    return (obtained / total) * 100;
  })();

  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await supabase.from("programs").select("*").order("name")).data ?? [],
  });

  const { data: sessions, isError: sessionsError } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_sessions")
        .select("*")
        .order("start_year", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: classes } = useQuery({
    queryKey: ["classes", form.program_id],
    enabled: !!form.program_id,
    queryFn: async () =>
      (
        await supabase
          .from("classes")
          .select("*")
          .eq("program_id", form.program_id)
          .order("year_level")
      ).data ?? [],
  });

  useEffect(() => {
    const active = sessions?.find((s) => s.is_active);
    if (active && !form.academic_session_id) {
      setForm((f) => ({ ...f, academic_session_id: active.id }));
    }
  }, [sessions, form.academic_session_id]);

  useEffect(() => {
    if (!form.program_id || form.class_id) return;
    const first = classes?.find((c) => c.year_level === 1);
    if (first) setForm((f) => ({ ...f, class_id: first.id }));
  }, [classes, form.program_id, form.class_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.gender) {
      toast.error("Gender is required");
      return;
    }
    const marksObtained = Number(form.matric_marks_obtained);
    const marksTotal = Number(form.matric_marks_total);
    if (!form.matric_school.trim()) {
      toast.error("Matric school is required");
      return;
    }
    if (!form.matric_marks_obtained || !Number.isFinite(marksObtained) || marksObtained < 0) {
      toast.error("Valid matric marks obtained are required");
      return;
    }
    if (!form.matric_marks_total || !Number.isFinite(marksTotal) || marksTotal <= 0) {
      toast.error("Valid matric total marks are required");
      return;
    }
    if (marksObtained > marksTotal) {
      toast.error("Matric marks obtained cannot be greater than total marks");
      return;
    }
    const phoneCheck = validateWhatsAppPhone(form.phone);
    if (!phoneCheck.valid) {
      toast.error(phoneCheck.error ?? "Enter a valid phone number");
      return;
    }
    if (form.guardian_phone.trim()) {
      const guardianCheck = validateWhatsAppPhone(form.guardian_phone);
      if (!guardianCheck.valid) {
        toast.error(guardianCheck.error ?? "Enter a valid guardian phone number");
        return;
      }
    }
    if (form.cnic.trim()) {
      const cnicCheck = validatePakistanCnic(form.cnic);
      if (!cnicCheck.valid) {
        toast.error(cnicCheck.error ?? "Enter a valid CNIC / B-Form");
        return;
      }
    }
    setSaving(true);
    try {
      let photo_url: string | null = null;
      if (photo) photo_url = await uploadStudentPhoto(photo, "inquiries");

      const { error } = await supabase.from("inquiries").insert({
        full_name: form.full_name.trim(),
        father_name: form.father_name.trim() || null,
        cnic: formatCnicForStorage(form.cnic),
        phone: formatPhoneForStorage(form.phone),
        email: form.email.trim() || null,
        gender: form.gender,
        program_id: form.program_id || null,
        academic_session_id: form.academic_session_id || null,
        class_id: form.class_id || null,
        guardian_name: form.guardian_name.trim() || null,
        guardian_phone: form.guardian_phone.trim() ? formatPhoneForStorage(form.guardian_phone) : null,
        guardian_occupation: form.guardian_occupation.trim() || null,
        guardian_details: form.guardian_details.trim() || null,
        matric_school: form.matric_school.trim(),
        matric_marks_obtained: marksObtained,
        matric_marks_total: marksTotal,
        board_gazette_import_id: form.board_gazette_import_id || null,
        board_roll_number: form.board_roll_number.trim() || null,
        notes: form.notes || null,
        photo_url,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Inquiry created");
      navigate({ to: "/inquiries" });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create inquiry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6 shadow-sm">
        <h1 className="text-3xl font-bold">New Inquiry</h1>
        <p className="text-muted-foreground">
          Capture student, academic, guardian, and marks details in one view.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Student & contact</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Full name *</Label>
                <Input
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Father&apos;s name</Label>
                <Input
                  value={form.father_name}
                  onChange={(e) => setForm({ ...form, father_name: e.target.value })}
                />
              </div>
              <CnicInput
                id="inquiry-cnic"
                value={form.cnic}
                onChange={(cnic) => setForm({ ...form, cnic })}
              />
              <PhoneWhatsAppField
                id="inquiry-phone"
                label="Phone"
                required
                value={form.phone}
                onChange={(phone) => setForm({ ...form, phone })}
              />
              <div className="space-y-2">
                <Label>Email (optional)</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Gender *</Label>
                <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male (Boys)</SelectItem>
                    <SelectItem value="female">Female (Girls)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Photo (optional)</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Academic interest</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Program</Label>
                <Select
                  value={form.program_id}
                  onValueChange={(v) => setForm({ ...form, program_id: v, class_id: "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select program" />
                  </SelectTrigger>
                  <SelectContent>
                    {programs?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Academic session</Label>
                <Select
                  value={form.academic_session_id}
                  onValueChange={(v) => setForm({ ...form, academic_session_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select session" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                        {s.is_active ? " (active)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(sessionsError || sessions?.length === 0) && (
                  <p className="text-xs text-muted-foreground">
                    No sessions yet. An admin can add them under{" "}
                    <Link to="/settings/academic" className="text-primary underline">
                      Academic setup → Sessions
                    </Link>
                    .
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Year / class</Label>
                <Select
                  value={form.class_id}
                  onValueChange={(v) => setForm({ ...form, class_id: v })}
                  disabled={!form.program_id}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={form.program_id ? "Select year" : "Select program first"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {classes?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Guardian information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Guardian name</Label>
                <Input
                  value={form.guardian_name}
                  onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                />
              </div>
              <PhoneWhatsAppField
                id="inquiry-guardian-phone"
                label="Guardian phone"
                value={form.guardian_phone}
                onChange={(guardian_phone) => setForm({ ...form, guardian_phone })}
              />
              <div className="space-y-2 sm:col-span-2">
                <Label>Guardian occupation</Label>
                <Input
                  value={form.guardian_occupation}
                  onChange={(e) => setForm({ ...form, guardian_occupation: e.target.value })}
                  placeholder="Business, government job, private job, etc."
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Guardian details</Label>
                <Textarea
                  value={form.guardian_details}
                  onChange={(e) => setForm({ ...form, guardian_details: e.target.value })}
                  rows={3}
                  placeholder="Parent/guardian background, visit context, financial notes, etc."
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Matriculation</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <BoardRollLookup
                gazetteImportId={form.board_gazette_import_id}
                rollNumber={form.board_roll_number}
                onGazetteImportIdChange={(board_gazette_import_id) =>
                  setForm({ ...form, board_gazette_import_id })
                }
                onRollNumberChange={(board_roll_number) => setForm({ ...form, board_roll_number })}
                onLookupSuccess={(result: BoardGazetteLookupResult) => {
                  if (result.marksObtained != null) {
                    setForm((current) => ({
                      ...current,
                      matric_marks_obtained: String(result.marksObtained),
                      matric_marks_total: String(result.marksTotal ?? 1100),
                      board_roll_number: result.rollNumber ?? current.board_roll_number,
                    }));
                  }
                }}
              />
              <div className="space-y-2 sm:col-span-2">
                <Label>School *</Label>
                <Input
                  required
                  placeholder="Matric school name"
                  value={form.matric_school}
                  onChange={(e) => setForm({ ...form, matric_school: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Marks obtained *</Label>
                <Input
                  required
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="e.g. 950"
                  value={form.matric_marks_obtained}
                  onChange={(e) => setForm({ ...form, matric_marks_obtained: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Total marks *</Label>
                <Input
                  required
                  type="number"
                  min={1}
                  step="0.01"
                  placeholder="e.g. 1100"
                  value={form.matric_marks_total}
                  onChange={(e) => setForm({ ...form, matric_marks_total: e.target.value })}
                />
              </div>
              <div className="rounded-2xl border bg-primary/5 p-4 sm:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Matric percentage
                </p>
                <p className="mt-1 text-2xl font-black text-primary">
                  {matricPercentage == null ? "—" : `${matricPercentage.toFixed(2)}%`}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Remarks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Create inquiry"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: "/inquiries" })}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
