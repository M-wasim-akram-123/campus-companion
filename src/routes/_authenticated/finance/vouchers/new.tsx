import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createManualVoucher } from "@/lib/finance";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/vouchers/new")({
  component: NewVoucher,
});

function NewVoucher() {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([{ label: "Fee", amount: "" }]);
  const [saving, setSaving] = useState(false);

  const { data: students } = useQuery({
    queryKey: ["students-list-voucher"],
    queryFn: async () =>
      (await supabase.from("students").select("id, full_name, roll_number").order("full_name")).data ?? [],
  });

  const submit = async () => {
    if (!studentId) return toast.error("Select a student");
    const parsed = lines
      .map((l) => ({ label: l.label.trim(), amount: parseFloat(l.amount) || 0 }))
      .filter((l) => l.label && l.amount > 0);
    if (!parsed.length) return toast.error("Add at least one line with amount");
    setSaving(true);
    try {
      const v = await createManualVoucher({
        studentId,
        dueDate,
        notes: notes.trim() || undefined,
        lines: parsed,
      });
      toast.success(`Voucher ${v.voucher_number} created`);
      navigate({ to: "/finance/vouchers/$id", params: { id: v.id } });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Manual voucher</h1>
        <p className="text-muted-foreground">Create a fee challan with QR code for the student</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Voucher details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Student *</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
              <SelectContent>
                {students?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name} — {s.roll_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Due date *</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((l) => [...l, { label: "", amount: "" }])}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2">
                <Input placeholder="Description" value={line.label} onChange={(e) => {
                  const n = [...lines]; n[i].label = e.target.value; setLines(n);
                }} />
                <Input type="number" placeholder="PKR" className="w-28" value={line.amount} onChange={(e) => {
                  const n = [...lines]; n[i].amount = e.target.value; setLines(n);
                }} />
                <Button type="button" variant="ghost" size="icon" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button className="w-full" onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create voucher & print"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
