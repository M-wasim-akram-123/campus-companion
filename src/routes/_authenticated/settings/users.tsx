import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  useAuth,
  type AppRole,
  type TeacherScope,
} from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronsUpDown, ShieldCheck, UserCog, UserPlus, Users, Layers } from "lucide-react";
import { toast } from "sonner";
import { formatLastSeen } from "@/lib/auth-session";
import { CampusInchargeClassesDialog } from "@/components/settings/CampusInchargeClassesDialog";
import { TeacherIntermediateSectionsDialog } from "@/components/settings/TeacherIntermediateSectionsDialog";

export const Route = createFileRoute("/_authenticated/settings/users")({
  component: UserManagement,
});

const ROLE_OPTIONS: { role: AppRole; label: string; level: string; access: string }[] = [
  {
    role: "super_admin",
    label: "Super Admin",
    level: "Full access",
    access: "Everything: users, academic setup, fees, finance, admissions, delete records",
  },
  {
    role: "campus_incharge",
    label: "Campus Incharge",
    level: "Campus oversight",
    access: "View-only students in assigned sections; fee ledger; phone & defaulter exports",
  },
  {
    role: "registrar",
    label: "Registrar",
    level: "Academic records",
    access: "Edit student program, session, section, class, and matric marks obtained",
  },
  {
    role: "admission_officer",
    label: "Admission Officer",
    level: "Admission access",
    access: "Inquiries, admissions, students, follow-ups",
  },
  {
    role: "sub_admission_officer",
    label: "Sub Admission Officer",
    level: "Follow-up access",
    access: "View assigned inquiry follow-ups only; update follow-up date and discussion history",
  },
  {
    role: "hr",
    label: "HR",
    level: "People access",
    access: "Students/staff records and reports view; no finance setup",
  },
  {
    role: "finance_officer",
    label: "Finance Officer (Intermediate)",
    level: "Intermediate finance",
    access:
      "Intermediate fee collection, vouchers, dues, reports. Cannot see BS students or BS finance.",
  },
  {
    role: "finance_admin",
    label: "Finance Admin (Intermediate)",
    level: "Intermediate finance approval",
    access:
      "Intermediate finance dashboard, reports, cashier closing review. Cannot see BS students or BS finance.",
  },
  {
    role: "bs_finance_admin",
    label: "BS Finance Admin",
    level: "BS finance only",
    access:
      "BS fee collection, vouchers, dues, reports for BS cohorts only. Cannot see Intermediate students or Intermediate finance.",
  },
  {
    role: "cashier",
    label: "Cashier (Intermediate)",
    level: "Collection access",
    access: "Open cashier session, collect Intermediate fees, scan vouchers, close own cash drawer",
  },
  {
    role: "exam_officer",
    label: "Exam Officer",
    level: "Exam branch",
    access: "Internal tests plus BS final exams, result approval, transcripts, and merit lists",
  },
  {
    role: "hod",
    label: "Head of Department",
    level: "Department leadership",
    access: "Manage own department semesters, courses, teachers, classes, workload, and results",
  },
  {
    role: "academic_coordinator",
    label: "Academic Coordinator",
    level: "LMS academic operations",
    access: "Manage BS semesters, courses, class groups, offerings, enrollments, and timetable",
  },
  {
    role: "bs_coordinator",
    label: "BS Coordinator",
    level: "Semester lecture control",
    access:
      "Mark theory/lab lecture deliveries for assigned BS semesters (feeds visiting teacher salary)",
  },
  {
    role: "receptionist",
    label: "Receptionist",
    level: "Front desk access",
    access: "Create and follow inquiry records",
  },
  {
    role: "teacher",
    label: "Teacher",
    level: "Assigned teaching",
    access:
      "Inter students in assigned sections + BS students in assigned LMS offerings (kept separate)",
  },
];

type ManagedUser = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  last_login_at: string | null;
  is_online: boolean;
  disabled: boolean;
  roles: AppRole[];
  teacher_scope: TeacherScope;
};

type CreateForm = {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  roles: AppRole[];
  teacher_scope: TeacherScope;
};

type EditForm = {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  teacher_scope: TeacherScope;
};

async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

function roleLabel(role: AppRole) {
  return ROLE_OPTIONS.find((r) => r.role === role)?.label ?? role;
}

function toggleRole(roles: AppRole[], role: AppRole) {
  return roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
}

