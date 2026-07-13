import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildCampusInchargeMonthlyCollection } from "@/lib/campus-incharge-analytics";
import type { Database } from "@/integrations/supabase/types";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireFinanceStaff(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase environment variables.");
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
  if (roleErr) throw roleErr;

  const allowed = new Set(["super_admin", "finance_admin", "finance_officer"]);
  if (!roles?.some((row) => allowed.has(row.role))) {
    throw new Response("Forbidden", { status: 403 });
  }

  return userRes.user;
}

export const Route = createFileRoute("/api/finance/campus-incharge-collection")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireFinanceStaff(request);
          const url = new URL(request.url);
          const sessionId = (url.searchParams.get("sessionId") ?? "").trim() || null;
          const monthCount = Math.min(24, Math.max(3, Number(url.searchParams.get("months") ?? 12) || 12));

          const [{ data: roleRows, error: roleErr }, { data: assignments, error: assignErr }] =
            await Promise.all([
              supabaseAdmin.from("user_roles").select("user_id").eq("role", "campus_incharge"),
              supabaseAdmin.from("campus_incharge_assignments").select("user_id, section_id"),
            ]);
          if (roleErr) return json({ error: roleErr.message }, 500);
          if (assignErr) {
            if (assignErr.message.includes("campus_incharge_assignments")) {
              return json(
                {
                  error:
                    "Campus incharge assignments are missing. Run supabase/patch-campus-incharge-sections.sql.",
                },
                500,
              );
            }
            return json({ error: assignErr.message }, 500);
          }

          const inchargeIds = [...new Set((roleRows ?? []).map((row) => row.user_id))];
          if (!inchargeIds.length) {
            return json({
              incharges: [],
              chartRows: [],
              totals: [],
            });
          }

          const [{ data: profiles, error: profileErr }, assignmentRows] = await Promise.all([
            supabaseAdmin.from("profiles").select("id, full_name").in("id", inchargeIds),
            Promise.resolve(assignments ?? []),
          ]);
          if (profileErr) return json({ error: profileErr.message }, 500);

          const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || "Unknown"]));
          const sectionToInchargeIds = new Map<string, string[]>();
          const sectionCounts = new Map<string, number>();

          for (const row of assignmentRows) {
            if (!inchargeIds.includes(row.user_id)) continue;
            const list = sectionToInchargeIds.get(row.section_id) ?? [];
            if (!list.includes(row.user_id)) list.push(row.user_id);
            sectionToInchargeIds.set(row.section_id, list);
            sectionCounts.set(row.user_id, (sectionCounts.get(row.user_id) ?? 0) + 1);
          }

          const incharges = inchargeIds
            .filter((id) => (sectionCounts.get(id) ?? 0) > 0)
            .map((id) => ({
              id,
              name: profileMap.get(id) ?? "Unknown",
              sectionCount: sectionCounts.get(id) ?? 0,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

          if (!incharges.length) {
            return json({ incharges: [], chartRows: [], totals: [] });
          }

          let studentsQuery = supabaseAdmin
            .from("students")
            .select("id, section_id")
            .eq("status", "active");
          if (sessionId) studentsQuery = studentsQuery.eq("academic_session_id", sessionId);

          const { data: students, error: studentErr } = await studentsQuery;
          if (studentErr) return json({ error: studentErr.message }, 500);

          const studentSectionById = new Map(
            (students ?? []).map((student) => [student.id, student.section_id]),
          );
          const studentIds = [...studentSectionById.keys()];

          if (!studentIds.length) {
            const empty = buildCampusInchargeMonthlyCollection({
              incharges,
              sectionToInchargeIds,
              studentSectionById,
              payments: [],
              monthCount,
            });
            return json(empty);
          }

          const since = new Date();
          since.setDate(1);
          since.setMonth(since.getMonth() - (monthCount - 1));

          const { data: payments, error: paymentErr } = await supabaseAdmin
            .from("fee_payments")
            .select("student_id, amount, paid_at")
            .in("student_id", studentIds)
            .gte("paid_at", since.toISOString());
          if (paymentErr) return json({ error: paymentErr.message }, 500);

          const result = buildCampusInchargeMonthlyCollection({
            incharges,
            sectionToInchargeIds,
            studentSectionById,
            payments: payments ?? [],
            monthCount,
          });

          return json(result);
        } catch (error) {
          if (error instanceof Response) {
            return json({ error: await error.text() }, error.status);
          }
          const message = error instanceof Error ? error.message : "Failed to load campus incharge collection.";
          return json({ error: message }, 500);
        }
      },
    },
  },
});
