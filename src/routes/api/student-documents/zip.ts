import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import WebSocket from "ws";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { studentDocumentLabel, STUDENT_DOCUMENT_BUCKET } from "@/lib/student-documents";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireDocumentStaff(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.");
  }

  const userClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    realtime: { transport: WebSocket },
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userRes.user) throw new Response("Unauthorized", { status: 401 });

  const { data: roles, error: roleErr } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id);
  const allowed = ["super_admin", "admission_officer", "hr", "finance_admin", "finance_officer"];
  if (roleErr || !roles?.some((row) => allowed.includes(String(row.role)))) {
    throw new Response("Forbidden", { status: 403 });
  }

  return userRes.user;
}

function safeName(value: string | null | undefined) {
  return (value || "unknown").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

export const Route = createFileRoute("/api/student-documents/zip")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireDocumentStaff(request);
          const url = new URL(request.url);
          const studentId = url.searchParams.get("studentId");
          const classId = url.searchParams.get("classId");
          const sectionId = url.searchParams.get("sectionId");
          const sessionId = url.searchParams.get("sessionId");
          const gender = url.searchParams.get("gender");
          const status = url.searchParams.get("status");

          let studentQuery = supabaseAdmin
            .from("students")
            .select("id, full_name, roll_number, class_id, section_id, academic_session_id, gender");
          if (studentId) studentQuery = studentQuery.eq("id", studentId);
          if (classId) studentQuery = studentQuery.eq("class_id", classId);
          if (sectionId) studentQuery = studentQuery.eq("section_id", sectionId);
          if (sessionId) studentQuery = studentQuery.eq("academic_session_id", sessionId);
          if (gender) studentQuery = studentQuery.eq("gender", gender);

          const { data: students, error: studentsErr } = await studentQuery;
          if (studentsErr) return json({ error: studentsErr.message }, 500);
          const studentIds = (students ?? []).map((student) => student.id);
          if (!studentIds.length) return json({ error: "No students found for this filter." }, 404);

          let docQuery = supabaseAdmin
            .from("student_documents")
            .select("*")
            .in("student_id", studentIds)
            .order("student_id")
            .order("document_type")
            .order("uploaded_at", { ascending: false });
          if (status) docQuery = docQuery.eq("status", status);

          const { data: documents, error: docsErr } = await docQuery;
          if (docsErr) return json({ error: docsErr.message }, 500);
          if (!documents?.length) return json({ error: "No documents found for this filter." }, 404);

          const studentMap = new Map((students ?? []).map((student) => [student.id, student]));
          const zip = new JSZip();
          for (const doc of documents) {
            const { data: file, error: fileErr } = await supabaseAdmin.storage
              .from(STUDENT_DOCUMENT_BUCKET)
              .download(doc.file_path);
            if (fileErr || !file) continue;

            const student = studentMap.get(doc.student_id);
            const folder = `${safeName(student?.roll_number)}_${safeName(student?.full_name)}`;
            const original = doc.original_file_name || doc.file_path.split("/").pop() || "document";
            const ext = original.includes(".") ? original.split(".").pop() : "bin";
            const fileName = `${studentDocumentLabel(doc.document_type)}_v${doc.version}_${doc.status}.${ext}`;
            zip.file(`${folder}/${safeName(fileName)}`, await file.arrayBuffer());
          }

          const zipBuffer = await zip.generateAsync({ type: "uint8array" });
          await supabaseAdmin.from("student_document_audit_log").insert({
            student_id: studentId || null,
            actor_id: actor.id,
            action: "zip_downloaded",
            after_data: {
              studentId,
              classId,
              sectionId,
              sessionId,
              gender,
              status,
              documentCount: documents.length,
            },
          });

          const fileName = studentId ? `student-documents-${studentId}.zip` : "student-documents.zip";
          return new Response(zipBuffer, {
            headers: {
              "Content-Type": "application/zip",
              "Content-Disposition": `attachment; filename="${fileName}"`,
            },
          });
        } catch (error) {
          if (error instanceof Response) return json({ error: await error.text() }, error.status);
          return json({ error: error instanceof Error ? error.message : "ZIP download failed." }, 500);
        }
      },
    },
  },
});
