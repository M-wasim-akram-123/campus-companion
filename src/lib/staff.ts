import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/use-auth";

const STAFF_ROLES: AppRole[] = [
  "super_admin",
  "admission_officer",
  "hr",
  "finance_admin",
  "finance_officer",
  "cashier",
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

export async function fetchProfilesByRole(role: AppRole) {
  // Use the server endpoint (admin client) so RLS on user_roles/profiles does
  // not hide other users from staff who are allowed to assign them.
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (token) {
    const res = await fetch(`/api/staff/by-role?role=${encodeURIComponent(role)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { profiles?: { id: string; full_name: string }[] };
      return json.profiles ?? [];
    }
  }

  const { data: roleRows, error: roleErr } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", role);
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

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (token) {
    const res = await fetch(`/api/staff/profiles?ids=${encodeURIComponent(ids.join(","))}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { profiles?: { id: string; full_name: string }[] };
      return new Map((json.profiles ?? []).map((p) => [p.id, p.full_name?.trim() || "Unknown"]));
    }
  }

  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  if (error) throw error;

  return new Map((data ?? []).map((p) => [p.id, p.full_name?.trim() || "Unknown"]));
}
