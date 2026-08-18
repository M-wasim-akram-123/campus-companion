import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Presentation } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canManageLmsTeachers, canManageTeacherCompensation } from "@/lib/lms/permissions";
import {
  listDepartments,
  listTeacherCandidates,
  listTeacherProfiles,
  saveTeacherProfile,
} from "@/lib/lms/api";
import { teacherProfileSchema } from "@/lib/lms/schemas";
import { LmsPageHeader } from "@/components/lms/LmsPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/lms/teachers")({
  component: LmsTeachersPage,
});

function LmsTeachersPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canManage = canManageLmsTeachers(roles);
  const canManagePay = canManageTeacherCompensation(roles);
  const [userId, setUserId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [qualification, setQualification] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [experience, setExperience] = useState("0");
  const [employmentType, setEmploymentType] = useState<"permanent" | "visiting" | "contract">(
    "permanent",
  );
  const [payBasis, setPayBasis] = useState<"fixed_salary" | "lecture_wise" | "hourly">(
    "fixed_salary",
  );
  const [fixedSalary, setFixedSalary] = useState("0");
  const [lectureRate, setLectureRate] = useState("0");
  const [hourlyRate, setHourlyRate] = useState("0");

  const { data: departments = [] } = useQuery({
    queryKey: ["lms-departments"],
    queryFn: listDepartments,
  });
  const { data: candidates = [] } = useQuery({
    queryKey: ["lms-teacher-candidates"],
    queryFn: listTeacherCandidates,
  });
  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ["lms-teachers"],
    queryFn: listTeacherProfiles,
  });
  const save = useMutation({
    mutationFn: saveTeacherProfile,
    onSuccess: () => {
      toast.success("Teacher profile saved");
      setUserId("");
      setEmployeeCode("");
      setQualification("");
      setSpecialization("");
      qc.invalidateQueries({ queryKey: ["lms-teachers"] });
      qc.invalidateQueries({ queryKey: ["lms-dashboard"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const candidate = candidates.find((row) => row.id === userId);
    const parsed = teacherProfileSchema.safeParse({
      user_id: userId,
      department_id: departmentId,
      employee_code: employeeCode,
      qualification,
      specialization,
      cnic: "",
      phone: candidate?.phone ?? "",
      email: "",
      address: "",
      experience_years: experience,
      employment_type: employmentType,
      pay_basis: payBasis,
      fixed_salary: fixedSalary,
      per_lecture_rate: lectureRate,
      hourly_rate: hourlyRate,
      hired_on: "",
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message);
    save.mutate(parsed.data);
  };

  return (
    <div className="space-y-6">
      <LmsPageHeader
        title="Teacher Management"
        description="Extend teacher login accounts with department, qualification, employment, and salary structure."
        actions={
          roles.includes("super_admin") ? (
            <Button asChild variant="outline">
              <Link to="/settings/users">Create login account</Link>
            </Button>
          ) : undefined
        }
      />
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create or update teacher profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Teacher account">
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Department">
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Employee code">
                <Input
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                  placeholder="T-001"
                />
              </Field>
              <Field label="Experience (years)">
                <Input
                  type="number"
                  step="0.5"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                />
              </Field>
              <Field label="Qualification">
                <Input
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                  placeholder="MS Computer Science"
                />
              </Field>
              <Field label="Specialization">
                <Input value={specialization} onChange={(e) => setSpecialization(e.target.value)} />
              </Field>
              <Field label="Employment type">
                <Select
                  value={employmentType}
                  onValueChange={(v) => setEmploymentType(v as typeof employmentType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permanent">Permanent</SelectItem>
                    <SelectItem value="visiting">Visiting</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Pay basis">
                <Select
                  value={payBasis}
                  onValueChange={(v) => setPayBasis(v as typeof payBasis)}
                  disabled={!canManagePay}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed_salary">Fixed salary</SelectItem>
                    <SelectItem value="lecture_wise">Lecture wise</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Fixed salary">
                <Input
                  type="number"
                  value={fixedSalary}
                  onChange={(e) => setFixedSalary(e.target.value)}
                  disabled={!canManagePay}
                />
              </Field>
              <Field label="Per lecture">
                <Input
                  type="number"
                  value={lectureRate}
                  onChange={(e) => setLectureRate(e.target.value)}
                  disabled={!canManagePay}
                />
              </Field>
              <Field label="Hourly wage">
                <Input
                  type="number"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  disabled={!canManagePay}
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save teacher"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Faculty</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading teachers…</p>
          ) : !teachers.length ? (
            <div className="rounded-2xl border border-dashed py-12 text-center">
              <Presentation className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No LMS teacher profiles</p>
              <p className="text-sm text-muted-foreground">
                Create a teacher login first, then add the academic profile.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Qualification</TableHead>
                  <TableHead>Employment</TableHead>
                  <TableHead>Pay</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map((teacher) => (
                  <TableRow key={teacher.user_id}>
                    <TableCell className="font-medium">
                      {candidates.find((c) => c.id === teacher.user_id)?.fullName ??
                        teacher.email ??
                        "Teacher"}
                    </TableCell>
                    <TableCell>{teacher.employee_code ?? "—"}</TableCell>
                    <TableCell>
                      {departments.find((d) => d.id === teacher.department_id)?.code ?? "—"}
                    </TableCell>
                    <TableCell>{teacher.qualification ?? "—"}</TableCell>
                    <TableCell className="capitalize">{teacher.employment_type}</TableCell>
                    <TableCell>{teacher.pay_basis.replaceAll("_", " ")}</TableCell>
                    <TableCell>
                      <Badge variant={teacher.is_active ? "default" : "secondary"}>
                        {teacher.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
