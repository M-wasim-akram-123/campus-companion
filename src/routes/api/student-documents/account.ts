import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

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
  if (roleErr || !roles?.some((row) => ["super_admin", "admission_officer"].includes(String(row.role)))) {
    throw new Response("Forbidden", { status: 403 });
  }

  return userRes.user;
}

function temporaryPassword() {
  return `Std-${crypto.randomUUID().slice(0, 8)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function toE164Phone(phone: string | null | undefined) {
  const raw = phone?.trim();
  if (!raw) return undefined;
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("92")) return `+${digits}`;
  if (digits.startsWith("0")) return `+92${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("3")) return `+92${digits}`;
  return raw;
}

function studentUsername(rollNumber: string) {
  return rollNumber.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
}

function studentLoginEmail(rollNumber: string) {
  return `${studentUsername(rollNumber)}@student.campus.local`;
}

type AccountBody = {
  studentId: string;
  password?: string;
  reset?: boolean;
};

export const Route = createFileRoute("/api/student-documents/account")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await requireDocumentStaff(request);
          const body = (await request.json()) as AccountBody;
          if (!body.studentId) return json({ error: "Missing student id." }, 400);

          const { data: student, error: studentErr } = await supabaseAdmin
            .from("students")
            .select("id, full_name, email, phone, roll_number, user_id")
            .eq("id", body.studentId)
            .single();
          if (studentErr || !student) return json({ error: studentErr?.message ?? "Student not found." }, 404);

          const password = body.password?.trim() || temporaryPassword();
          if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

          let userId = student.user_id;
          const loginEmail = studentLoginEmail(student.roll_number);
          if (userId) {
            const authPatch: Record<string, unknown> = {
              ...(body.reset ? { password } : {}),
              user_metadata: {
                full_name: student.full_name,
                login_username: student.roll_number,
                real_email: student.email,
                phone: student.phone,
                roll_number: student.roll_number,
                student_id: student.id,
              },
            };
            authPatch.email = loginEmail;
            authPatch.email_confirm = true;
            const normalizedPhone = toE164Phone(student.phone);
            if (normalizedPhone) {
              authPatch.phone = normalizedPhone;
              authPatch.phone_confirm = true;
            }
            const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, authPatch as never);
            if (error) return json({ error: error.message }, 500);
          } else {
            const phone = toE164Phone(student.phone);
            if (!student.roll_number?.trim()) {
              return json({ error: "Student must have an admission number before creating login." }, 400);
            }

            const { data, error } = await supabaseAdmin.auth.admin.createUser({
              email: loginEmail,
              email_confirm: true,
              ...(phone ? { phone, phone_confirm: true } : {}),
              password,
              user_metadata: {
                full_name: student.full_name,
                login_username: student.roll_number,
                real_email: student.email,
                phone: student.phone,
                roll_number: student.roll_number,
                student_id: student.id,
              },
            });
            if (error || !data.user) return json({ error: error?.message ?? "Student account creation failed." }, 500);
            userId = data.user.id;

            await supabaseAdmin.from("profiles").upsert({
              id: userId,
              full_name: student.full_name,
              phone: student.phone ?? null,
              updated_at: new Date().toISOString(),
            });
            const { error: updateErr } = await supabaseAdmin
              .from("students")
              .update({
                user_id: userId,
                student_login_created_at: new Date().toISOString(),
                student_login_created_by: actor.id,
                updated_at: new Date().toISOString(),
              })
              .eq("id", student.id);
            if (updateErr) return json({ error: updateErr.message }, 500);
          }

          await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "student");
          await supabaseAdmin.from("user_roles").insert({
            user_id: userId,
            role: "student",
          });

          await supabaseAdmin.from("student_document_audit_log").insert({
            student_id: student.id,
            actor_id: actor.id,
            action: userId === student.user_id ? "student_login_reset" : "student_login_created",
            notes: "Student mobile app account provisioned",
          });

          return json({
            ok: true,
            user_id: userId,
            username: student.roll_number,
            login_email: loginEmail,
            temporary_password: password,
          });
        } catch (error) {
          if (error instanceof Response) return json({ error: await error.text() }, error.status);
          return json({ error: error instanceof Error ? error.message : "Student account request failed." }, 500);
        }
      },
    },
  },
});
