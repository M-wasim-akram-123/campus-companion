import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createProgramWithClasses, sectionGenderLabel, type SectionGender } from "@/lib/academic";
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
          Sessions, programs (including BS), and sections by year with separate boys and girls groups
        </p>
      </div>
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
  const [label, setLabel] = useState("");
  const [startYear, setStartYear] = useState(String(new Date().getFullYear()));
  const [endYear, setEndYear] = useState(String(new Date().getFullYear() + 1));
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () =>
      (await supabase.from("academic_sessions").select("*").order("start_year", { ascending: false })).data ?? [],
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return toast.error("Session label is required");
    setSaving(true);
    try {
      const { error } = await supabase.from("academic_sessions").insert({
        label: label.trim(),
        start_year: parseInt(startYear, 10),
        end_year: parseInt(endYear, 10),
        is_active: false,
      });
      if (error) throw error;
      toast.success("Session created");
      setLabel("");
      qc.invalidateQueries({ queryKey: ["academic-sessions"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (id: string) => {
    await supabase.from("academic_sessions").update({ is_active: false }).neq("id", id);
    const { error } = await supabase.from("academic_sessions").update({ is_active: true }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Active session updated");
    qc.invalidateQueries({ queryKey: ["academic-sessions"] });
  };

  const updateSession = async () => {
    if (!editId) return;
    const { error } = await supabase
      .from("academic_sessions")
      .update({
        label: editLabel.trim(),
        start_year: parseInt(editStart, 10),
        end_year: parseInt(editEnd, 10),
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
      <CardHeader><CardTitle>Academic sessions</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label>Label *</Label>
            <Input placeholder="2025-2026" value={label} onChange={(e) => setLabel(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Start year</Label>
            <Input type="number" value={startYear} onChange={(e) => setStartYear(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>End year</Label>
            <Input type="number" value={endYear} onChange={(e) => setEndYear(e.target.value)} />
          </div>
          <div className="sm:col-span-4">
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Add session"}</Button>
          </div>
        </form>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Years</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions?.map((s) => (
                <TableRow key={s.id}>
                  {editId === s.id ? (
                    <>
                      <TableCell>
                        <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-8" />
                      </TableCell>
                      <TableCell className="flex gap-1">
                        <Input value={editStart} onChange={(e) => setEditStart(e.target.value)} className="h-8 w-20" />
                        <Input value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="h-8 w-20" />
                      </TableCell>
                      <TableCell>{s.is_active ? "Yes" : "No"}</TableCell>
                      <TableCell className="space-x-1">
                        <Button size="sm" onClick={updateSession}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell>{s.start_year} – {s.end_year}</TableCell>
                      <TableCell>{s.is_active ? "Active" : "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!s.is_active && (
                            <Button size="sm" variant="outline" onClick={() => setActive(s.id)}>Set active</Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditId(s.id);
                              setEditLabel(s.label);
                              setEditStart(String(s.start_year));
                              setEditEnd(String(s.end_year));
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete session?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Sections linked to this session must be removed first.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteSession(s.id)}>Delete</AlertDialogAction>
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
      toast.success("Program created with year classes");
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
          Intermediate is fixed at 2 years (1st & 2nd). BS programs auto-create BS Year 1–N classes.
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
  const [saving, setSaving] = useState(false);
  const [editRow, setEditRow] = useState<{
    id: string;
    name: string;
    capacity: string;
    gender: SectionGender;
  } | null>(null);

  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await supabase.from("programs").select("*").order("name")).data ?? [],
  });

  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () =>
      (await supabase.from("academic_sessions").select("*").order("start_year", { ascending: false })).data ?? [],
  });

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
    setSaving(true);
    try {
      const { error } = await supabase.from("sections").insert({
        class_id: classId,
        session_id: sessionId,
        gender,
        name: name.trim(),
        capacity: parseInt(capacity, 10) || 50,
      });
      if (error) throw error;
      toast.success("Section created");
      setName("");
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
    const { error } = await supabase
      .from("sections")
      .update({
        name: editRow.name.trim(),
        capacity: parseInt(editRow.capacity, 10) || 50,
        gender: editRow.gender,
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
      <CardHeader><CardTitle>Sections</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={add} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Program *</Label>
            <Select value={programId} onValueChange={(v) => { setProgramId(v); setClassId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
              <SelectContent>
                {programs?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>
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
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>
                {sessions?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}{s.is_active ? " (active)" : ""}
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
          <div className="sm:col-span-2 lg:col-span-3">
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
                <TableHead>Capacity</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">No sections yet.</TableCell>
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
