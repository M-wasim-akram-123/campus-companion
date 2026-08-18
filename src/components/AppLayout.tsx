import { Link, Outlet, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import {
  useAuth,
  type AppRole,
  type TeacherScope,
} from "@/hooks/use-auth";
import {
  ArrowLeft,
  GraduationCap,
  LayoutDashboard,
  ClipboardList,
  UserPlus,
  Users,
  LogOut,
  Layers,
  Wallet,
  Banknote,
  UserCog,
  CircleUserRound,
  FileArchive,
  BookOpenCheck,
  LibraryBig,
  ClipboardCheck,
  Megaphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAMPUS_NAME } from "@/lib/campus";
import { defaultHomePathForRoles } from "@/lib/auth-routing";

const nav: {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: AppRole[];
  teacherScopes?: TeacherScope[];
}[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin"] },
  {
    to: "/inquiries",
    label: "Inquiries",
    icon: ClipboardList,
    roles: ["super_admin", "admission_officer", "sub_admission_officer", "receptionist"],
  },
  {
    to: "/admissions/new",
    label: "New Admission",
    icon: UserPlus,
    roles: ["super_admin", "admission_officer"],
  },
  {
    to: "/students",
    label: "Students",
    icon: Users,
    roles: ["super_admin", "campus_incharge", "registrar", "admission_officer", "hr"],
  },
  {
    to: "/lms/my-classes",
    label: "My BS classes",
    icon: GraduationCap,
    roles: ["teacher"],
    teacherScopes: ["bs", "both"],
  },
  {
    to: "/students/roll-no-slips",
    label: "Roll No Slips",
    icon: ClipboardCheck,
    roles: ["super_admin", "registrar", "finance_admin", "finance_officer"],
  },
  {
    to: "/exams",
    label: "Inter Tests",
    icon: GraduationCap,
    roles: ["super_admin", "exam_officer", "teacher"],
    teacherScopes: ["inter", "both"],
  },
  {
    to: "/exams/catalog",
    label: "Inter Subjects",
    icon: BookOpenCheck,
    roles: ["super_admin", "exam_officer"],
  },
  {
    to: "/exams/reports",
    label: "Inter Reports",
    icon: ClipboardCheck,
    roles: ["super_admin", "exam_officer"],
  },
  {
    to: "/lms",
    label: "BS LMS",
    icon: LibraryBig,
    roles: [
      "super_admin",
      "hod",
      "academic_coordinator",
      "bs_coordinator",
      "registrar",
      "exam_officer",
      "hr",
    ],
  },
  {
    to: "/announcements",
    label: "Announcements",
    icon: Megaphone,
    roles: ["super_admin", "exam_officer", "campus_incharge", "registrar"],
  },
  {
    to: "/students/documents",
    label: "Student Documents",
    icon: FileArchive,
    roles: ["super_admin", "admission_officer", "hr", "finance_admin", "finance_officer", "bs_finance_admin"],
  },
  {
    to: "/finance",
    label: "Finance",
    icon: Banknote,
    roles: ["super_admin", "finance_admin", "finance_officer", "cashier", "bs_finance_admin"],
  },
  { to: "/settings/academic", label: "Academic setup", icon: Layers, roles: ["super_admin"] },
  {
    to: "/settings/board-gazette",
    label: "Board gazettes",
    icon: BookOpenCheck,
    roles: ["super_admin"],
  },
  {
    to: "/settings/fees",
    label: "Fee policies",
    icon: Wallet,
    roles: ["super_admin", "finance_admin", "finance_officer", "bs_finance_admin"],
  },
  {
    to: "/settings/collection-plans",
    label: "Collection plans",
    icon: Wallet,
    roles: ["super_admin", "finance_admin", "bs_finance_admin"],
  },
  { to: "/settings/users", label: "User Management", icon: UserCog, roles: ["super_admin"] },
  { to: "/settings/profile", label: "My Profile", icon: CircleUserRound },
] as const;

export function AppLayout() {
  const { user, signOut, roles, teacherScope } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const scopedTeacher =
    roles.includes("teacher") &&
    !roles.some((role) =>
      ["super_admin", "hod", "academic_coordinator"].includes(role),
    );
  const navItems = nav.filter(
    (item) =>
      (!item.roles || item.roles.some((role) => roles.includes(role))) &&
      (!scopedTeacher ||
        !item.teacherScopes ||
        item.teacherScopes.includes(teacherScope)),
  );
  const homePath = defaultHomePathForRoles(roles, teacherScope);
  const showBackButton = pathname !== homePath;
  const goBack = () => {
    if (window.history.length > 1) {
      router.history.back();
      return;
    }
    navigate({ to: homePath });
  };

  const linkClass = (active: boolean) =>
    cn(
      "group flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
      active
        ? "bg-white/95 text-primary shadow-lg shadow-black/10"
        : "text-sidebar-foreground/78 hover:bg-white/10 hover:text-sidebar-foreground hover:translate-x-0.5",
    );

  return (
    <div className="app-page-shell flex min-h-screen">
      <aside className="hidden w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl shadow-black/15 md:flex">
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-black/20">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <span className="block truncate text-base font-bold tracking-tight">{CAMPUS_NAME}</span>
            <span className="text-xs text-sidebar-foreground/60">Smart campus ERP</span>
          </div>
        </div>
        <nav className="flex-1 space-y-1.5 p-3">
          {navItems.map((item) => {
            const active =
              item.to === "/exams"
                ? pathname === "/exams" ||
                  pathname.startsWith("/exams/series") ||
                  pathname.startsWith("/exams/tests")
                : pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} className={linkClass(active)}>
                <item.icon
                  className={cn(
                    "h-4 w-4 transition-transform",
                    active ? "text-primary" : "group-hover:scale-110",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <div className="mb-3 rounded-2xl bg-white/10 px-3 py-3 text-xs">
            <div className="truncate font-semibold text-sidebar-foreground">{user?.email}</div>
            <div className="mt-1 truncate text-sidebar-foreground/60">
              {roles.join(", ") || "no role"}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-panel sticky top-0 z-40 border-b md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <span className="font-semibold">{CAMPUS_NAME}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t px-2 py-2 text-foreground">
            {navItems.map((item) => {
              const active =
                item.to === "/exams"
                  ? pathname === "/exams" ||
                    pathname.startsWith("/exams/series") ||
                    pathname.startsWith("/exams/tests")
                  : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                    active ? "bg-primary text-primary-foreground shadow" : "hover:bg-accent",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="relative flex-1 p-4 md:p-8">
          <div className="mx-auto max-w-[1500px]">
            {showBackButton && (
              <Button variant="ghost" size="sm" className="mb-4 gap-2" onClick={goBack}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
