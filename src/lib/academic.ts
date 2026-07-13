import { ACADEMIC_YEAR_START_MONTH, sessionStartYearFromDate } from "@/lib/fee-collection-plans";
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

export function ordinalYearLabel(yearLevel: number): string {
  if (yearLevel === 1) return "1st Year";
  if (yearLevel === 2) return "2nd Year";
  if (yearLevel === 3) return "3rd Year";
  return `${yearLevel}th Year`;
}

export function currentAcademicYearStart(now = new Date()): number {
  return sessionStartYearFromDate(now);
}

export function academicYearElapsed(sessionStartYear: number, now = new Date()): number {
  return Math.max(0, currentAcademicYearStart(now) - sessionStartYear);
}

/** True on or after 1 July of the given academic-year start calendar year. */
export function isOnOrAfterAcademicYearStart(academicYearStart: number, now = new Date()): boolean {
  const cutoff = new Date(academicYearStart, ACADEMIC_YEAR_START_MONTH - 1, 1);
  return now >= cutoff;
}

export function targetYearLevelForStudent(params: {
  sessionStartYear: number;
  admissionYearLevel: number;
  now?: Date;
}): number {
  return params.admissionYearLevel + academicYearElapsed(params.sessionStartYear, params.now);
}

export type AcademicStanding = {
  label: string;
  detail: string;
  isPast: boolean;
  currentYearLevel: number | null;
};

export function deriveAcademicStanding({
  sessionStartYear,
  sessionEndYear,
  admissionYearLevel,
  programDurationYears,
  now = new Date(),
}: {
  sessionStartYear?: number | null;
  sessionEndYear?: number | null;
  admissionYearLevel?: number | null;
  programDurationYears?: number | null;
  now?: Date;
}): AcademicStanding {
  if (!sessionStartYear || !sessionEndYear || !admissionYearLevel) {
    return {
      label: "Not assigned",
      detail: "Session/class is not complete",
      isPast: false,
      currentYearLevel: null,
    };
  }

  const graduationCutoff = new Date(sessionEndYear, 5, 1);
  if (now >= graduationCutoff) {
    return {
      label: "Past student",
      detail: `Session completed in ${sessionEndYear}`,
      isPast: true,
      currentYearLevel: null,
    };
  }

  const academicYearStart = currentAcademicYearStart(now);
  const elapsedYears = academicYearElapsed(sessionStartYear, now);
  const currentYearLevel = admissionYearLevel + elapsedYears;
  const maxYear = programDurationYears ?? sessionEndYear - sessionStartYear;

  if (currentYearLevel > maxYear) {
    return {
      label: "Past student",
      detail: `Program duration completed`,
      isPast: true,
      currentYearLevel: null,
    };
  }

  return {
    label: ordinalYearLabel(currentYearLevel),
    detail: `${academicYearStart}-${academicYearStart + 1}`,
    isPast: false,
    currentYearLevel,
  };
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
