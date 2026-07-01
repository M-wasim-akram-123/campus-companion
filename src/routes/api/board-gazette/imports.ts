import { createFileRoute } from "@tanstack/react-router";
import { requireStaff, requireSuperAdmin } from "@/lib/api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function errorJson(error: unknown) {
  if (error instanceof Response) {
    return json({ error: await error.text() }, error.status);
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return json({ error: message }, 500);
}

export const Route = createFileRoute("/api/board-gazette/imports")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireStaff(request);
          const url = new URL(request.url);
          const includeInactive = url.searchParams.get("all") === "1";

          if (includeInactive) {
            await requireSuperAdmin(request);
          }

          let query = supabaseAdmin
            .from("board_gazette_imports")
            .select(
              "id, board_code, exam_level, exam_session, exam_year, label, marks_total, is_active, row_count, imported_at, source_file",
            )
            .order("exam_year", { ascending: false })
            .order("imported_at", { ascending: false });

          if (!includeInactive) {
            query = query.eq("is_active", true);
          }

          const { data, error } = await query;
          if (error) return json({ error: error.message }, 500);
          return json({ imports: data ?? [] });
        } catch (error) {
          return errorJson(error);
        }
      },
      PATCH: async ({ request }) => {
        try {
          await requireSuperAdmin(request);
          const body = (await request.json()) as { id?: string; is_active?: boolean };
          if (!body.id || typeof body.is_active !== "boolean") {
            return json({ error: "Provide import id and is_active." }, 400);
          }

          const { data, error } = await supabaseAdmin
            .from("board_gazette_imports")
            .update({ is_active: body.is_active })
            .eq("id", body.id)
            .select("id, label, is_active")
            .single();
          if (error) return json({ error: error.message }, 500);
          return json({ import: data });
        } catch (error) {
          return errorJson(error);
        }
      },
    },
  },
});
