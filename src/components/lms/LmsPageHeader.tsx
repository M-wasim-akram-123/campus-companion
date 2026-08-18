import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Building2,
  CalendarOff,
  CalendarRange,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Presentation,
  UsersRound,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  canManageLmsAcademics,
  canManageLmsCalendar,
  canManageLmsTeachers,
  canMarkLectureDeliveries,
  canViewLmsSalarySheet,
  isBsCoordinator,
} from "@/lib/lms/permissions";

const items = [
  { to: "/lms", label: "Overview", icon: LayoutDashboard, manage: false, teacher: false },
  {
    to: "/lms/my-classes",
    label: "My classes",
    icon: UsersRound,
    manage: false,
    teacher: true,
  },
  { to: "/lms/departments", label: "Departments", icon: Building2, manage: true, teacher: false },
  { to: "/lms/semesters", label: "Semesters", icon: CalendarRange, manage: true, teacher: false },
  { to: "/lms/courses", label: "Courses", icon: BookOpen, manage: true, teacher: false },
  { to: "/lms/teachers", label: "Teachers", icon: Presentation, teachers: true, teacher: false },
  { to: "/lms/offerings", label: "Offerings", icon: GraduationCap, manage: true, teacher: false },
  {
    to: "/lms/deliveries",
    label: "Lectures",
    icon: ClipboardCheck,
    deliveries: true,
    teacher: false,
  },
  {
    to: "/lms/calendar",
    label: "Day offs",
    icon: CalendarOff,
    calendar: true,
    teacher: false,
  },
  { to: "/lms/salary", label: "Salary", icon: Wallet, salary: true, teacher: false },
] as const;

export function LmsPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { roles } = useAuth();
  const canManage = canManageLmsAcademics(roles);
  const canManageTeachers = canManageLmsTeachers(roles);
  const canViewSalary = canViewLmsSalarySheet(roles);
  const canCalendar = canManageLmsCalendar(roles);
  const canDeliveries = canMarkLectureDeliveries(roles) || canViewSalary;
  const coordinatorOnly =
    isBsCoordinator(roles) && !canManage && !canManageTeachers && !roles.includes("super_admin");
  const isTeacherOnly =
    roles.includes("teacher") &&
    !canManage &&
    !canManageTeachers &&
    !isBsCoordinator(roles) &&
    !roles.includes("super_admin");
  const visibleItems = items.filter((item) => {
    if (item.teacher) return roles.includes("teacher");
    if (coordinatorOnly) {
      return "deliveries" in item && item.deliveries;
    }
    if (isTeacherOnly) {
      return Boolean(item.teacher);
    }
    if ("salary" in item && item.salary) return canViewSalary;
    if ("calendar" in item && item.calendar) return canCalendar;
    if ("deliveries" in item && item.deliveries) return canDeliveries;
    return (
      (!item.manage || canManage) && (!("teachers" in item) || !item.teachers || canManageTeachers)
    );
  });

  return (
    <div className="space-y-5">
      <div className="glass-panel relative overflow-hidden rounded-3xl p-6">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute bottom-0 right-28 h-28 w-28 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <UsersRound className="h-3.5 w-3.5" />
              BS ERP & LMS
            </div>
            <h1 className="text-3xl font-black tracking-tight">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
          </div>
          {actions}
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border bg-card/70 p-2 shadow-sm">
        {visibleItems.map((item) => {
          const active =
            item.to === "/lms"
              ? pathname === "/lms" || pathname === "/lms/"
              : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
