import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  GraduationCap, LayoutDashboard, ClipboardList, UserPlus, Users, LogOut, Layers, Wallet, Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inquiries", label: "Inquiries", icon: ClipboardList },
  { to: "/admissions/new", label: "New Admission", icon: UserPlus },
  { to: "/students", label: "Students", icon: Users },
  { to: "/settings/academic", label: "Academic setup", icon: Layers },
  { to: "/settings/fees", label: "Fee policies", icon: Wallet },
  { to: "/finance", label: "Finance", icon: Banknote },
] as const;

export function AppLayout() {
  const { user, signOut, roles } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const navItems = nav;

  const linkClass = (active: boolean) =>
    cn(
      "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
      active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
    );

  return (
    <div className="flex min-h-screen bg-muted/20">
      <aside className="hidden w-64 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <GraduationCap className="h-6 w-6 text-primary" />
          <span className="font-semibold">College ERP</span>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} className={linkClass(active)}>
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b bg-card md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <span className="font-semibold">College ERP</span>
            </div>
            <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t px-2 py-2">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <Link key={item.to} to={item.to} className={linkClass(active)}>
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
