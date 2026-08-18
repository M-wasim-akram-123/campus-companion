import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type ProgramType = Database["public"]["Enums"]["program_type"];

export type AcademicSessionRow = {
  id: string;
  label: string;
  start_year: number;
  end_year: number;
  is_active: boolean;
  program_type: ProgramType;
  created_at?: string;
};

export function cohortDurationYears(programType: ProgramType): number {
  return programType === "bs" ? 4 : 2;
}

export function suggestSessionEndYear(startYear: number, programType: ProgramType): number {
  return startYear + cohortDurationYears(programType);
}

export function formatSessionLabel(startYear: number, endYear: number): string {
  return `${startYear}-${endYear}`;
}

export function programTypeLabel(programType: ProgramType): string {
  return programType === "bs" ? "BS" : "Intermediate";
}

export function runningSessions(
  sessions: AcademicSessionRow[],
  programType?: ProgramType | null,
): AcademicSessionRow[] {
  return sessions
    .filter((row) => row.is_active && (!programType || row.program_type === programType))
    .sort((a, b) => b.start_year - a.start_year || a.label.localeCompare(b.label));
}

export function sessionsForProgramType(
  sessions: AcademicSessionRow[],
  programType?: ProgramType | null,
): AcademicSessionRow[] {
  if (!programType) return [...sessions].sort((a, b) => b.start_year - a.start_year);
  return sessions
    .filter((row) => row.program_type === programType)
    .sort((a, b) => b.start_year - a.start_year || a.label.localeCompare(b.label));
}

export function runningSessionIds(
  sessions: AcademicSessionRow[],
  programType?: ProgramType | null,
): string[] {
  return runningSessions(sessions, programType).map((row) => row.id);
}

/** Newest running cohort for a program type; otherwise newest session of that type. */
export function resolveDefaultSessionId(
  sessions: AcademicSessionRow[],
  opts?: {
    programType?: ProgramType | null;
    preferRunning?: boolean;
  },
): string | null {
  const preferRunning = opts?.preferRunning !== false;
  const typed = sessionsForProgramType(sessions, opts?.programType);
  if (!typed.length) return null;
  if (preferRunning) {
    const running = runningSessions(typed, opts?.programType);
    if (running.length) return running[0].id;
  }
  return typed[0].id;
}

export function sessionActiveBadge(session: AcademicSessionRow): string | null {
  if (!session.is_active) return null;
  return `Running ${programTypeLabel(session.program_type)}`;
}

export async function listAcademicSessions(): Promise<AcademicSessionRow[]> {
  const { data, error } = await supabase
    .from("academic_sessions")
    .select("id, label, start_year, end_year, is_active, program_type, created_at")
    .order("start_year", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    start_year: row.start_year,
    end_year: row.end_year,
    is_active: row.is_active,
    program_type: (row.program_type ?? "intermediate") as ProgramType,
    created_at: row.created_at,
  }));
}
