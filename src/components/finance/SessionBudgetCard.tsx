import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { FEE_COMPONENTS } from "@/lib/fees-types";
import { formatCurrency } from "@/lib/finance";
import type { SessionRevenueAnalytics } from "@/lib/finance-analytics";
import {
  emptyBudgetForm,
  fetchSessionFinanceBudget,
  saveSessionFinanceBudget,
} from "@/lib/finance-budget";
import { Target } from "lucide-react";
import { toast } from "sonner";

type Props = {
  sessionId: string;
  rev: SessionRevenueAnalytics;
};

export function SessionBudgetCard({ sessionId, rev }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyBudgetForm());

  const { data: stored } = useQuery({
    queryKey: ["session-budget", sessionId],
    queryFn: () => fetchSessionFinanceBudget(sessionId),
  });

  const save = useMutation({
    mutationFn: () => saveSessionFinanceBudget(sessionId, form),
    onSuccess: () => {
      toast.success("Session targets saved");
      qc.invalidateQueries({ queryKey: ["session-budget", sessionId] });
      qc.invalidateQueries({ queryKey: ["session-revenue", sessionId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = () => {
    setForm(
      stored
        ? {
            total_target: stored.total_target,
            admission_fee_target: stored.admission_fee_target,
            annual_fund_target: stored.annual_fund_target,
            annual_fee_target: stored.annual_fee_target,
            semester_fee_target: stored.semester_fee_target,
            board_registration_fee_target: stored.board_registration_fee_target,
            board_examination_fee_target: stored.board_examination_fee_target,
            notes: stored.notes,
          }
        : {
            ...emptyBudgetForm(),
            total_target: 12_000_000,
            admission_fee_target: 1_000_000,
            annual_fund_target: 2_000_000,
          },
    );
    setOpen(true);
  };

  const budget = rev.budget;
  const totalPct =
    budget && budget.totalTarget > 0
      ? Math.min(100, Math.round((rev.totalCollected / budget.totalTarget) * 100))
      : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4" />
          Session targets vs collected
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" onClick={openEdit}>
              {budget ? "Edit targets" : "Set targets"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Revenue targets — {rev.sessionLabel}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Total session target (PKR)</Label>
                <Input
                  type="number"
                  value={form.total_target || ""}
                  onChange={(e) => setForm({ ...form, total_target: Number(e.target.value) || 0 })}
                />
              </div>
              {FEE_COMPONENTS.map((c) => (
                <div key={c.key} className="space-y-2">
                  <Label>{c.label} target</Label>
                  <Input
                    type="number"
                    value={(form as Record<string, number>)[`${c.key}_target`] || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        [`${c.key}_target`]: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              ))}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={form.notes ?? ""}
                  onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                  placeholder="e.g. 100 students × avg fee"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                Save targets
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!budget ? (
          <p className="text-sm text-muted-foreground">
            Set estimated revenue targets (e.g. total 12M, annual fund 2M, admission 1M) to compare with
            actual collections.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex justify-between text-sm">
                <span>Total collected vs target</span>
                <span className="font-medium">
                  {formatCurrency(rev.totalCollected)} / {formatCurrency(budget.totalTarget)} ({totalPct}%)
                </span>
              </div>
              <Progress value={totalPct} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budget.components.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell>{c.label}</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.target)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(c.collected)}</TableCell>
                    <TableCell className="text-right">{c.percent}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
