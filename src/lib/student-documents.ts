import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type StudentDocumentType = Database["public"]["Enums"]["student_document_type"];
export type StudentDocumentStatus = Database["public"]["Enums"]["student_document_status"];
export type StudentDocument = Database["public"]["Tables"]["student_documents"]["Row"];

export const STUDENT_DOCUMENT_BUCKET = "student-documents";

export const REQUIRED_STUDENT_DOCUMENTS: {
  type: StudentDocumentType;
  label: string;
  description: string;
}[] = [
  {
    type: "cnic_b_form",
    label: "CNIC / B-Form",
    description: "Student CNIC or B-Form scan.",
  },
  {
    type: "guardian_cnic",
    label: "Parent / Guardian CNIC",
    description: "Front/back scan or a combined PDF.",
  },
  {
    type: "domicile",
    label: "Domicile",
    description: "Student domicile document.",
  },
  {
    type: "matric_result_card",
    label: "Matric result card",
    description: "Matric marks/result card scan.",
  },
  {
    type: "other_supporting",
    label: "Other supporting document",
    description: "Any other required support document.",
  },
];

export function studentDocumentLabel(type: StudentDocumentType) {
  return REQUIRED_STUDENT_DOCUMENTS.find((doc) => doc.type === type)?.label ?? type;
}

export function studentDocumentStatusLabel(status: StudentDocumentStatus | "missing") {
  if (status === "pending_review") return "Pending review";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Missing";
}

export function activeDocumentByType(documents: StudentDocument[]) {
  const map = new Map<StudentDocumentType, StudentDocument>();
  for (const doc of documents) {
    const existing = map.get(doc.document_type);
    if (!existing || new Date(doc.uploaded_at).getTime() > new Date(existing.uploaded_at).getTime()) {
      map.set(doc.document_type, doc);
    }
  }
  return map;
}

export async function fetchStudentDocuments(studentId: string): Promise<StudentDocument[]> {
  const { data, error } = await supabase
    .from("student_documents")
    .select("*")
    .eq("student_id", studentId)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchMyStudentProfile() {
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;
  if (!userId) throw new Error("You must be logged in.");
  const { data, error } = await supabase
    .from("students")
    .select("id, full_name, roll_number, user_id, programs(name), classes(name), sections(name, gender), academic_sessions(label)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No student profile is linked with this login.");
  return data;
}

export async function fetchMyStudentDocuments() {
  const student = await fetchMyStudentProfile();
  const documents = await fetchStudentDocuments(student.id);
  return { student, documents };
}

export async function getStudentDocumentSignedUrl(filePath: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(STUDENT_DOCUMENT_BUCKET)
    .createSignedUrl(filePath, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function reviewStudentDocument(params: {
  documentId: string;
  status: Extract<StudentDocumentStatus, "approved" | "rejected">;
  rejectionReason?: string;
}) {
  const { data, error } = await supabase.rpc("review_student_document", {
    p_document_id: params.documentId,
    p_status: params.status,
    p_rejection_reason: params.rejectionReason ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function uploadMyStudentDocument(params: {
  file: File;
  documentType: StudentDocumentType;
}) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user?.id) throw new Error("You must be logged in.");
  const student = await fetchMyStudentProfile();
  const ext = params.file.name.split(".").pop()?.toLowerCase() || "jpg";
  const filePath = `students/${student.id}/${params.documentType}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(STUDENT_DOCUMENT_BUCKET)
    .upload(filePath, params.file, {
      contentType: params.file.type || undefined,
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await supabase.rpc("submit_student_document", {
    p_document_type: params.documentType,
    p_file_path: filePath,
    p_original_file_name: params.file.name,
    p_mime_type: params.file.type || null,
    p_file_size: params.file.size,
  });
  if (error) throw new Error(error.message);
  return data;
}
