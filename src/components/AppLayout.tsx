import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  GraduationCap, LayoutDashboard, ClipboardList, UserPlus, Users, LogOut, Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inquiries", label: "Inquiries", icon: ClipboardList },
  { to: "/admissions/new", label: "New Admission", icon: UserPlus },
  { to: "/students", label: "Students", icon: Users },
];

export function AppLayout() {
  const { user, signOut, roles } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="hidden w-64 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <GraduationCap className="h-6 w-6 text-primary" />
          <span className="font-semibold">College ERP</span>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                )}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 px-2 text-xs text-muted-foreground">
            <div className="truncate font-medium text-foreground">{user?.email}</div>
            <div className="mt-0.5 truncate">{roles.join(", ") || "no role"}</div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
            <LogOut className="mr-2 h-4 w-4" />Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex h-16 items-center justify-between border-b bg-card px-4 md:hidden">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <span className="font-semibold">College ERP</span>
          </div>
          <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <main className="p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
