import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, UserCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { fetchProfileNames, fetchProfilesByRole } from "@/lib/staff";
import { canAssignFollowUpOfficer, canManageInquiries, isFollowUpOnlyOfficer } from "@/lib/inquiry-permissions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inquiries/")({ component: InquiriesList });

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-600 text-white border-blue-700",
  follow_up: "bg-amber-500 text-slate-950 border-amber-600",
  interested: "bg-purple-600 text-white border-purple-700",
  ready_for_admission: "bg-cyan-600 text-white border-cyan-700",
  converted: "bg-emerald-600 text-white border-emerald-700",
  lost: "bg-slate-600 text-white border-slate-700",
};

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function InquiriesList() {
  const qc = useQueryClient();
  const { user, hasRole, roles } = useAuth();
  const followUpOnly = isFollowUpOnlyOfficer(roles);
  const canBulkAssign = canAssignFollowUpOfficer(roles);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkOfficerId, setBulkOfficerId] = useState("");

  const { data: inquiries, isLoading } = useQuery({
    queryKey: ["inquiries", status, followUpOnly ? user?.id : "all"],
    enabled: !followUpOnly || !!user?.id,
    queryFn: async () => {
      let q = supabase
        .from("inquiries")
        .select("*, programs(name)")
        .order("created_at", { ascending: false });
      if (followUpOnly && user?.id) q = q.eq("follow_up_assigned_to", user.id);
      if (status !== "all") q = q.eq("status", status as any);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const profileIds = useMemo(
    () =>
      [
        ...new Set(
          (inquiries ?? []).flatMap((i) => [i.assigned_to, i.follow_up_assigned_to].filter(Boolean) as string[]),
        ),
      ],
    [inquiries],
  );

  const { data: nameMap } = useQuery({
    queryKey: ["inquiry-assignee-names", profileIds],
    enabled: profileIds.length > 0,
    queryFn: () => fetchProfileNames(profileIds),
  });

  const { data: followUpOfficers } = useQuery({
    queryKey: ["follow-up-officers"],
    enabled: canBulkAssign,
    queryFn: () => fetchProfilesByRole("sub_admission_officer"),
  });

  const { data: officerRoleIds } = useQuery({
    queryKey: ["inquiry-admission-officer-role-ids", profileIds],
    enabled: profileIds.length > 0 && hasRole("super_admin"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admission_officer")
        .in("user_id", profileIds);
      if (error) throw error;
      return new Set((data ?? []).map((row) => row.user_id));
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (inquiries ?? []).filter((i) => {
      if (!q) return true;
      const haystack = [
        i.full_name,
        i.father_name,
        i.phone,
        i.email,
        i.matric_school,
        i.notes,
        (i.programs as { name?: string } | null)?.name,
        i.assigned_to ? nameMap?.get(i.assigned_to) : "unassigned",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [inquiries, search, nameMap]);

  const total = inquiries?.length ?? 0;
  const assigned = (inquiries ?? []).filter((i) => i.assigned_to).length;
  const unassigned = total - assigned;
  const converted = (inquiries ?? []).filter((i) => i.status === "converted").length;

  const assignedToMe = filtered.filter((i) => i.assigned_to === user?.id);
  const unassignedRows = filtered.filter((i) => !i.assigned_to);
  const allRows = filtered;
  const officerStats = useMemo(() => {
    const rows = new Map<string, { name: string; assigned: number; converted: number }>();
    for (const inquiry of inquiries ?? []) {
      if (!inquiry.assigned_to) continue;
      if (officerRoleIds && !officerRoleIds.has(inquiry.assigned_to)) continue;
      const current = rows.get(inquiry.assigned_to) ?? {
        name: nameMap?.get(inquiry.assigned_to) ?? "Unknown",
        assigned: 0,
        converted: 0,
      };
      current.assigned += 1;
      if (inquiry.status === "converted") current.converted += 1;
      rows.set(inquiry.assigned_to, current);
    }
    return [...rows.values()].sort((a, b) => b.assigned - a.assigned);
  }, [inquiries, nameMap, officerRoleIds]);

  const showAdminStats = hasRole("super_admin");
  const showOfficerQueues = hasRole("admission_officer") && !hasRole("super_admin");

  const toggleSelection = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const bulkAssignMutation = useMutation({
    mutationFn: async ({ ids, officerId }: { ids: string[]; officerId: string | null }) => {
      const assignedAt = officerId ? new Date().toISOString() : null;
      const updatedAt = new Date().toISOString();
      const { error } = await supabase
        .from("inquiries")
        .update({
          follow_up_assigned_to: officerId,
          follow_up_assigned_at: assignedAt,
          updated_at: updatedAt,
        })
        .in("id", ids);
      if (error) throw error;

      const { error: historyError } = await supabase.from("inquiry_interactions").insert(
        ids.map((inquiryId) => ({
          inquiry_id: inquiryId,
          interaction_type: "assignment" as const,
          remarks: officerId
            ? "Follow-up officer assigned in bulk from inquiries list."
            : "Follow-up officer cleared in bulk from inquiries list.",
          created_by: user?.id ?? null,
        })),
      );
      if (historyError) throw historyError;
    },
    onSuccess: (_data, { ids, officerId }) => {
      toast.success(
        officerId
          ? `Assigned follow-up officer to ${ids.length} ${ids.length === 1 ? "inquiry" : "inquiries"}`
          : `Cleared follow-up officer on ${ids.length} ${ids.length === 1 ? "inquiry" : "inquiries"}`,
      );
      setSelectedIds(new Set());
      setBulkOfficerId("");
      qc.invalidateQueries({ queryKey: ["inquiries"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runBulkAssign = (officerId: string | null) => {
    const ids = [...selectedIds];
    if (!ids.length) return toast.error("Select at least one inquiry");
    if (officerId && !followUpOfficers?.some((officer) => officer.id === officerId)) {
      return toast.error("Choose a valid follow-up officer");
    }
    bulkAssignMutation.mutate({ ids, officerId });
  };

  const tableSelectionProps = canBulkAssign
    ? {
        enableSelection: true as const,
        selectedIds,
        onToggleSelection: toggleSelection,
        onToggleSelectAll: toggleSelectAll,
      }
    : {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{followUpOnly ? "My follow-ups" : "Inquiries"}</h1>
          <p className="text-muted-foreground">
            {followUpOnly
              ? "Inquiries assigned to you for follow-up only"
              : "Prospective student inquiries"}
          </p>
        </div>
        {canManageInquiries(roles) && (
          <Button asChild>
            <Link to="/inquiries/new">
              <Plus className="mr-2 h-4 w-4" />
              New Inquiry
            </Link>
          </Button>
        )}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, father, program, school..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="follow_up">Follow up</SelectItem>
            <SelectItem value="interested">Interested</SelectItem>
            <SelectItem value="ready_for_admission">Ready for admission</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {canBulkAssign && selectedIds.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div>
              <p className="text-sm font-semibold">{selectedIds.size} selected</p>
              <p className="text-xs text-muted-foreground">Assign a sub admission officer for follow-up work</p>
            </div>
            <div className="flex min-w-[220px] flex-1 flex-col gap-2 sm:max-w-xs">
              <Label htmlFor="bulk-follow-up-officer">Follow-up officer</Label>
              {followUpOfficers?.length ? (
                <Select value={bulkOfficerId || "__none__"} onValueChange={(v) => setBulkOfficerId(v === "__none__" ? "" : v)}>
                  <SelectTrigger id="bulk-follow-up-officer">
                    <SelectValue placeholder="Choose officer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Choose officer...</SelectItem>
                    {followUpOfficers.map((officer) => (
                      <SelectItem key={officer.id} value={officer.id}>
                        {officer.full_name || officer.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No sub admission officers yet. Create one in Settings → User Management.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={!bulkOfficerId || bulkAssignMutation.isPending}
                onClick={() => runBulkAssign(bulkOfficerId)}
              >
                {bulkAssignMutation.isPending ? "Assigning..." : "Assign follow-up"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={bulkAssignMutation.isPending}
                onClick={() => runBulkAssign(null)}
              >
                Clear assignment
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showAdminStats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total inquiries" value={total} />
            <StatCard label="Assigned" value={assigned} />
            <StatCard label="Unassigned" value={unassigned} />
            <StatCard label="Converted" value={converted} />
          </div>

          {!!officerStats.length && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" />
                  Officer conversion stats
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {officerStats.map((row) => {
                  const pct = row.assigned > 0 ? Math.round((row.converted / row.assigned) * 100) : 0;
                  return (
                    <div key={row.name} className="rounded-2xl border bg-muted/30 p-3">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Assigned {row.assigned} {"->"} converted {row.converted}
                      </p>
                      <p className="text-xs text-muted-foreground">{pct}% conversion</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {isLoading ? (
        <Card><div className="p-8 text-center text-muted-foreground">Loading...</div></Card>
      ) : showOfficerQueues ? (
        <Tabs defaultValue="mine" className="space-y-4">
          <div className="glass-panel rounded-3xl p-2">
            <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl bg-transparent p-0">
              <TabsTrigger value="mine" className="rounded-2xl py-3">
                Assigned to me
                <Badge variant="secondary" className="ml-2">{assignedToMe.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="unassigned" className="rounded-2xl py-3">
                Unassigned
                <Badge variant="secondary" className="ml-2">{unassignedRows.length}</Badge>
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="mine" className="mt-0">
            <InquiryTable
              title="Assigned to me"
              description="Select inquiries and use bulk assign above to send follow-up work to a sub admission officer."
              rows={assignedToMe}
              nameMap={nameMap}
              icon="assigned"
              {...tableSelectionProps}
            />
          </TabsContent>
          <TabsContent value="unassigned" className="mt-0">
            <InquiryTable
              title="Unassigned inquiries"
              description="Open any inquiry to automatically assign it to yourself, or bulk assign follow-up officers from the list."
              rows={unassignedRows}
              nameMap={nameMap}
              icon="unassigned"
              {...tableSelectionProps}
            />
          </TabsContent>
        </Tabs>
      ) : followUpOnly ? (
        <InquiryTable
          title={`Assigned follow-ups (${filtered.length})`}
          description="Open an inquiry to record follow-up discussion and set the next follow-up date."
          rows={filtered}
          nameMap={nameMap}
          icon="assigned"
          showFollowUpOfficer={false}
        />
      ) : (
        <InquiryTable
          title={`All inquiries (${filtered.length})`}
          description="Select inquiries and bulk assign a sub admission officer for follow-up."
          rows={allRows}
          nameMap={nameMap}
          icon="all"
          {...tableSelectionProps}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function InquiryTable({
  title,
  description,
  rows,
  nameMap,
  icon,
  showFollowUpOfficer = true,
  enableSelection = false,
  selectedIds,
  onToggleSelection,
  onToggleSelectAll,
}: {
  title: string;
  description?: string;
  rows: any[];
  nameMap?: Map<string, string>;
  icon: "assigned" | "unassigned" | "all";
  showFollowUpOfficer?: boolean;
  enableSelection?: boolean;
  selectedIds?: Set<string>;
  onToggleSelection?: (id: string, checked: boolean) => void;
  onToggleSelectAll?: (ids: string[], checked: boolean) => void;
}) {
  const Icon = icon === "assigned" ? UserCheck : Users;
  const rowIds = rows.map((row) => row.id as string);
  const allSelected = enableSelection && rowIds.length > 0 && rowIds.every((id) => selectedIds?.has(id));
  const someSelected = enableSelection && rowIds.some((id) => selectedIds?.has(id));

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </span>
          <span>{title}</span>
        </CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="p-0">
        {!rows.length ? (
          <div className="p-8 text-center text-muted-foreground">No inquiries found</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {enableSelection && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={(checked) => onToggleSelectAll?.(rowIds, checked === true)}
                      aria-label="Select all inquiries in this list"
                    />
                  </TableHead>
                )}
                <TableHead>Student</TableHead>
                <TableHead>Father</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Assigned officer</TableHead>
                {showFollowUpOfficer && <TableHead>Follow-up officer</TableHead>}
                <TableHead>Follow-up date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => {
                const program = i.programs as { name?: string } | null;
                return (
                  <TableRow key={i.id}>
                    {enableSelection && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds?.has(i.id) ?? false}
                          onCheckedChange={(checked) => onToggleSelection?.(i.id, checked === true)}
                          aria-label={`Select ${i.full_name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="font-medium">{i.full_name}</div>
                      {i.email && <div className="text-xs text-muted-foreground">{i.email}</div>}
                    </TableCell>
                    <TableCell>{i.father_name || "—"}</TableCell>
                    <TableCell>{i.phone}</TableCell>
                    <TableCell>{program?.name || "—"}</TableCell>
                    <TableCell>{i.assigned_to ? nameMap?.get(i.assigned_to) ?? "Assigned" : "Unassigned"}</TableCell>
                    {showFollowUpOfficer && (
                      <TableCell>
                        {i.follow_up_assigned_to ? nameMap?.get(i.follow_up_assigned_to) ?? "Assigned" : "—"}
                      </TableCell>
                    )}
                    <TableCell>{i.follow_up_date || "—"}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[i.status]}>{statusLabel(i.status)}</Badge>
                    </TableCell>
                    <TableCell>{new Date(i.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/inquiries/$id" params={{ id: i.id }}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
