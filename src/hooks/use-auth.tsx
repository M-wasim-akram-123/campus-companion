import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { registerAuthSession, sendAuthHeartbeat } from "@/lib/auth-session-api";
import { toast } from "sonner";

export type AppRole =
  | "super_admin"
  | "campus_incharge"
  | "registrar"
  | "admission_officer"
  | "sub_admission_officer"
  | "hr"
  | "finance_admin"
  | "finance_officer"
  | "cashier"
  | "receptionist"
  | "teacher"
  | "student";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (r: AppRole) => boolean;
  hasAnyRole: (rs: AppRole[]) => boolean;
  isStaff: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    setRoles((data?.map((r) => r.role as AppRole)) ?? []);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => fetchRoles(s.user.id), 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchRoles(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;

    let cancelled = false;

    const runHeartbeat = async () => {
      try {
        const result = await sendAuthHeartbeat();
        if (cancelled) return;
        if (result.revoked) {
          toast.error("Signed out — this account logged in on another device.");
          await supabase.auth.signOut();
        }
      } catch {
        // Network blips should not sign the user out.
      }
    };

    void runHeartbeat();
    const interval = window.setInterval(runHeartbeat, 60_000);

    const onVisible = () => {
      if (document.visibilityState === "visible") void runHeartbeat();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session?.access_token]);

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAnyRole = (rs: AppRole[]) => rs.some((r) => roles.includes(r));
  const isStaff = hasAnyRole([
    "super_admin",
    "campus_incharge",
    "registrar",
    "admission_officer",
    "hr",
    "finance_admin",
    "finance_officer",
    "cashier",
    "receptionist",
    "teacher",
  ]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshRoles = async () => {
    if (user) await fetchRoles(user.id);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, roles, loading, hasRole, hasAnyRole, isStaff, signOut, refreshRoles }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
