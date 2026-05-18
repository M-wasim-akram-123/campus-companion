import { supabase } from "@/integrations/supabase/client";

/** Generates ADM-{year}-{seq} via DB function (per academic session). */
export async function generateAdmissionNumber(academicSessionId: string): Promise<string> {
  const { data, error } = await supabase.rpc("next_admission_number", {
    p_session_id: academicSessionId,
  });
  if (error) throw error;
  if (!data || typeof data !== "string") {
    throw new Error("Could not generate admission number");
  }
  return data;
}
