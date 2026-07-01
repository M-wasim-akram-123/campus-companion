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

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: { full_name: fullName.trim() },
        },
      });

      if (error) {
        if (error.status === 429 || /rate limit|too many requests/i.test(error.message)) {
          toast.error(
            "Too many signup attempts. Wait 10–15 minutes, or create the user in Supabase Dashboard → Authentication → Users, then sign in.",
            { duration: 8000 },
          );
          return;
        }
        toast.error(error.message);
        return;
      }

      if (data.session) {
        try {
          const { registerAuthSession } = await import("@/lib/auth-session-api");
          await registerAuthSession();
        } catch {
          // Session tracking optional until DB patch is applied.
        }
        toast.success("Account created — you are signed in");
        navigate({ to: "/dashboard" });
        return;
      }

      toast.success(
        "Account created. Check your email to confirm, or disable “Confirm email” in Supabase Auth settings and try signing in.",
        { duration: 8000 },
      );
      navigate({ to: "/login" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page-shell flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-cyan-400 text-primary-foreground shadow-xl shadow-primary/25">
            <GraduationCap className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>{CAMPUS_NAME} admin access</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating..." : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
