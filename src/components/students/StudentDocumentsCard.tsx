import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DetailSection } from "@/components/detail/detail-layout";
import {
  activeDocumentByType,
  fetchStudentDocuments,
  getStudentDocumentSignedUrl,
  REQUIRED_STUDENT_DOCUMENTS,
  reviewStudentDocument,
  studentDocumentStatusLabel,
  type StudentDocument,
} from "@/lib/student-documents";
import { Download, Eye, FileArchive, Lock, RefreshCw, XCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  studentId: string;
};

function statusVariant(status: StudentDocument["status"] | "missing") {
  if (status === "approved") return "default";
  if (status === "pending_review") return "secondary";
  if (status === "rejected") return "destructive";
  return "outline";
}

export function StudentDocumentsCard({ studentId }: Props) {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<{ doc: StudentDocument; url: string } | null>(null);
  const [rejecting, setRejecting] = useState<StudentDocument | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["student-documents", studentId],
    queryFn: () => fetchStudentDocuments(studentId),
  });

  const { data: studentAccount } = useQuery({
    queryKey: ["student-document-account", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, user_id, email, phone")
        .eq("id", studentId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const { data: auditRows = [] } = useQuery({
    queryKey: ["student-document-audit", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_document_audit_log")
        .select("id, action, actor_id, notes, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const byType = useMemo(() => activeDocumentByType(documents), [documents]);
  const approvedCount = REQUIRED_STUDENT_DOCUMENTS.filter((item) => byType.get(item.type)?.status === "approved").length;

  const loadPreview = async (doc: StudentDocument) => {
    try {
      setBusyId(doc.id);
      const url = await getStudentDocumentSignedUrl(doc.file_path);
      setPreview({ doc, url });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not open document preview");
    } finally {
      setBusyId(null);
    }
  };

  const downloadDocument = async (doc: StudentDocument) => {
    try {
      setBusyId(doc.id);
      const url = await getStudentDocumentSignedUrl(doc.file_path, 300);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.original_file_name || doc.file_path.split("/").pop() || "student-document";
      a.target = "_blank";
      a.click();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not download document");
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (doc: StudentDocument) => {
    try {
      setBusyId(doc.id);
      await reviewStudentDocument({ documentId: doc.id, status: "approved" });
      toast.success("Document approved");
      qc.invalidateQueries({ queryKey: ["student-documents", studentId] });
      qc.invalidateQueries({ queryKey: ["student-document-audit", studentId] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not approve document");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    if (!rejectionReason.trim()) return toast.error("Rejection reason is required");
    try {
      setBusyId(rejecting.id);
      await reviewStudentDocument({
        documentId: rejecting.id,
        status: "rejected",
        rejectionReason: rejectionReason.trim(),
      });
      toast.success("Document rejected");
      setRejecting(null);
      setRejectionReason("");
      qc.invalidateQueries({ queryKey: ["student-documents", studentId] });
      qc.invalidateQueries({ queryKey: ["student-document-audit", studentId] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not reject document");
    } finally {
      setBusyId(null);
    }
  };

  const downloadZip = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("You must be logged in.");
      const res = await fetch(`/api/student-documents/zip?studentId=${encodeURIComponent(studentId)}`, {
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
      a.download = `student-documents-${studentId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      qc.invalidateQueries({ queryKey: ["student-document-audit", studentId] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "ZIP download failed");
    }
  };

  const provisionAccount = async (reset = false) => {
    setAccountBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("You must be logged in.");
      const res = await fetch("/api/student-documents/account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ studentId, reset }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; temporary_password?: string };
      if (!res.ok) throw new Error(json.error || "Could not create student account");
      setTemporaryPassword(json.temporary_password ?? "");
      toast.success(reset ? "Student password reset" : "Student login created");
      qc.invalidateQueries({ queryKey: ["student-document-account", studentId] });
      qc.invalidateQueries({ queryKey: ["student", studentId] });
      qc.invalidateQueries({ queryKey: ["student-document-audit", studentId] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create student login");
    } finally {
      setAccountBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <DetailSection
        title="Student portal"
        description="Mobile app login for document uploads. Share temporary passwords securely."
        actions={
          <>
            {studentAccount?.user_id ? (
              <Button variant="outline" size="sm" disabled={accountBusy} onClick={() => provisionAccount(true)}>
                Reset student password
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={accountBusy} onClick={() => provisionAccount(false)}>
                Create student login
              </Button>
            )}
          </>
        }
      >
        {temporaryPassword && (
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3 text-sm">
            <p className="font-semibold">Temporary password</p>
            <p className="mt-1 font-mono text-base">{temporaryPassword}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Share this once with the student. It is not stored in a readable form.
            </p>
          </div>
        )}
        {!temporaryPassword && (
          <p className="text-sm text-muted-foreground">
            {studentAccount?.user_id
              ? "Student login is active. Use reset password if they need a new temporary password."
              : "Create a login so the student can upload documents from the mobile app."}
          </p>
        )}
      </DetailSection>

      <DetailSection
        title={`Documents (${approvedCount}/${REQUIRED_STUDENT_DOCUMENTS.length} approved)`}
        description="Approved documents are locked for students. Rejected documents can be re-uploaded from the mobile app."
        actions={
          <Button variant="outline" size="sm" onClick={downloadZip}>
            <FileArchive className="mr-2 h-4 w-4" />
            Download ZIP
          </Button>
        }
      >

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading documents...</p>
      ) : (
        <div className="grid gap-3">
          {REQUIRED_STUDENT_DOCUMENTS.map((item) => {
            const doc = byType.get(item.type);
            const status = doc?.status ?? "missing";
            const locked = status === "approved";
            return (
              <div key={item.type} className="rounded-2xl border bg-white/60 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.label}</p>
                      <Badge variant={statusVariant(status)}>{studentDocumentStatusLabel(status)}</Badge>
                      {locked && (
                        <Badge variant="outline">
                          <Lock className="mr-1 h-3 w-3" />
                          Locked
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    {doc && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Uploaded {new Date(doc.uploaded_at).toLocaleString()}
                        {doc.original_file_name ? ` · ${doc.original_file_name}` : ""}
                      </p>
                    )}
                    {doc?.rejection_reason && (
                      <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        Rejected: {doc.rejection_reason}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {doc ? (
                      <>
                        <Button variant="outline" size="sm" disabled={busyId === doc.id} onClick={() => loadPreview(doc)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Preview
                        </Button>
                        <Button variant="outline" size="sm" disabled={busyId === doc.id} onClick={() => downloadDocument(doc)}>
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                        {doc.status === "pending_review" && (
                          <>
                            <Button size="sm" disabled={busyId === doc.id} onClick={() => approve(doc)}>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Approve
                            </Button>
                            <Button variant="destructive" size="sm" disabled={busyId === doc.id} onClick={() => setRejecting(doc)}>
                              <XCircle className="mr-2 h-4 w-4" />
                              Reject
                            </Button>
                          </>
                        )}
                        {doc.status === "rejected" && (
                          <Button variant="outline" size="sm" disabled>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Awaiting re-upload
                          </Button>
                        )}
                      </>
                    ) : (
                      <Badge variant="outline">Not uploaded</Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      </DetailSection>

      <DetailSection title="Document audit" description="Recent upload, review, and download activity.">
        {auditRows.length ? (
          <div className="space-y-2">
            {auditRows.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-1 rounded-lg border bg-white/60 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium capitalize">{row.action.replaceAll("_", " ")}</span>
                <span className="text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span>
                {row.notes && <span className="text-muted-foreground">{row.notes}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No document activity yet.</p>
        )}
      </DetailSection>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{preview ? preview.doc.original_file_name || preview.doc.file_path : "Document preview"}</DialogTitle>
          </DialogHeader>
          {preview && (
            preview.doc.mime_type?.startsWith("image/") ? (
              <img src={preview.url} alt="" className="max-h-[70vh] w-full rounded-lg object-contain" />
            ) : (
              <iframe src={preview.url} className="h-[70vh] w-full rounded-lg border" title="Document preview" />
            )
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject document</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason shown to student</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Example: CNIC image is blurry. Please upload a clearer scan."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectionReason.trim()} onClick={reject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
