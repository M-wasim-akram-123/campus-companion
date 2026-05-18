import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sectionGenderLabel, studentGenderToSectionGender } from "@/lib/academic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { uploadStudentPhoto } from "@/lib/photo-upload";
import { fetchStaffProfiles } from "@/lib/staff";

export const Route = createFileRoute("/_authenticated/inquiries/new")({ component: NewInquiry });

function NewInquiry() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    full_name: "",
    father_name: "",
    phone: "",
    email: "",
    program_id: "",
    class_id: "",
    academic_session_id: "",
    gender: "",
    assigned_to: "",
    preferred_section_id: "",
    matric_school: "",
    matric_marks_obtained: "",
    matric_marks_total: "",
    notes: "",
    follow_up_date: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: officerProfile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: staffMembers } = useQuery({
    queryKey: ["staff-profiles"],
    queryFn: fetchStaffProfiles,
  });

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
    setSaving(true);
    try {
      let photo_url: string | null = null;
      if (photo) photo_url = await uploadStudentPhoto(photo, "inquiries");

      const marksObtained = form.matric_marks_obtained ? parseFloat(form.matric_marks_obtained) : null;
      const marksTotal = form.matric_marks_total ? parseFloat(form.matric_marks_total) : null;

      const { error } = await supabase.from("inquiries").insert({
        full_name: form.full_name.trim(),
        father_name: form.father_name.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        gender: form.gender,
        program_id: form.program_id || null,
        preferred_section_id: form.preferred_section_id || null,
        assigned_to: form.assigned_to || null,
        matric_school: form.matric_school.trim() || null,
        matric_marks_obtained: marksObtained,
        matric_marks_total: marksTotal,
        notes: form.notes || null,
        follow_up_date: form.follow_up_date || null,
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Inquiry</h1>
        <p className="text-muted-foreground">Capture a prospective student inquiry</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Inquiry details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Full name *</Label>
                <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Father&apos;s name</Label>
                <Input
                  value={form.father_name}
                  onChange={(e) => setForm({ ...form, father_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone *</Label>
                <Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email (optional)</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Gender *</Label>
                <Select
                  value={form.gender}
                  onValueChange={(v) => setForm({ ...form, gender: v, preferred_section_id: "" })}
                >
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male (Boys)</SelectItem>
                    <SelectItem value="female">Female (Girls)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Inquiry officer</Label>
                <Input
                  readOnly
                  disabled
                  value={officerProfile?.full_name || user?.email || "—"}
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Assign to (optional)</Label>
                <Select
                  value={form.assigned_to || "__none__"}
                  onValueChange={(v) => setForm({ ...form, assigned_to: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {staffMembers?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name || s.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Program</Label>
                <Select
                  value={form.program_id}
                  onValueChange={(v) =>
                    setForm({ ...form, program_id: v, class_id: "", preferred_section_id: "" })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
                  <SelectContent>
                    {programs?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Academic session (optional)</Label>
                <Select
                  value={form.academic_session_id}
                  onValueChange={(v) => setForm({ ...form, academic_session_id: v, preferred_section_id: "" })}
                >
                  <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
                  <SelectContent>
                    {sessions?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}{s.is_active ? " (active)" : ""}
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
              {form.program_id && (
                <div className="space-y-2">
                  <Label>Year / class</Label>
                  <Select
                    value={form.class_id}
                    onValueChange={(v) => setForm({ ...form, class_id: v, preferred_section_id: "" })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                    <SelectContent>
                      {classes?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.class_id && form.academic_session_id && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Preferred section (optional)</Label>
                  <Select
                    value={form.preferred_section_id}
                    onValueChange={(v) => setForm({ ...form, preferred_section_id: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                    <SelectContent>
                      {sections?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {sectionGenderLabel(s.gender)} — {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sections?.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Create sections in{" "}
                      <Link to="/settings/academic" className="text-primary underline">
                        Academic setup → Sections
                      </Link>{" "}
                      (program, year, session, boys/girls).
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label>Photo (optional)</Label>
                <Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              </div>
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-medium">Matriculation</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>School</Label>
                  <Input
                    placeholder="Matric school name"
                    value={form.matric_school}
                    onChange={(e) => setForm({ ...form, matric_school: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Marks obtained</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="e.g. 950"
                    value={form.matric_marks_obtained}
                    onChange={(e) => setForm({ ...form, matric_marks_obtained: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Total marks</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="e.g. 1100"
                    value={form.matric_marks_total}
                    onChange={(e) => setForm({ ...form, matric_marks_total: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Follow-up date (optional)</Label>
              <Input
                type="date"
                value={form.follow_up_date}
                onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">You can set or change this later from the inquiry detail page.</p>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={4} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Create inquiry"}</Button>
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/inquiries" })}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
