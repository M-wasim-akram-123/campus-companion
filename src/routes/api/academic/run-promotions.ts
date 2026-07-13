import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireStaff } from "@/lib/api-auth.server";
import { runAcademicYearCloseAndPromotions } from "@/lib/academic-year-close";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/academic/run-promotions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireStaff(request);
          const body = (await request.json().catch(() => ({}))) as { sessionId?: string };
          const { closeResult, promotionResult } = await runAcademicYearCloseAndPromotions(
            supabaseAdmin,
            { sessionId: body.sessionId },
          );
          return json({ ok: true, ...promotionResult, closeResult });
        } catch (e) {
          if (e instanceof Response) return e;
          const message = e instanceof Error ? e.message : "Promotion run failed";
          return json({ ok: false, error: message }, 500);
        }
      },
    },
  },
});
