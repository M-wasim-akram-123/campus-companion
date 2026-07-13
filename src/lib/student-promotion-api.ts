import { supabase } from "@/integrations/supabase/client";
import type { PromotionResult } from "@/lib/student-promotion";
import type { YearCloseResult } from "@/lib/academic-year-close";

async function authApi<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

/** Run year-end close (30 June) then annual promotion if due (from 1 July). Idempotent per academic year. */
export async function runAcademicPromotionsIfDue(sessionId?: string) {
  return authApi<PromotionResult & { ok: boolean; closeResult: YearCloseResult }>(
    "/api/academic/run-promotions",
    {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    },
  );
}
