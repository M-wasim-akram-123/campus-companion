import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { boardRollSuffix, normalizeBoardRollNumber } from "@/lib/board-gazette";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireStaff(request: Request) {
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
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userRes.user) throw new Response("Unauthorized", { status: 401 });

  const { data: roles, error: roleErr } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id);
  if (roleErr || !roles?.length) throw new Response("Forbidden", { status: 403 });

  return userRes.user;
}

export const Route = createFileRoute("/api/board-gazette/lookup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireStaff(request);
          const url = new URL(request.url);
          const importId = url.searchParams.get("importId") ?? "";
          const roll = normalizeBoardRollNumber(url.searchParams.get("roll") ?? "");
          if (!importId || !roll) {
            return json({ found: false, message: "Select gazette year and enter roll number" }, 400);
          }

          const { data: gazette, error: gazetteErr } = await supabaseAdmin
            .from("board_gazette_imports")
            .select("id, label, marks_total, exam_year, is_active")
            .eq("id", importId)
            .maybeSingle();
          if (gazetteErr) return json({ error: gazetteErr.message }, 500);
          if (!gazette || !gazette.is_active) {
            return json({ found: false, message: "Selected gazette is not available" }, 404);
          }

          const suffix = boardRollSuffix(roll);
          const { data: rows, error } = await supabaseAdmin
            .from("board_gazette_results")
            .select("roll_number, candidate_name, marks_obtained, result_status")
            .eq("import_id", importId)
            .in("roll_number", [...new Set([roll, suffix])])
            .limit(2);
          if (error) return json({ error: error.message }, 500);

          const match =
            rows?.find((row) => row.roll_number === roll) ??
            rows?.find((row) => row.roll_number === suffix);
          if (!match) {
            return json({
              found: false,
              rollNumber: suffix || roll,
              message: `Roll number not found in ${gazette.label}`,
            });
          }

          return json({
            found: true,
            rollNumber: match.roll_number,
            candidateName: match.candidate_name,
            marksObtained: match.marks_obtained,
            marksTotal: gazette.marks_total,
            resultStatus: match.result_status,
            gazetteLabel: gazette.label,
          });
        } catch (error) {
          if (error instanceof Response) return json({ error: await error.text() }, error.status);
          return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
        }
      },
    },
  },
});
