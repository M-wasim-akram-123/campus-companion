import { supabase } from "@/integrations/supabase/client";

/** Generates admission number via DB function (per academic session + program type). */
export async function generateAdmissionNumber(
  academicSessionId: string,
  programType: "bs" | "intermediate"
): Promise<string> {
  const { data, error } = await supabase.rpc("next_admission_number", {
    p_session_id: academicSessionId,
    p_program_type: programType,
  });
  if (error) throw error;
  if (!data || typeof data !== "string") {
    throw new Error("Could not generate admission number");
  }
  return data;
}
