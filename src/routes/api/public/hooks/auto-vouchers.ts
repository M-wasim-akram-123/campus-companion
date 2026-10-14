import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/auto-vouchers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Security: require authentication via secret header
        const authHeader = request.headers.get("x-auto-vouchers-secret");
        const expectedSecret = process.env.AUTO_VOUCHERS_SECRET;

        if (!expectedSecret) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "AUTO_VOUCHERS_SECRET not configured on server",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        if (!authHeader || authHeader !== expectedSecret) {
          return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized" }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const url = new URL(request.url);
        const days = Math.max(1, Math.min(60, Number(url.searchParams.get("days") ?? 7)));
        const { data, error } = await supabaseAdmin.rpc("auto_issue_due_vouchers", {
          p_days_ahead: days,
        });
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, issued: data }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
