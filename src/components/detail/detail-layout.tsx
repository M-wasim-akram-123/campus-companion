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
    <div className="glass-panel flex flex-col gap-4 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {photo}
        <div className="min-w-0">
          <h1 className="truncate bg-gradient-to-r from-foreground to-primary bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl">{title}</h1>
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
    <div className={cn("glass-panel min-w-0 overflow-hidden rounded-2xl", className)}>
      <div className="border-b border-border/60 bg-primary/5 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="min-w-0 p-4">{children}</div>
    </div>
  );
}

export function DetailSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("glass-panel min-w-0 overflow-hidden rounded-2xl", className)}>
      <div className="flex flex-col gap-2 border-b border-border/60 bg-primary/5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="min-w-0 p-4">{children}</div>
    </section>
  );
}

export function SubsectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
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
    <div className="min-w-0 rounded-2xl border bg-white/60 px-3 py-2 shadow-sm backdrop-blur">
      <p className="truncate text-xs text-muted-foreground" title={label}>
        {label}
      </p>
      <p className="truncate text-sm font-semibold" title={value}>
        {value}
      </p>
    </div>
  );
}
