import type { LucideIcon } from "lucide-react";

export function StatsCard({
  label,
  value,
  hint,
  icon: Icon,
  loading = false,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: LucideIcon;
  loading?: boolean;
}) {
  return (
    <div className="panel p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          {loading ? (
            <div className="mt-3 h-9 w-20 animate-pulse rounded-md bg-muted" />
          ) : (
            <p className="mt-2 font-display text-4xl font-semibold">{value.toLocaleString()}</p>
          )}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
      {hint ? <p className="mt-3 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
