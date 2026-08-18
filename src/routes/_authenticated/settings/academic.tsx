import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createProgramWithClasses, sectionGenderLabel, type SectionGender } from "@/lib/academic";
import {
  formatSessionLabel,
  listAcademicSessions,
  programTypeLabel,
  sessionsForProgramType,
  suggestSessionEndYear,
  type AcademicSessionRow,
  type ProgramType as SessionProgramType,
} from "@/lib/academic-sessions";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { runAcademicPromotionsIfDue } from "@/lib/student-promotion-api";

type ProgramType = Database["public"]["Enums"]["program_type"];

export const Route = createFileRoute("/_authenticated/settings/academic")({
  component: AcademicSetup,
});

function AcademicSetup() {
  const { error: dbError } = useQuery({
    queryKey: ["db-health"],
    queryFn: async () => {
      const { error } = await supabase.from("academic_sessions").select("id").limit(1);
      if (error) throw error;
      return true;
    },
    retry: false,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {dbError && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Database setup required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              {dbError instanceof Error ? dbError.message : "Database error"} — Lovable&apos;s hosted database
              cannot be fixed from code alone.
            </p>
            <p>
              Create your own project at supabase.com, run{" "}
              <code className="rounded bg-muted px-1">supabase/RUN-IN-YOUR-SUPABASE.sql</code>, then connect in
              Lovable (Integrations → Supabase) or update <code className="rounded bg-muted px-1">.env</code>.
            </p>
          </CardContent>
        </Card>
      )}
      <div>
        <h1 className="text-3xl font-bold">Academic setup</h1>
        <p className="text-muted-foreground">
          Overlapping cohort sessions (Intermediate 2 years, BS 4 years), programs, and Intermediate
          boys/girls sections
        </p>
      </div>
      <PromotionPanel />
      <Tabs defaultValue="sessions">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="programs">Programs</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions" className="mt-4">
          <SessionsTab />
        </TabsContent>
        <TabsContent value="programs" className="mt-4">
          <ProgramsTab />
        </TabsContent>
        <TabsContent value="sections" className="mt-4">
          <SectionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SessionsTab() {
  const qc = useQueryClient();
  const [programType, setProgramType] = useState<SessionProgramType>("intermediate");
  const [startYear, setStartYear] = useState(String(new Date().getFullYear()));
  const endYear = suggestSessionEndYear(parseInt(startYear, 10) || new Date().getFullYear(), programType);
  const label = formatSessionLabel(parseInt(startYear, 10) || new Date().getFullYear(), endYear);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editType, setEditType] = useState<SessionProgramType>("intermediate");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: listAcademicSessions,
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = parseInt(startYear, 10);
    if (!Number.isFinite(start)) return toast.error("Start year is required");
    const end = suggestSessionEndYear(start, programType);
    setSaving(true);
    try {
      const { error } = await supabase.from("academic_sessions").insert({
        label: formatSessionLabel(start, end),
        start_year: start,
        end_year: end,
        program_type: programType,
        is_active: true,
      });
      if (error) throw error;
      toast.success("Running cohort session created");
      qc.invalidateQueries({ queryKey: ["academic-sessions"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const setRunning = async (id: string, running: boolean) => {
    const { error } = await supabase
      .from("academic_sessions")
      .update({ is_active: running })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(running ? "Session marked running" : "Session marked completed");
    qc.invalidateQueries({ queryKey: ["academic-sessions"] });
  };

  const updateSession = async () => {
    if (!editId) return;
    const start = parseInt(editStart, 10);
    const end = parseInt(editEnd, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return toast.error("End year must be after start year");
    }
    const { error } = await supabase
      .from("academic_sessions")
      .update({
        label: editLabel.trim() || formatSessionLabel(start, end),
        start_year: start,
        end_year: end,
        program_type: editType,
      })
      .eq("id", editId);
    if (error) return toast.error(error.message);
    toast.success("Session updated");
    setEditId(null);
    qc.invalidateQueries({ queryKey: ["academic-sessions"] });
  };

  const deleteSession = async (id: string) => {
    const { error } = await supabase.from("academic_sessions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Session deleted");
    qc.invalidateQueries({ queryKey: ["academic-sessions"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cohort sessions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Multiple sessions can run at once (e.g. Intermediate 2026-2028 and 2027-2029, BS 2026-2030 and
          2027-2031). New intakes start every year while older cohorts keep running until they pass out.
        </p>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label>Track *</Label>
            <Select
              value={programType}
              onValueChange={(v) => setProgramType(v as SessionProgramType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="intermediate">Intermediate (2 years)</SelectItem>
                <SelectItem value="bs">BS (4 years)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Start year *</Label>
            <Input
              type="number"
              value={startYear}
              onChange={(e) => setStartYear(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>End year</Label>
            <Input type="number" value={String(endYear)} disabled />
          </div>
          <div className="space-y-2">
            <Label>Label</Label>
            <Input value={label} disabled />
          </div>
          <div className="sm:col-span-4">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Add running session"}
            </Button>
          </div>
        </form>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Track</TableHead>
                <TableHead>Years</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-48">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s: AcademicSessionRow) => (
                <TableRow key={s.id}>
                  {editId === s.id ? (
                    <>
                      <TableCell>
                        <Input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={editType}
                          onValueChange={(v) => {
                            const t = v as SessionProgramType;
                            setEditType(t);
                            const start = parseInt(editStart, 10);
                            if (Number.isFinite(start)) {
                              const end = suggestSessionEndYear(start, t);
                              setEditEnd(String(end));
                              setEditLabel(formatSessionLabel(start, end));
                            }
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="intermediate">Intermediate</SelectItem>
                            <SelectItem value="bs">BS</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="flex gap-1">
                        <Input
                          value={editStart}
                          onChange={(e) => {
                            setEditStart(e.target.value);
                            const start = parseInt(e.target.value, 10);
                            if (Number.isFinite(start)) {
                              const end = suggestSessionEndYear(start, editType);
                              setEditEnd(String(end));
                              setEditLabel(formatSessionLabel(start, end));
                            }
                          }}
                          className="h-8 w-20"
                        />
                        <Input
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                          className="h-8 w-20"
                        />
                      </TableCell>
                      <TableCell>{s.is_active ? "Running" : "Completed"}</TableCell>
                      <TableCell className="space-x-1">
                        <Button size="sm" onClick={updateSession}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                          Cancel
                        </Button>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell>{programTypeLabel(s.program_type)}</TableCell>
                      <TableCell>
                        {s.start_year} – {s.end_year}
                      </TableCell>
                      <TableCell>{s.is_active ? "Running" : "Completed"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {s.is_active ? (
                            <Button size="sm" variant="outline" onClick={() => setRunning(s.id, false)}>
                              Complete
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setRunning(s.id, true)}>
                              Mark running
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditId(s.id);
                              setEditLabel(s.label);
                              setEditStart(String(s.start_year));
                              setEditEnd(String(s.end_year));
                              setEditType(s.program_type);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost">
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete session?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Linked sections, policies, and enrollments must be removed first.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteSession(s.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PromotionPanel() {
  const [running, setRunning] = useState(false);

  const runNow = async () => {
    setRunning(true);
    try {
      const result = await runAcademicPromotionsIfDue();
      if (result.closeResult?.closedYears > 0) {
        toast.success(
          `Year-end ledger closed for ${result.closeResult.closedYears} academic year(s). ${result.closeResult.studentsSnapshotted} snapshot(s) saved.`,
        );
      }
      if (result.promoted > 0) {
        toast.success(
          `Promoted ${result.promoted} student(s). Mirrored ${result.inchargeSectionsMirrored} campus incharge assignment(s).`,
        );
      } else if (result.errors.length) {
        toast.error(`${result.errors.length} student(s) failed promotion. See console for details.`);
        console.warn("Promotion errors", result.errors);
      } else {
        toast.info("No students due for promotion right now (runs automatically from 1 July each year).");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Promotion failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Intermediate annual promotion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          From <strong>1 July</strong> each academic year, active <strong>Intermediate</strong> students move
          to the next class/section. BS students are promoted semester-by-semester in LMS (Close &amp; promote),
          not by this annual tool.
        </p>
        <p>
          Create matching 2nd-year boys/girls sections (same names as 1st year) before Intermediate promotion
          runs. Promotion also runs automatically once per day when staff log in.
        </p>
        <Button type="button" variant="outline" onClick={runNow} disabled={running}>
          {running ? "Running…" : "Run promotion now"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ProgramsTab() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<ProgramType>("bs");
  const [duration, setDuration] = useState("4");
  const [saving, setSaving] = useState(false);

  const { data: programs, isLoading } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await supabase.from("programs").select("*").order("type").order("name")).data ?? [],
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Program name is required");
    setSaving(true);
    try {
      await createProgramWithClasses(name.trim(), type, parseInt(duration, 10) || (type === "intermediate" ? 2 : 4));
      toast.success(
        type === "bs"
          ? "BS program created (LMS department synced automatically)"
          : "Intermediate program created with 1st & 2nd year classes",
      );
      setName("");
      qc.invalidateQueries({ queryKey: ["programs"] });
      qc.invalidateQueries({ queryKey: ["classes"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteProgram = async (id: string) => {
    const { error } = await supabase.from("programs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Program deleted");
    qc.invalidateQueries({ queryKey: ["programs"] });
    qc.invalidateQueries({ queryKey: ["classes"] });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Programs</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label>Program name *</Label>
            <Input placeholder="e.g. BS Computer Science" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                const t = v as ProgramType;
                setType(t);
                if (t === "intermediate") setDuration("2");
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="bs">BS (Bachelor)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Duration (years)</Label>
            <Input
              type="number"
              min={1}
              max={6}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              disabled={type === "intermediate"}
            />
          </div>
          <div className="sm:col-span-4">
            <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create program"}</Button>
          </div>
        </form>
        <p className="text-sm text-muted-foreground">
          Intermediate is fixed at 2 years (1st &amp; 2nd) with boys/girls sections. BS programs are 4-year
          semester degrees — creating a BS program also creates its LMS department (same thing for this
          campus). BS has no Intermediate-style sections.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Years</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {programs?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="capitalize">{p.type}</TableCell>
                  <TableCell>{p.duration_years}</TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete program?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Deletes all classes and sections under this program.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteProgram(p.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SectionsTab() {
  const qc = useQueryClient();
  const [programId, setProgramId] = useState("");
  const [classId, setClassId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [gender, setGender] = useState<SectionGender>("boys");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("50");
  const [meritMinPercentage, setMeritMinPercentage] = useState("");
  const [meritMaxPercentage, setMeritMaxPercentage] = useState("");
  const [saving, setSaving] = useState(false);
  const [editRow, setEditRow] = useState<{
    id: string;
    name: string;
    capacity: string;
    gender: SectionGender;
    merit_min_percentage: string;
    merit_max_percentage: string;
  } | null>(null);

  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () =>
      (
        await supabase
          .from("programs")
          .select("*")
          .eq("type", "intermediate")
          .order("name")
      ).data ?? [],
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: listAcademicSessions,
  });
  const intermediateSessions = sessionsForProgramType(sessions, "intermediate");

  const { data: classes } = useQuery({
    queryKey: ["classes", programId],
    enabled: !!programId,
    queryFn: async () =>
      (await supabase.from("classes").select("*").eq("program_id", programId).order("year_level")).data ?? [],
  });

  const { data: sections, isLoading } = useQuery({
    queryKey: ["sections-crud", programId, sessionId],
    enabled: !!programId,
    queryFn: async () => {
      const classIds = classes?.map((c) => c.id) ?? [];
      if (!classIds.length) return [];
      let q = supabase
        .from("sections")
        .select("*, classes(name, year_level), academic_sessions(label)")
        .in("class_id", classIds)
        .order("name");
      if (sessionId) q = q.eq("session_id", sessionId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !sessionId || !name.trim()) {
      return toast.error("Year, session, and section name are required");
    }
    const meritMin = meritMinPercentage ? Number(meritMinPercentage) : null;
    const meritMax = meritMaxPercentage ? Number(meritMaxPercentage) : null;
    if ((meritMin != null && (meritMin < 0 || meritMin > 100)) || (meritMax != null && (meritMax < 0 || meritMax > 100))) {
      return toast.error("Merit percentage must be between 0 and 100");
    }
    if (meritMin != null && meritMax != null && meritMin > meritMax) {
      return toast.error("Merit from percentage cannot be greater than merit to percentage");
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("sections").insert({
        class_id: classId,
        session_id: sessionId,
        gender,
        name: name.trim(),
        capacity: parseInt(capacity, 10) || 50,
        merit_min_percentage: meritMin,
        merit_max_percentage: meritMax,
      });
      if (error) throw error;
      toast.success("Section created");
      setName("");
      setMeritMinPercentage("");
      setMeritMaxPercentage("");
      qc.invalidateQueries({ queryKey: ["sections-crud"] });
      qc.invalidateQueries({ queryKey: ["sections"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editRow) return;
    const meritMin = editRow.merit_min_percentage ? Number(editRow.merit_min_percentage) : null;
    const meritMax = editRow.merit_max_percentage ? Number(editRow.merit_max_percentage) : null;
    if ((meritMin != null && (meritMin < 0 || meritMin > 100)) || (meritMax != null && (meritMax < 0 || meritMax > 100))) {
      return toast.error("Merit percentage must be between 0 and 100");
    }
    if (meritMin != null && meritMax != null && meritMin > meritMax) {
      return toast.error("Merit from percentage cannot be greater than merit to percentage");
    }
    const { error } = await supabase
      .from("sections")
      .update({
        name: editRow.name.trim(),
        capacity: parseInt(editRow.capacity, 10) || 50,
        gender: editRow.gender,
        merit_min_percentage: meritMin,
        merit_max_percentage: meritMax,
      })
      .eq("id", editRow.id);
    if (error) return toast.error(error.message);
    toast.success("Section updated");
    setEditRow(null);
    qc.invalidateQueries({ queryKey: ["sections-crud"] });
    qc.invalidateQueries({ queryKey: ["sections"] });
  };

  const deleteSection = async (id: string) => {
    const { error } = await supabase.from("sections").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Section deleted");
    qc.invalidateQueries({ queryKey: ["sections-crud"] });
    qc.invalidateQueries({ queryKey: ["sections"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Intermediate sections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Boys and girls sections only apply to Intermediate programs (FSc, ICom, FA-IT, etc.). BS uses
          coeducational LMS class groups instead.
        </p>
        <form onSubmit={add} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Program *</Label>
            <Select value={programId} onValueChange={(v) => { setProgramId(v); setClassId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select Intermediate program" /></SelectTrigger>
              <SelectContent>
                {programs?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Year / class *</Label>
            <Select value={classId} onValueChange={setClassId} disabled={!programId}>
              <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
              <SelectContent>
                {classes?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Session *</Label>
            <Select
              value={sessionId}
              onValueChange={setSessionId}
            >
              <SelectTrigger><SelectValue placeholder="Select Intermediate session" /></SelectTrigger>
              <SelectContent>
                {intermediateSessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}{s.is_active ? " (running)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Gender group *</Label>
            <Select value={gender} onValueChange={(v) => setGender(v as SectionGender)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="boys">Boys</SelectItem>
                <SelectItem value="girls">Girls</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Section name *</Label>
            <Input placeholder="e.g. ICS Green" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Capacity</Label>
            <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Merit from %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              placeholder="e.g. 50"
              value={meritMinPercentage}
              onChange={(e) => setMeritMinPercentage(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Merit to %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              placeholder="e.g. 60"
              value={meritMaxPercentage}
              onChange={(e) => setMeritMaxPercentage(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="mb-3 text-xs text-muted-foreground">
              These percentage ranges are used to auto-select the section during admission from inquiry marks.
            </p>
            <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create section"}</Button>
          </div>
        </form>

        <div className="max-w-xs space-y-2">
          <Label>Filter list by session</Label>
          <Select value={sessionId || "all"} onValueChange={(v) => setSessionId(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All sessions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sessions</SelectItem>
              {sessions?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !programId ? (
          <p className="text-sm text-muted-foreground">Select a program to view sections.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Merit range</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">No sections yet.</TableCell>
                </TableRow>
              ) : (
                sections?.map((sec) => {
                  const cls = sec.classes as { name?: string } | null;
                  const sess = sec.academic_sessions as { label?: string } | null;
                  if (editRow?.id === sec.id) {
                    return (
                      <TableRow key={sec.id}>
                        <TableCell>{cls?.name}</TableCell>
                        <TableCell>{sess?.label}</TableCell>
                        <TableCell>
                          <Select
                            value={editRow.gender}
                            onValueChange={(v) => setEditRow({ ...editRow, gender: v as SectionGender })}
                          >
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="boys">Boys</SelectItem>
                              <SelectItem value="girls">Girls</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            value={editRow.name}
                            onChange={(e) => setEditRow({ ...editRow, name: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              className="h-8 w-20"
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              placeholder="From"
                              value={editRow.merit_min_percentage}
                              onChange={(e) => setEditRow({ ...editRow, merit_min_percentage: e.target.value })}
                            />
                            <span className="text-muted-foreground">to</span>
                            <Input
                              className="h-8 w-20"
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              placeholder="To"
                              value={editRow.merit_max_percentage}
                              onChange={(e) => setEditRow({ ...editRow, merit_max_percentage: e.target.value })}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8 w-20"
                            value={editRow.capacity}
                            onChange={(e) => setEditRow({ ...editRow, capacity: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="space-x-1">
                          <Button size="sm" onClick={saveEdit}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditRow(null)}>Cancel</Button>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return (
                    <TableRow key={sec.id}>
                      <TableCell>{cls?.name ?? "—"}</TableCell>
                      <TableCell>{sess?.label ?? "—"}</TableCell>
                      <TableCell>{sectionGenderLabel(sec.gender)}</TableCell>
                      <TableCell className="font-medium">{sec.name}</TableCell>
                      <TableCell>
                        {sec.merit_min_percentage != null || sec.merit_max_percentage != null
                          ? `${sec.merit_min_percentage ?? 0}% - ${sec.merit_max_percentage ?? 100}%`
                          : "—"}
                      </TableCell>
                      <TableCell>{sec.capacity ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setEditRow({
                                id: sec.id,
                                name: sec.name,
                                capacity: String(sec.capacity ?? 50),
                                gender: sec.gender,
                                merit_min_percentage:
                                  sec.merit_min_percentage != null ? String(sec.merit_min_percentage) : "",
                                merit_max_percentage:
                                  sec.merit_max_percentage != null ? String(sec.merit_max_percentage) : "",
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete section?</AlertDialogTitle>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteSection(sec.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
