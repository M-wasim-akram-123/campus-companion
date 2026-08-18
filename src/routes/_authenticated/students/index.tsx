import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileArchive, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deriveAcademicStanding } from "@/lib/academic";
import { isClassesOnlyEnrollment, enrollmentTypeLabel } from "@/lib/student-enrollment";
import { isCampusInchargeScoped } from "@/lib/campus-incharge";
import { isTeacherScoped } from "@/lib/teacher-scope";
import { defaultHomePathForRoles } from "@/lib/auth-routing";
import { exportStudentDefaulters, exportStudentPhoneList } from "@/lib/student-exports";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/students/")({ component: StudentsList });

function StudentsList() {
  const navigate = useNavigate();
  const { roles, teacherScope } = useAuth();
  const campusScoped = isCampusInchargeScoped(roles);
  const teacherScoped = isTeacherScoped(roles);
  const scopedView = campusScoped || teacherScoped;
  const [search, setSearch] = useState("");
  const [sessionId, setSessionId] = useState("__all__");
  const [sectionId, setSectionId] = useState("__all__");
  const [programId, setProgramId] = useState("__all__");
  const [status, setStatus] = useState("__all__");
  const [enrollmentFilter, setEnrollmentFilter] = useState("__all__");
  const [exporting, setExporting] = useState<"phones" | "defaulters" | null>(null);

  useEffect(() => {
    if (teacherScoped) {
      navigate({
        to: defaultHomePathForRoles(roles, teacherScope),
        replace: true,
      });
    }
  }, [navigate, roles, teacherScope, teacherScoped]);

  const { data: students, isLoading, error } = useQuery({
    queryKey: ["students", campusScoped ? "scoped" : teacherScoped ? "teacher" : "all"],
    enabled: !teacherScoped,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("students")
        .select(
          "*, programs(name, type, duration_years), classes(name, year_level), sections(name, gender), academic_sessions(label, start_year, end_year)",
        )
        .order("created_at", { ascending: false });
      if (queryError) throw queryError;
      // Teachers keep Intermediate and BS separate — this list is Intermediate only.
      if (teacherScoped) {
        return (data ?? []).filter(
          (s) => (s.programs as { type?: string } | null)?.type === "intermediate",
        );
      }
      return data;
    },
  });

  if (teacherScoped) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Opening your assigned teaching area…
      </div>
    );
  }

  const options = useMemo(() => {
    const sessions = new Map<string, string>();
    const sections = new Map<string, string>();
    const programs = new Map<string, string>();

    for (const s of students ?? []) {
      if (s.academic_session_id) {
        sessions.set(
          s.academic_session_id,
          (s.academic_sessions as { label?: string } | null)?.label || s.session || "Unnamed session",
        );
      }
      if (s.section_id) {
        const sec = s.sections as { name?: string; gender?: string } | null;
        const sectionLabel = sec
          ? `${sec.gender === "girls" ? "Girls" : "Boys"} — ${sec.name}`
          : "Unnamed section";
        sections.set(s.section_id, sectionLabel);
      }
      if (s.program_id) {
        programs.set(s.program_id, (s.programs as { name?: string } | null)?.name || "Unnamed program");
      }
    }

    return {
      sessions: [...sessions.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      sections: [...sections.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      programs: [...programs.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (students ?? []).filter((s) => {
      if (sessionId !== "__all__" && s.academic_session_id !== sessionId) return false;
      if (sectionId !== "__all__" && s.section_id !== sectionId) return false;
      if (programId !== "__all__" && s.program_id !== programId) return false;
      if (status !== "__all__" && s.status !== status) return false;
      const enrollmentType = (s as { enrollment_type?: string }).enrollment_type ?? "regular";
      if (enrollmentFilter === "classes_only" && enrollmentType !== "classes_only") return false;
      if (enrollmentFilter === "regular" && enrollmentType !== "regular") return false;
      if (!q) return true;

      const haystack = [
        s.full_name,
        s.roll_number,
        s.father_name,
        s.phone,
        s.guardian_name,
        s.guardian_phone,
        s.email,
        s.cnic,
        s.address,
        (s.programs as { name?: string } | null)?.name,
        (s.classes as { name?: string } | null)?.name,
        (s.sections as { name?: string } | null)?.name,
        (s.academic_sessions as { label?: string } | null)?.label,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [students, search, sessionId, sectionId, programId, status, enrollmentFilter]);

  const downloadPhoneList = () => {
    if (!filtered.length) return toast.error("No students to export");
    exportStudentPhoneList(filtered);
    toast.success(`Exported phone list for ${filtered.length} students`);
  };

  const downloadDefaulters = async () => {
    if (!filtered.length) return toast.error("No students to check");
    setExporting("defaulters");
    try {
      const studentIds = filtered.map((s) => s.id);
      const { data: installments, error: instError } = await supabase
        .from("student_fee_installments")
        .select("student_id, label, due_date, amount, paid_amount")
        .in("student_id", studentIds);
      if (instError) throw instError;

      const count = exportStudentDefaulters(filtered, installments ?? []);
      toast.success(count ? `Exported ${count} defaulters` : "No overdue balances in current list");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setSessionId("__all__");
    setSectionId("__all__");
    setProgramId("__all__");
    setStatus("__all__");
    setEnrollmentFilter("__all__");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            {teacherScoped ? "Intermediate students" : "Students"}
          </h1>
          <p className="text-muted-foreground">
            {teacherScoped
              ? "Only Intermediate students in your assigned sections (filter by session if you teach multiple years)."
              : campusScoped
                ? "Students in your assigned sections"
                : "All admitted students"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!teacherScoped && (
            <>
              <Button type="button" variant="outline" onClick={downloadPhoneList} disabled={!!exporting}>
                <Download className="mr-2 h-4 w-4" />
                Phone list
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={downloadDefaulters}
                disabled={exporting === "defaulters"}
              >
                <Download className="mr-2 h-4 w-4" />
                {exporting === "defaulters" ? "Exporting…" : "Defaulters"}
              </Button>
            </>
          )}
          {!scopedView && (
            <>
              <Button asChild variant="outline">
                <Link to="/students/documents"><FileArchive className="mr-2 h-4 w-4" />Documents</Link>
              </Button>
              <Button asChild><Link to="/admissions/new"><Plus className="mr-2 h-4 w-4" />New Admission</Link></Button>
            </>
          )}
        </div>
      </div>

      {scopedView && !isLoading && students?.length === 0 && (
        <Card className="border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950">
          {teacherScoped
            ? "No Intermediate sections are assigned to you yet. Ask Super Admin to assign Inter sections in User Management. BS students appear under My BS classes."
            : "No sections are assigned to your account yet. Ask Super Admin to assign sections in User Management."}
        </Card>
      )}

      {error && (
        <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load students"}
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.4fr_repeat(4,1fr)_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, adm no., phone, father, guardian, CNIC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sessionId} onValueChange={(v) => { setSessionId(v); setSectionId("__all__"); }}>
          <SelectTrigger><SelectValue placeholder="Session" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sessions</SelectItem>
            {options.sessions.map(([id, label]) => (
              <SelectItem key={id} value={id}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sectionId} onValueChange={setSectionId}>
          <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All sections</SelectItem>
            {options.sections.map(([id, label]) => (
              <SelectItem key={id} value={id}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={programId} onValueChange={setProgramId}>
          <SelectTrigger><SelectValue placeholder="Program" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All programs</SelectItem>
            {options.programs.map(([id, label]) => (
              <SelectItem key={id} value={id}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="graduated">Graduated</SelectItem>
            <SelectItem value="left">Left college</SelectItem>
            <SelectItem value="bad_debt">Bad debt</SelectItem>
            <SelectItem value="dropped">Dropped</SelectItem>
          </SelectContent>
        </Select>
        <Select value={enrollmentFilter} onValueChange={setEnrollmentFilter}>
          <SelectTrigger><SelectValue placeholder="Enrollment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All enrollment types</SelectItem>
            <SelectItem value="regular">Regular students</SelectItem>
            <SelectItem value="classes_only">Classes only</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={clearFilters}>
          Clear
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Showing {filtered.length} of {students?.length ?? 0} students.
      </p>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : !filtered.length ? (
          <div className="p-8 text-center text-muted-foreground">No students match these filters</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adm No.</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Father / Guardian</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Class / Section</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const program = s.programs as { name?: string; duration_years?: number } | null;
                const cls = s.classes as { name?: string; year_level?: number } | null;
                const section = s.sections as { name?: string; gender?: string } | null;
                const session = s.academic_sessions as { label?: string; start_year?: number; end_year?: number } | null;
                const standing = deriveAcademicStanding({
                  sessionStartYear: session?.start_year,
                  sessionEndYear: session?.end_year,
                  admissionYearLevel:
                    (s as { admission_year_level?: number | null }).admission_year_level ??
                    cls?.year_level,
                  programDurationYears: program?.duration_years,
                });

                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.roll_number}</TableCell>
                    <TableCell>
                      <div className="font-medium">{s.full_name}</div>
                      {s.email && <div className="text-xs text-muted-foreground">{s.email}</div>}
                    </TableCell>
                    <TableCell>
                      <div>{s.father_name || "—"}</div>
                      {(s.guardian_name || s.guardian_phone) && (
                        <div className="text-xs text-muted-foreground">
                          {s.guardian_name || "Guardian"}{s.guardian_phone ? ` · ${s.guardian_phone}` : ""}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{s.phone || "—"}</TableCell>
                    <TableCell>{program?.name || "—"}</TableCell>
                    <TableCell>
                      <div>{cls?.name || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        Current: {standing.label}{standing.isPast ? "" : ` (${standing.detail})`}
                      </div>
                      {section && (
                        <div className="text-xs text-muted-foreground">
                          {section.gender === "girls" ? "Girls" : "Boys"} — {section.name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{session?.label || s.session || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={s.status === "active" && !standing.isPast ? "default" : "secondary"}>{standing.isPast ? "past student" : s.status}</Badge>
                        {isClassesOnlyEnrollment((s as { enrollment_type?: string }).enrollment_type) && (
                          <Badge variant="outline" className="border-amber-500/50 text-amber-800">
                            {enrollmentTypeLabel("classes_only")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/students/$id" params={{ id: s.id }}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
