import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { uploadStudentPhoto } from "@/lib/photo-upload";

export const Route = createFileRoute("/_authenticated/inquiries/new")({ component: NewInquiry });

function NewInquiry() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    full_name: "", phone: "", email: "", program_id: "", notes: "", follow_up_date: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await supabase.from("programs").select("*")).data ?? [],
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let photo_url: string | null = null;
      if (photo) photo_url = await uploadStudentPhoto(photo, "inquiries");

      const { error } = await supabase.from("inquiries").insert({
        full_name: form.full_name,
        phone: form.phone,
        email: form.email || null,
        program_id: form.program_id || null,
        notes: form.notes || null,
        follow_up_date: form.follow_up_date || null,
        photo_url,
        created_by: user?.id,
      });
      if (error) throw error;
      toast.success("Inquiry created");
      navigate({ to: "/inquiries" });
    } catch (e: any) {
      toast.error(e.message);
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
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Full name *</Label>
                <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone *</Label>
                <Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Program</Label>
                <Select value={form.program_id} onValueChange={(v) => setForm({ ...form, program_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
                  <SelectContent>
                    {programs?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Follow-up date</Label>
                <Input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Photo</Label>
                <Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              </div>
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
