import { useState } from "react";
import { ChevronDown, ChevronUp, Globe2 } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

const TOP_COUNT = 5;
const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function percentage(views: number, total: number): string {
  if (total === 0) return "0%";
  const share = (views / total) * 100;
  return share < 0.1 && views > 0 ? "<0.1%" : `${share.toFixed(1)}%`;
}

function countryName(code: string, locale: string): string {
  try {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

export function CountriesAnalytics({
  byCountry,
  loading = false,
}: {
  /** Country code (ISO 3166-1 alpha-2) → number of profile views. */
  byCountry: Record<string, number>;
  loading?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const { lang } = useLanguage();

  const entries = Object.entries(byCountry)
    .map(([code, views]) => ({ code, name: countryName(code, lang), views }))
    .sort((a, b) => b.views - a.views || a.name.localeCompare(b.name));

  const total = entries.reduce((sum, row) => sum + row.views, 0);
  const visible = showAll ? entries : entries.slice(0, TOP_COUNT);
  const hiddenCount = entries.length - TOP_COUNT;
  const topCountries = entries.slice(0, TOP_COUNT).filter((row) => row.views > 0);
  const otherViews = entries.slice(TOP_COUNT).reduce((sum, row) => sum + row.views, 0);
  const slices = [
    ...topCountries.map((row, index) => ({ ...row, color: SLICE_COLORS[index] })),
    ...(otherViews > 0
      ? [{ code: "other", name: "Other", views: otherViews, color: "var(--muted-foreground)" }]
      : []),
  ];

  return (
    <section className="panel p-6">
      <h2 className="font-display text-lg font-semibold">Views by Country</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Where the people visiting your page are located.
      </p>

      {loading ? (
        <div className="mt-6 h-48 animate-pulse rounded-lg bg-muted" />
      ) : total === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <Globe2 className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No country data yet. New visits will show up here with their country.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div
              className="mx-auto h-56 w-full max-w-64"
              role="img"
              aria-label={`Views by country: ${slices.map((row) => `${row.name} ${percentage(row.views, total)}`).join(", ")}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="views"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="88%"
                    stroke="var(--surface)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {slices.map((row) => (
                      <Cell key={row.code} fill={row.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [
                      `${Number(value).toLocaleString()} views · ${percentage(Number(value), total)}`,
                      name,
                    ]}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                      color: "var(--popover-foreground)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-3" aria-label="Country percentages">
              {slices.map((row) => (
                <li key={row.code} className="flex min-w-0 items-center gap-2 text-sm">
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: row.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 truncate" title={row.name}>
                    {row.name}
                  </span>
                  <span className="ms-auto shrink-0 font-medium tabular-nums">
                    {percentage(row.views, total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <ul className="mt-5 space-y-2">
            {visible.map((row) => {
              const share = total > 0 ? row.views / total : 0;
              return (
                <li
                  key={row.code}
                  className="relative overflow-hidden rounded-lg border border-border bg-secondary"
                >
                  <div
                    className="absolute inset-y-0 start-0 bg-primary/10"
                    style={{ width: `${Math.max(share * 100, 2)}%` }}
                    aria-hidden
                  />
                  <div className="relative flex items-center gap-3 px-3 py-2">
                    <span className="w-8 shrink-0 text-xs font-semibold uppercase text-muted-foreground">
                      {row.code}
                    </span>
                    <span className="truncate text-sm">{row.name}</span>
                    <span className="ms-auto shrink-0 text-sm font-medium">{row.views}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          {hiddenCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? (
                <>
                  Show less <ChevronUp className="ms-1 h-4 w-4" />
                </>
              ) : (
                <>
                  See all ({entries.length} countries) <ChevronDown className="ms-1 h-4 w-4" />
                </>
              )}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