function RolesSelect({
  roles,
  onChange,
  className,
}: {
  roles: AppRole[];
  onChange: (roles: AppRole[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabels = ROLE_OPTIONS.filter((r) => roles.includes(r.role)).map((r) => r.label);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`w-full justify-between font-normal ${className ?? ""}`}
        >
          <span className="truncate text-left">
            {selectedLabels.length === 0
              ? "Select roles…"
              : selectedLabels.length <= 2
                ? selectedLabels.join(", ")
                : `${selectedLabels.length} roles selected`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-80 overflow-y-auto p-2">
        <div className="grid gap-1">
          {ROLE_OPTIONS.map((r) => (
            <label
              key={r.role}
              className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-accent"
            >
              <Checkbox
                className="mt-0.5"
                checked={roles.includes(r.role)}
                onCheckedChange={() => onChange(toggleRole(roles, r.role))}
              />
              <span>
                <span className="block text-sm font-semibold">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.level}</span>
              </span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserManagement() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateForm>({
    full_name: "",
    email: "",
    phone: "",
    password: "",
    roles: ["admission_officer"],
    teacher_scope: "inter",
  });
  const [editingRoles, setEditingRoles] = useState<Record<string, AppRole[]>>({});
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    full_name: "",
    email: "",
    phone: "",
    password: "",
    teacher_scope: "inter",
  });
  const [classAssignUser, setClassAssignUser] = useState<ManagedUser | null>(null);
  const [teacherAssignUser, setTeacherAssignUser] = useState<ManagedUser | null>(null);

  const {
    data,
    isLoading,
    error: usersError,
  } = useQuery({
    queryKey: ["admin-users"],
    enabled: hasRole("super_admin"),
    refetchInterval: 60_000,
    queryFn: () => adminApi<{ users: ManagedUser[] }>("/api/admin/users"),
  });

  const createUser = useMutation({
    mutationFn: () =>
      adminApi("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      toast.success("System user created");
      setForm({
        full_name: "",
        email: "",
        phone: "",
        password: "",
        roles: ["admission_officer"],
        teacher_scope: "inter",
      });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRoles = useMutation({
    mutationFn: ({ userId, roles }: { userId: string; roles: AppRole[] }) =>
      adminApi(`/api/admin/users?id=${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify({ roles }),
      }),
    onSuccess: () => {
      toast.success("Roles updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateProfile = useMutation({
    mutationFn: ({ userId, values }: { userId: string; values: EditForm }) =>
      adminApi(`/api/admin/users?id=${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          full_name: values.full_name,
          email: values.email,
          phone: values.phone,
          teacher_scope: values.teacher_scope,
          ...(values.password ? { password: values.password } : {}),
        }),
      }),
    onSuccess: () => {
      toast.success("User profile updated");
      setEditingUser(null);
      setEditForm({
        full_name: "",
        email: "",
        phone: "",
        password: "",
        teacher_scope: "inter",
      });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDisabled = useMutation({
    mutationFn: ({ userId, disabled }: { userId: string; disabled: boolean }) =>
      adminApi(`/api/admin/users?id=${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify({ disabled }),
      }),
    onSuccess: (_, variables) => {
      toast.success(variables.disabled ? "User account disabled" : "User account enabled");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUser = useMutation({
    mutationFn: (userId: string) =>
      adminApi(`/api/admin/users?id=${encodeURIComponent(userId)}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("User deleted");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEditDialog = (user: ManagedUser) => {
    setEditingUser(user);
    setEditForm({
      full_name: user.full_name ?? "",
      email: user.email,
      phone: user.phone ?? "",
      password: "",
      teacher_scope: user.teacher_scope,
    });
  };

  if (!hasRole("super_admin")) {
    return (
      <Card>
        <CardContent className="p-8">
          <p className="font-semibold">Super Admin only</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You do not have permission to manage system users.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="glass-panel overflow-hidden rounded-3xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              <ShieldCheck className="h-4 w-4" />
              Super Admin
            </div>
            <h1 className="bg-gradient-to-r from-foreground to-primary bg-clip-text text-4xl font-black tracking-tight text-transparent">
              User Management
            </h1>
            <p className="mt-2 text-muted-foreground">
              Create system users, assign dedicated roles, and control access levels.
            </p>
          </div>
          <Badge variant="secondary">{data?.users.length ?? 0} users</Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-primary" />
              Create system user
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email / login</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Temporary password</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Minimum 8 characters"
              />
            </div>

            <div className="space-y-2">
              <Label>Roles / access level</Label>
              <RolesSelect roles={form.roles} onChange={(roles) => setForm({ ...form, roles })} />
              {form.roles.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {form.roles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {roleLabel(role)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {form.roles.includes("teacher") && (
              <div className="space-y-2">
                <Label>Teacher teaching area</Label>
                <Select
                  value={form.teacher_scope}
                  onValueChange={(teacher_scope: TeacherScope) =>
                    setForm({ ...form, teacher_scope })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inter">Intermediate only</SelectItem>
                    <SelectItem value="bs">BS only</SelectItem>
                    <SelectItem value="both">Intermediate and BS</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This controls teacher navigation. Actual students, tests, and
                  courses remain limited by subject and course assignments.
                </p>
              </div>
            )}

            <Button
              className="w-full"
              disabled={createUser.isPending}
              onClick={() => createUser.mutate()}
            >
              {createUser.isPending ? "Creating..." : "Create user"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Requires `SUPABASE_SERVICE_ROLE_KEY` in server environment. Never expose that key in
              browser env vars.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              System users
            </CardTitle>
          </CardHeader>
          <CardContent>
            {usersError ? (
              <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
                <p className="font-semibold text-destructive">User management is not configured</p>
                <p className="mt-1 text-sm text-muted-foreground">{usersError.message}</p>
                {usersError.message.includes("SUPABASE_SERVICE_ROLE_KEY") ||
                usersError.message.includes("Unregistered API key") ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Auth Admin needs the legacy <code>service_role</code> JWT (starts with{" "}
                    <code>eyJ</code>) in <code>SUPABASE_SERVICE_ROLE_KEY</code>. Local{" "}
                    <code>.env</code> is not used on staging — set the same value in the host
                    environment (Cloudflare/Lovable secrets), without quotes, then redeploy.
                  </p>
                ) : null}
              </div>
            ) : isLoading ? (
              <p className="text-sm text-muted-foreground">Loading users...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Teaching area</TableHead>
                    <TableHead>Presence</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last sign in</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.users ?? []).map((u) => {
                    const roles = editingRoles[u.id] ?? u.roles;
                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <p className="font-semibold">{u.full_name || "Unnamed user"}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </TableCell>
                        <TableCell>{u.phone || "—"}</TableCell>
                        <TableCell>
                          <div className="min-w-[200px] space-y-2">
                            <RolesSelect
                              roles={roles}
                              onChange={(next) =>
                                setEditingRoles({ ...editingRoles, [u.id]: next })
                              }
                            />
                            <div className="flex flex-wrap gap-1">
                              {roles.length === 0 ? (
                                <span className="text-xs text-muted-foreground">No roles</span>
                              ) : (
                                roles.map((role) => (
                                  <Badge key={role} variant="secondary" className="text-xs">
                                    {roleLabel(role)}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {roles.includes("teacher") ? (
                            <Badge variant="outline">
                              {u.teacher_scope === "inter"
                                ? "Intermediate"
                                : u.teacher_scope === "bs"
                                  ? "BS"
                                  : "Inter + BS"}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                u.is_online ? "bg-emerald-500" : "bg-muted-foreground/40"
                              }`}
                              title={u.is_online ? "Online" : "Offline"}
                            />
                            <div className="text-xs">
                              <p className="font-medium">{u.is_online ? "Online" : "Offline"}</p>
                              <p className="text-muted-foreground">
                                {formatLastSeen(u.last_seen_at)}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.disabled ? "destructive" : "secondary"}>
                            {u.disabled ? "Disabled" : "Enabled"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.last_sign_in_at
                            ? new Date(u.last_sign_in_at).toLocaleString()
                            : "Never"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEditDialog(u)}>
                              Edit
                            </Button>
                            {roles.includes("campus_incharge") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setClassAssignUser(u)}
                              >
                                <Layers className="mr-1 h-3.5 w-3.5" />
                                Sections
                              </Button>
                            )}
                            {roles.includes("teacher") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setTeacherAssignUser(u)}
                              >
                                <Layers className="mr-1 h-3.5 w-3.5" />
                                Inter classes
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateRoles.mutate({ userId: u.id, roles })}
                              disabled={updateRoles.isPending}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant={u.disabled ? "secondary" : "outline"}
                              onClick={() =>
                                toggleDisabled.mutate({ userId: u.id, disabled: !u.disabled })
                              }
                              disabled={toggleDisabled.isPending}
                            >
                              {u.disabled ? "Enable" : "Disable"}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="destructive">
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete system user?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This removes login access for {u.full_name || u.email}. It does
                                    not delete student/admission records.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => deleteUser.mutate(u.id)}
                                  >
                                    Delete user
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-4 w-4 text-primary" />
            Role access matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Access level</TableHead>
                <TableHead>System access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROLE_OPTIONS.map((r) => (
                <TableRow key={r.role}>
                  <TableCell className="font-semibold">{r.label}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.level}</Badge>
                  </TableCell>
                  <TableCell>{r.access}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email / login</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            {editingUser?.roles.includes("teacher") && (
              <div className="space-y-2">
                <Label>Teacher teaching area</Label>
                <Select
                  value={editForm.teacher_scope}
                  onValueChange={(teacher_scope: TeacherScope) =>
                    setEditForm({ ...editForm, teacher_scope })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inter">Intermediate only</SelectItem>
                    <SelectItem value="bs">BS only</SelectItem>
                    <SelectItem value="both">Intermediate and BS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>New password</Label>
              <Input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                placeholder="Leave blank to keep current password"
              />
              <p className="text-xs text-muted-foreground">
                Minimum 8 characters when changing password.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                updateProfile.isPending || !editForm.full_name.trim() || !editForm.email.trim()
              }
              onClick={() => {
                if (!editingUser) return;
                updateProfile.mutate({ userId: editingUser.id, values: editForm });
              }}
            >
              {updateProfile.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CampusInchargeClassesDialog
        userId={classAssignUser?.id ?? null}
        userName={classAssignUser?.full_name || classAssignUser?.email || "User"}
        open={!!classAssignUser}
        onOpenChange={(open) => !open && setClassAssignUser(null)}
      />
      <TeacherIntermediateSectionsDialog
        userId={teacherAssignUser?.id ?? null}
        userName={teacherAssignUser?.full_name || teacherAssignUser?.email || "User"}
        open={!!teacherAssignUser}
        onOpenChange={(open) => !open && setTeacherAssignUser(null)}
      />
    </div>
  );
}
