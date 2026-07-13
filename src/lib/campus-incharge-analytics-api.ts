import { supabase } from "@/integrations/supabase/client";
import type { CampusInchargeMonthlyCollection } from "@/lib/campus-incharge-analytics";

export async function fetchCampusInchargeMonthlyCollection(
  sessionId?: string,
  months = 12,
): Promise<CampusInchargeMonthlyCollection> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const params = new URLSearchParams();
  if (sessionId) params.set("sessionId", sessionId);
  params.set("months", String(months));

  const res = await fetch(`/api/finance/campus-incharge-collection?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json().catch(() => ({}))) as CampusInchargeMonthlyCollection & { error?: string };
  if (!res.ok) throw new Error(json.error || "Failed to load campus incharge collection chart.");
  return json;
}
