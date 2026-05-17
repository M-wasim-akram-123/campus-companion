import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Users, UserPlus, TrendingUp } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Dashboard() {
  const { user, roles } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [inq, students, newInq] = await Promise.all([
        supabase.from("inquiries").select("*", { count: "exact", head: true }),
        supabase.from("students").select("*", { count: "exact", head: true }),
        supabase.from("inquiries").select("*", { count: "exact", head: true }).eq("status", "new"),
      ]);
      return {
        totalInquiries: inq.count ?? 0,
        totalStudents: students.count ?? 0,
        newInquiries: newInq.count ?? 0,
      };
    },
  });

  const cards = [
    { label: "Total Inquiries", value: stats?.totalInquiries ?? "—", icon: ClipboardList },
    { label: "New Inquiries", value: stats?.newInquiries ?? "—", icon: UserPlus },
    { label: "Total Students", value: stats?.totalStudents ?? "—", icon: Users },
    { label: "This Month", value: "—", icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user?.email}</p>
        <p className="mt-1 text-xs text-muted-foreground">Roles: {roles.join(", ") || "—"}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Getting Started</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Use <strong>Inquiries</strong> to capture new prospective students.</p>
          <p>• Convert an inquiry into an admission or use <strong>New Admission</strong> directly.</p>
          <p>• View and manage admitted students in <strong>Students</strong>.</p>
          <p>• Fees, vouchers and payments arrive in Phase 2.</p>
        </CardContent>
      </Card>
    </div>
  );
}
