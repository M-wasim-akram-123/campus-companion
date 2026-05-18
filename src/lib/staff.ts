import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/use-auth";

const STAFF_ROLES: AppRole[] = [
  "super_admin",
  "admission_officer",
  "finance_officer",
  "receptionist",
  "teacher",
];

export async function fetchStaffProfiles() {
  const { data: roleRows, error: roleErr } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", STAFF_ROLES);
  if (roleErr) throw roleErr;

  const ids = [...new Set(roleRows?.map((r) => r.user_id) ?? [])];
  if (!ids.length) return [];

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids)
    .order("full_name");
  if (error) throw error;
  return profiles ?? [];
}

export async function fetchProfileNames(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map<string, string>();

  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  if (error) throw error;

  return new Map(
    (data ?? []).map((p) => [p.id, p.full_name?.trim() || "Unknown"]),
  );
}
