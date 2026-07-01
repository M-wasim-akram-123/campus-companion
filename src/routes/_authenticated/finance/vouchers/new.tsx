import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { createManualVoucher, fetchStudentInstallments, formatCurrency, getOpenVoucherForInstallment, installmentBalance } from "@/lib/finance";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/finance/vouchers/new")({
  component: NewVoucher,
});

function NewVoucher() {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [selectedInstallmentIds, setSelectedInstallmentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: students } = useQuery({
    queryKey: ["students-list-voucher"],
    queryFn: async () =>
      (await supabase.from("students").select("id, full_name, roll_number").order("full_name")).data ?? [],
  });

  const { data: installments, isLoading: installmentsLoading } = useQuery({
    queryKey: ["manual-voucher-installments", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const rows = await fetchStudentInstallments(studentId);
      return Promise.all(rows.map(async (inst) => ({
        ...inst,
        balance: installmentBalance(inst),
        openVoucher: await getOpenVoucherForInstallment(inst.id),
      })));
    },
  });

  const unpaidInstallments = (installments ?? []).filter((inst) => inst.balance > 0);
  const selectedStudent = students?.find((student) => student.id === studentId);
  const selectedInstallmentLines = unpaidInstallments
    .filter((inst) => selectedInstallmentIds.includes(inst.id) && !inst.openVoucher)
    .map((inst) => ({ label: inst.label, amount: inst.balance, installmentId: inst.id }));

  const submit = async () => {
    if (!studentId) return toast.error("Select a student");
    if (!dueDate) return toast.error("Due date is required");
    if (!selectedInstallmentLines.length) return toast.error("Select at least one unpaid fee head");
    setSaving(true);
    try {
      const v = await createManualVoucher({
        studentId,
        dueDate,
        notes: notes.trim() || undefined,
        lines: selectedInstallmentLines,
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Manual voucher</h1>
        <p className="text-muted-foreground">Create a fee challan with QR code for the student</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Voucher details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Student *</Label>
            <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={studentPickerOpen}
                  className="w-full justify-between"
                >
                  {selectedStudent ? `${selectedStudent.full_name} - ${selectedStudent.roll_number}` : "Search student by name or roll no"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Type student name or roll no..." />
                  <CommandList>
                    <CommandEmpty>No student found.</CommandEmpty>
                    <CommandGroup>
                      {students?.map((student) => (
                        <CommandItem
                          key={student.id}
                          value={`${student.full_name} ${student.roll_number}`}
                          onSelect={() => {
                            setStudentId(student.id);
                            setSelectedInstallmentIds([]);
                            setStudentPickerOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", studentId === student.id ? "opacity-100" : "opacity-0")} />
                          <span>
                            {student.full_name}
                            <br />
                            <span className="text-xs text-muted-foreground">{student.roll_number}</span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label>Due date *</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {studentId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Unpaid fee heads</Label>
                {unpaidInstallments.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedInstallmentIds(unpaidInstallments.filter((inst) => !inst.openVoucher).map((inst) => inst.id))}
                  >
                    Select all available
                  </Button>
                )}
              </div>
              {installmentsLoading ? (
                <p className="text-sm text-muted-foreground">Loading unpaid fee heads...</p>
              ) : unpaidInstallments.length ? (
                <div className="space-y-2 rounded-2xl border p-3">
                  {unpaidInstallments.map((inst) => {
                    const disabled = !!inst.openVoucher;
                    return (
                      <label key={inst.id} className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                        <Checkbox
                          checked={selectedInstallmentIds.includes(inst.id)}
                          disabled={disabled}
                          onCheckedChange={(checked) => {
                            setSelectedInstallmentIds((current) =>
                              checked === true ? [...new Set([...current, inst.id])] : current.filter((id) => id !== inst.id),
                            );
                          }}
                        />
                        <span className="flex-1">
                          <span className="font-medium">{inst.label}</span>
                          <br />
                          <span className="text-xs text-muted-foreground">
                            Due {inst.due_date} · Balance {formatCurrency(inst.balance)}
                            {disabled && ` · open voucher ${inst.openVoucher?.voucher_number}`}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-2xl border p-3 text-sm text-muted-foreground">No unpaid fee heads found for this student.</p>
              )}
            </div>
          )}

          <Button className="w-full" onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create voucher & print"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
