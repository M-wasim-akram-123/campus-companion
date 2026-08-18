import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";
import { CAMPUS_NAME } from "@/lib/campus";
import { defaultHomePathForRoles } from "@/lib/auth-routing";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }

    const userId = data.session?.user?.id;
    if (!userId || !data.session?.access_token) {
      setLoading(false);
      toast.success("Signed in");
      navigate({ to: "/dashboard" });
      return;
    }

    try {
      const { registerAuthSession } = await import("@/lib/auth-session-api");
      await registerAuthSession();
    } catch (e: unknown) {
      await supabase.auth.signOut();
      setLoading(false);
      return toast.error(
        e instanceof Error ? e.message : "Could not start session. Try again.",
      );
    }

    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (roleRows ?? []).map((row) => row.role as import("@/hooks/use-auth").AppRole);
    const metadataScope = data.session.user.user_metadata?.teacher_scope;
    const teacherScope =
      metadataScope === "inter" || metadataScope === "bs" || metadataScope === "both"
        ? metadataScope
        : "both";
    setLoading(false);
    toast.success("Signed in");
    navigate({ to: defaultHomePathForRoles(roles, teacherScope) });
  };

  return (
    <div className="app-page-shell flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-cyan-400 text-primary-foreground shadow-xl shadow-primary/25">
            <GraduationCap className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">Sign in to {CAMPUS_NAME}</CardTitle>
          <CardDescription>Enter your credentials to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            No account? <Link to="/signup" className="text-primary hover:underline">Sign up</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
