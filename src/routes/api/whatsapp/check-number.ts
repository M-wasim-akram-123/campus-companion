import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import type { Database } from "@/integrations/supabase/types";
import { validateWhatsAppPhone } from "@/lib/phone";

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

async function checkWhatsAppLive(normalized: string): Promise<boolean | null> {
  const provider = process.env.WHATSAPP_CHECK_PROVIDER?.trim().toLowerCase();
  const apiKey = process.env.WHATSAPP_CHECK_API_KEY?.trim();
  const fromNumber = process.env.WHATSAPP_CHECK_FROM_NUMBER?.trim();

  if (!provider || !apiKey) return null;

  if (provider === "2chat") {
    if (!fromNumber) return null;
    const url = `https://api.p.2chat.io/open/whatsapp/check-number/${encodeURIComponent(fromNumber)}/${encodeURIComponent(`+${normalized}`)}`;
    const res = await fetch(url, {
      headers: {
        "X-User-API-Key": apiKey,
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error("WhatsApp check provider returned an error");
    const data = (await res.json()) as { on_whatsapp?: boolean; is_valid?: boolean };
    if (data.is_valid === false) return false;
    return Boolean(data.on_whatsapp);
  }

  const template = process.env.WHATSAPP_CHECK_API_URL?.trim();
  if (!template) return null;
  const url = template.replace("{phone}", encodeURIComponent(normalized));
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error("WhatsApp check provider returned an error");
  const data = (await res.json()) as { onWhatsApp?: boolean; exists?: boolean; on_whatsapp?: boolean };
  if (typeof data.onWhatsApp === "boolean") return data.onWhatsApp;
  if (typeof data.on_whatsapp === "boolean") return data.on_whatsapp;
  if (typeof data.exists === "boolean") return data.exists;
  return null;
}

export const Route = createFileRoute("/api/whatsapp/check-number")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireStaff(request);
          const url = new URL(request.url);
          const phone = url.searchParams.get("phone") ?? "";
          const validation = validateWhatsAppPhone(phone.startsWith("92") ? `+${phone}` : phone);

          if (!validation.valid) {
            return json({
              formatValid: false,
              onWhatsApp: null,
              liveCheckAvailable: false,
              message: validation.error,
            });
          }

          try {
            const onWhatsApp = await checkWhatsAppLive(validation.normalized);
            if (onWhatsApp === null) {
              return json({
                formatValid: true,
                onWhatsApp: null,
                liveCheckAvailable: false,
                normalized: validation.normalized,
                display: validation.display,
                message:
                  "Format valid for WhatsApp. Set WHATSAPP_CHECK_PROVIDER + WHATSAPP_CHECK_API_KEY for live verification.",
              });
            }

            return json({
              formatValid: true,
              onWhatsApp,
              liveCheckAvailable: true,
              normalized: validation.normalized,
              display: validation.display,
            });
          } catch (error) {
            return json({
              formatValid: true,
              onWhatsApp: null,
              liveCheckAvailable: false,
              normalized: validation.normalized,
              display: validation.display,
              message: error instanceof Error ? error.message : "Live WhatsApp check failed",
            });
          }
        } catch (error) {
          if (error instanceof Response) return json({ error: await error.text() }, error.status);
          return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
        }
      },
    },
  },
});
