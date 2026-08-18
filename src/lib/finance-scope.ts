import type { AppRole } from "@/hooks/use-auth";
import {
  listAcademicSessions,
  sessionsForProgramType,
  type AcademicSessionRow,
  type ProgramType,
} from "@/lib/academic-sessions";

/** Existing finance stack = Intermediate only. */
export const INTERMEDIATE_FINANCE_ROLES: AppRole[] = [
  "finance_admin",
  "finance_officer",
  "cashier",
];

/** Dedicated BS finance role. */
export const BS_FINANCE_ROLES: AppRole[] = ["bs_finance_admin"];

export type FinanceProgramScope = "intermediate" | "bs" | "all";

export function canAccessFinance(roles: AppRole[]): boolean {
  return (
    roles.includes("super_admin") ||
    roles.some((role) => INTERMEDIATE_FINANCE_ROLES.includes(role)) ||
    roles.some((role) => BS_FINANCE_ROLES.includes(role))
  );
}

export function hasIntermediateFinanceRole(roles: AppRole[]): boolean {
  return roles.some((role) => INTERMEDIATE_FINANCE_ROLES.includes(role));
}

export function hasBsFinanceRole(roles: AppRole[]): boolean {
  return roles.some((role) => BS_FINANCE_ROLES.includes(role));
}

/**
 * super_admin → all cohorts.
 * Only BS finance → BS sessions/students.
 * Only Intermediate finance → Intermediate.
 * Both finance role families → all (rare dual assignment).
 */
export function resolveFinanceProgramScope(roles: AppRole[]): FinanceProgramScope {
  if (roles.includes("super_admin")) return "all";
  const inter = hasIntermediateFinanceRole(roles);
  const bs = hasBsFinanceRole(roles);
  if (inter && bs) return "all";
  if (bs) return "bs";
  if (inter) return "intermediate";
  return "all";
}

export function financeScopeProgramType(scope: FinanceProgramScope): ProgramType | null {
  if (scope === "bs") return "bs";
  if (scope === "intermediate") return "intermediate";
  return null;
}

export function financeScopeLabel(scope: FinanceProgramScope): string {
  if (scope === "bs") return "BS Finance";
  if (scope === "intermediate") return "Intermediate Finance";
  return "Campus Finance";
}

export function filterSessionsForFinanceScope(
  sessions: AcademicSessionRow[],
  scope: FinanceProgramScope,
): AcademicSessionRow[] {
  const programType = financeScopeProgramType(scope);
  if (!programType) return sessions;
  return sessionsForProgramType(sessions, programType);
}

export async function listFinanceAcademicSessions(
  scope: FinanceProgramScope,
): Promise<AcademicSessionRow[]> {
  const sessions = await listAcademicSessions();
  return filterSessionsForFinanceScope(sessions, scope);
}

/** True when a student program type is visible for this finance scope. */
export function studentProgramAllowed(
  programType: ProgramType | string | null | undefined,
  scope: FinanceProgramScope,
): boolean {
  if (scope === "all") return true;
  if (!programType) return false;
  return programType === scope;
}
