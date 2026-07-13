import { supabase } from "@/integrations/supabase/client";

/** Sentinel value for the legacy custom installment schedule. */
export const OTHER_COLLECTION_PLAN_ID = "__other__";

/** Academic year starts in July (Jul–Jun). */
export const ACADEMIC_YEAR_START_MONTH = 7;

export const CALENDAR_MONTHS = [
  { value: 1, label: "January", short: "Jan" },
  { value: 2, label: "February", short: "Feb" },
  { value: 3, label: "March", short: "Mar" },
  { value: 4, label: "April", short: "Apr" },
  { value: 5, label: "May", short: "May" },
  { value: 6, label: "June", short: "Jun" },
  { value: 7, label: "July", short: "Jul" },
  { value: 8, label: "August", short: "Aug" },
  { value: 9, label: "September", short: "Sep" },
  { value: 10, label: "October", short: "Oct" },
  { value: 11, label: "November", short: "Nov" },
  { value: 12, label: "December", short: "Dec" },
] as const;

export type FeeCollectionPlan = {
  id: string;
  name: string;
  description: string | null;
  collection_months: number[];
  due_day: number;
  is_active: boolean;
  sort_order: number;
};

export function academicMonthOrder(month: number): number {
  return month >= ACADEMIC_YEAR_START_MONTH
    ? month - ACADEMIC_YEAR_START_MONTH
    : month + (12 - ACADEMIC_YEAR_START_MONTH);
}

export function sortCollectionMonths(months: number[]): number[] {
  return [...new Set(months)].sort((a, b) => academicMonthOrder(a) - academicMonthOrder(b));
}

export function monthLabel(month: number, short = false): string {
  const row = CALENDAR_MONTHS.find((m) => m.value === month);
  if (!row) return String(month);
  return short ? row.short : row.label;
}

export function formatCollectionMonths(months: number[], short = true): string {
  return sortCollectionMonths(months)
    .map((m) => monthLabel(m, short))
    .join(", ");
}

export function dueDateForCollectionMonth(
  month: number,
  sessionStartYear: number,
  dueDay: number,
): string {
  const year = month >= ACADEMIC_YEAR_START_MONTH ? sessionStartYear : sessionStartYear + 1;
  const day = Math.min(Math.max(dueDay, 1), 28);
  const d = new Date(year, month - 1, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function generateCollectionPlanDueDates(
  plan: Pick<FeeCollectionPlan, "collection_months" | "due_day">,
  sessionStartYear: number,
): string[] {
  const sorted = sortCollectionMonths(plan.collection_months);
  return sorted.map((month) => dueDateForCollectionMonth(month, sessionStartYear, plan.due_day));
}

export function sessionStartYearFromDate(date: Date): number {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return month >= ACADEMIC_YEAR_START_MONTH ? year : year - 1;
}

export async function fetchCollectionPlans(activeOnly = true): Promise<FeeCollectionPlan[]> {
  let query = supabase
    .from("fee_collection_plans")
    .select("id, name, description, collection_months, due_day, is_active, sort_order")
    .order("sort_order")
    .order("name");

  if (activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) {
    if (error.message.includes("fee_collection_plans") || error.message.includes("schema cache")) {
      return [];
    }
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    collection_months: (row.collection_months ?? []).map(Number),
    due_day: Number(row.due_day ?? 10),
    is_active: row.is_active,
    sort_order: Number(row.sort_order ?? 0),
  }));
}

export async function fetchCollectionPlanById(id: string): Promise<FeeCollectionPlan | null> {
  const { data, error } = await supabase
    .from("fee_collection_plans")
    .select("id, name, description, collection_months, due_day, is_active, sort_order")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (error.message.includes("fee_collection_plans")) return null;
    throw error;
  }
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    collection_months: (data.collection_months ?? []).map(Number),
    due_day: Number(data.due_day ?? 10),
    is_active: data.is_active,
    sort_order: Number(data.sort_order ?? 0),
  };
}
