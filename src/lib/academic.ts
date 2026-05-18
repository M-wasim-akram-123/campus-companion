import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type SectionGender = Database["public"]["Enums"]["section_gender"];
export type ProgramType = Database["public"]["Enums"]["program_type"];

export function studentGenderToSectionGender(gender: string): SectionGender | null {
  if (gender === "male") return "boys";
  if (gender === "female") return "girls";
  return null;
}

export function sectionGenderLabel(gender: SectionGender): string {
  return gender === "boys" ? "Boys" : "Girls";
}

export async function createProgramWithClasses(
  name: string,
  type: ProgramType,
  durationYears: number,
) {
  const { data: program, error: programError } = await supabase
    .from("programs")
    .insert({ name, type, duration_years: durationYears })
    .select()
    .single();
  if (programError) throw programError;

  const classRows =
    type === "intermediate"
      ? [
          { program_id: program.id, name: "1st Year", year_level: 1 },
          { program_id: program.id, name: "2nd Year", year_level: 2 },
        ]
      : Array.from({ length: durationYears }, (_, i) => ({
          program_id: program.id,
          name: `BS Year ${i + 1}`,
          year_level: i + 1,
        }));

  const { error: classesError } = await supabase.from("classes").insert(classRows);
  if (classesError) throw classesError;

  return program;
}
