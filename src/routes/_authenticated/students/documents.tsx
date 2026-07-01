import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileArchive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  REQUIRED_STUDENT_DOCUMENTS,
  studentDocumentStatusLabel,
  type StudentDocumentStatus,
} from "@/lib/student-documents";

export const Route = createFileRoute("/_authenticated/students/documents")({
  component: StudentDocumentsReport,
});

function StudentDocumentsReport() {
  const [sessionId, setSessionId] = useState("__all__");
  const [classId, setClassId] = useState("__all__");
  const [sectionId, setSectionId] = useState("__all__");
  const [gender, setGender] = useState("__all__");
  const [status, setStatus] = useState<"__all__" | StudentDocumentStatus | "missing">("__all__");
  const [downloading, setDownloading] = useState(false);

  const { data: students = [] } = useQuery({
    queryKey: ["students-document-report-base"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, roll_number, gender, class_id, section_id, academic_session_id, classes(name), sections(name, gender), academic_sessions(label)")
        .order("roll_number");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["student-documents-report"],
    queryFn: async () => {
      const { data, error } = await supabase.from("student_documents").select("*");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const options = useMemo(() => {
    const sessions = new Map<string, string>();
    const classes = new Map<string, string>();
    const sections = new Map<string, string>();
    for (const student of students) {
      if (student.academic_session_id) {
        sessions.set(student.academic_session_id, (student.academic_sessions as { label?: string } | null)?.label || "Unnamed session");
      }
      if (student.class_id) {
        classes.set(student.class_id, (student.classes as { name?: string } | null)?.name || "Unnamed class");
      }
      if (student.section_id) {
        const section = student.sections as { name?: string; gender?: string } | null;
        sections.set(student.section_id, section ? `${section.gender === "girls" ? "Girls" : "Boys"} - ${section.name}` : "Unnamed section");
      }
    }
    return {
      sessions: [...sessions.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      classes: [...classes.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      sections: [...sections.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [students]);

  const reportRows = useMemo(() => {
    const docsByStudent = new Map<string, typeof documents>();
    for (const doc of documents) {
      const list = docsByStudent.get(doc.student_id) ?? [];
      list.push(doc);
      docsByStudent.set(doc.student_id, list);
    }

    return students
      .filter((student) => {
        if (sessionId !== "__all__" && student.academic_session_id !== sessionId) return false;
        if (classId !== "__all__" && student.class_id !== classId) return false;
        if (sectionId !== "__all__" && student.section_id !== sectionId) return false;
        if (gender !== "__all__" && student.gender !== gender) return false;
        return true;
      })
      .map((student) => {
        const docs = docsByStudent.get(student.id) ?? [];
        const approved = REQUIRED_STUDENT_DOCUMENTS.filter((item) =>
          docs.some((doc) => doc.document_type === item.type && doc.status === "approved"),
        ).length;
        const pending = docs.filter((doc) => doc.status === "pending_review").length;
        const rejected = docs.filter((doc) => doc.status === "rejected").length;
        const missing = REQUIRED_STUDENT_DOCUMENTS.length - new Set(docs.map((doc) => doc.document_type)).size;
        return { student, approved, pending, rejected, missing, docs };
      })
      .filter((row) => {
        if (status === "__all__") return true;
        if (status === "missing") return row.missing > 0;
        return row.docs.some((doc) => doc.status === status);
      });
  }, [classId, documents, gender, sectionId, sessionId, status, students]);

  const downloadZip = async () => {
    setDownloading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("You must be logged in.");
      const params = new URLSearchParams();
      if (sessionId !== "__all__") params.set("sessionId", sessionId);
      if (classId !== "__all__") params.set("classId", classId);
      if (sectionId !== "__all__") params.set("sectionId", sectionId);
      if (gender !== "__all__") params.set("gender", gender);
      if (status !== "__all__" && status !== "missing") params.set("status", status);

      const res = await fetch(`/api/student-documents/zip?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "ZIP download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "student-documents.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "ZIP download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <FileArchive className="h-7 w-7" />
            Student Documents
          </h1>
          <p className="text-muted-foreground">Track completeness and download filtered student document ZIPs.</p>
        </div>
        <Button disabled={downloading || status === "missing"} onClick={downloadZip}>
          <Download className="mr-2 h-4 w-4" />
          {downloading ? "Preparing..." : "Download filtered ZIP"}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger><SelectValue placeholder="Session" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All sessions</SelectItem>
              {options.sessions.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All classes</SelectItem>
              {options.classes.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All sections</SelectItem>
              {options.sections.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger><SelectValue placeholder="Gender" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All genders</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
            <SelectTrigger><SelectValue placeholder="Document status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All document status</SelectItem>
              <SelectItem value="missing">Missing</SelectItem>
              <SelectItem value="pending_review">{studentDocumentStatusLabel("pending_review")}</SelectItem>
              <SelectItem value="approved">{studentDocumentStatusLabel("approved")}</SelectItem>
              <SelectItem value="rejected">{studentDocumentStatusLabel("rejected")}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class / Section</TableHead>
                <TableHead className="text-right">Approved</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead className="text-right">Missing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportRows.map((row) => {
                const section = row.student.sections as { name?: string; gender?: string } | null;
                return (
                  <TableRow key={row.student.id}>
                    <TableCell>
                      <p className="font-semibold">{row.student.full_name}</p>
                      <p className="text-xs text-muted-foreground">{row.student.roll_number}</p>
                    </TableCell>
                    <TableCell>
                      {(row.student.classes as { name?: string } | null)?.name || "-"}
                      {section && <span className="text-muted-foreground"> · {section.name}</span>}
                    </TableCell>
                    <TableCell className="text-right"><Badge>{row.approved}</Badge></TableCell>
                    <TableCell className="text-right"><Badge variant="secondary">{row.pending}</Badge></TableCell>
                    <TableCell className="text-right"><Badge variant="destructive">{row.rejected}</Badge></TableCell>
                    <TableCell className="text-right"><Badge variant="outline">{row.missing}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
