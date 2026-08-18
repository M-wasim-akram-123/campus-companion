import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canManageLmsAcademics } from "@/lib/lms/permissions";
import { listDepartments, listStaffCandidates, updateDepartment } from "@/lib/lms/api";
import { LmsPageHeader } from "@/components/lms/LmsPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/lms/departments")({
  component: LmsDepartmentsPage,
});

function LmsDepartmentsPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canManage = canManageLmsAcademics(roles);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["lms-departments"],
    queryFn: listDepartments,
  });
  const { data: hods = [] } = useQuery({
    queryKey: ["lms-staff-candidates", "hod"],
    queryFn: () => listStaffCandidates("hod"),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateDepartment(id, { is_active: isActive }),
    onSuccess: () => {
      toast.success("Program updated");
      qc.invalidateQueries({ queryKey: ["lms-departments"] });
      qc.invalidateQueries({ queryKey: ["lms-dashboard"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <LmsPageHeader
        title="BS programs (LMS)"
        description="Department and program are the same. Create BS programs under Settings → Academic; they sync here automatically."
      />

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" />
              Create programs in Academic setup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Use <strong>Settings → Academic → Programs</strong> to add BS Computer Science, Software
              Engineering, etc. This page only shows the synced LMS record (semester count / HOD /
              active).
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings/academic">Open Academic setup</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Synced BS programs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !departments.length ? (
            <div className="rounded-2xl border border-dashed py-12 text-center">
              <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No BS programs synced yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a BS program in Academic setup to populate this list.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Program</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Semesters</TableHead>
                  <TableHead>HOD</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead className="text-right">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((department) => (
                  <TableRow key={department.id}>
                    <TableCell className="font-medium">{department.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{department.code}</Badge>
                    </TableCell>
                    <TableCell>{department.semester_count}</TableCell>
                    <TableCell>
                      {hods.find((hod) => hod.id === department.hod_user_id)?.fullName ??
                        "Not assigned"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={department.is_active ? "default" : "secondary"}>
                        {department.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={toggle.isPending}
                          onClick={() =>
                            toggle.mutate({
                              id: department.id,
                              isActive: !department.is_active,
                            })
                          }
                        >
                          {department.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
