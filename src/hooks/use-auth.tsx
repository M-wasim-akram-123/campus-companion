import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  clearAuthSession,
  registerAuthSession,
  sendAuthHeartbeat,
} from "@/lib/auth-session-api";
import { STAFF_ROLES } from "@/lib/auth-routing";
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
  | "exam_officer"
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
  const [sessionReady, setSessionReady] = useState(false);

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    setRoles((data?.map((r) => r.role as AppRole)) ?? []);
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      void (async () => {
        if (event === "SIGNED_OUT" || !s) {
          setSessionReady(false);
          setSession(null);
          setUser(null);
          setRoles([]);
          return;
        }

        if (event === "SIGNED_IN" && s) {
          setSession(s);
          setUser(s.user);
          setSessionReady(false);
          try {
            await registerAuthSession();
          } catch (e: unknown) {
            setSession(null);
            setUser(null);
            setSessionReady(false);
            await supabase.auth.signOut();
            toast.error(
              e instanceof Error ? e.message : "Could not start session. Try signing in again.",
            );
            return;
          }
          setSessionReady(true);
          await fetchRoles(s.user.id);
          return;
        }

        setSession(s);
        setUser(s.user);
        setSessionReady(true);
        await fetchRoles(s.user.id);
      })();
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s?.user) {
        setSession(s);
        setUser(s.user);
        setSessionReady(true);
        fetchRoles(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.access_token || !sessionReady) return;

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
  }, [session?.access_token, sessionReady]);

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAnyRole = (rs: AppRole[]) => rs.some((r) => roles.includes(r));
  const isStaff = hasAnyRole(STAFF_ROLES);

  const signOut = async () => {
    try {
      await clearAuthSession();
    } catch {
      // Best effort — still sign out locally.
    }
    setSessionReady(false);
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
