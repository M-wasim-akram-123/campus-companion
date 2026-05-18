import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DetailPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-7xl space-y-5", className)}>{children}</div>;
}

export function DetailHeader({
  title,
  subtitle,
  badge,
  actions,
  photo,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  photo?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {photo}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground" title={subtitle}>
              {subtitle}
            </p>
          )}
        </div>
        {badge && <div className="hidden sm:block">{badge}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {badge && <div className="sm:hidden">{badge}</div>}
        {actions}
      </div>
    </div>
  );
}

export function InfoCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-xl border bg-card", className)}>
      <div className="border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="min-w-0 p-4">{children}</div>
    </div>
  );
}

export function FieldGrid({ children, cols = 1 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const colClass =
    cols === 3
      ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
      : cols === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1";
  return <div className={cn("grid min-w-0 gap-3", colClass)}>{children}</div>;
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  const display =
    value == null || value === "" ? "—" : typeof value === "string" || typeof value === "number" ? value : value;
  return (
    <div className="min-w-0 space-y-0.5 text-sm">
      <p className="text-xs leading-snug text-muted-foreground">{label}</p>
      <p className="font-medium break-words [overflow-wrap:anywhere]">{display}</p>
    </div>
  );
}

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
      <p className="truncate text-xs text-muted-foreground" title={label}>
        {label}
      </p>
      <p className="truncate text-sm font-semibold" title={value}>
        {value}
      </p>
    </div>
  );
}
