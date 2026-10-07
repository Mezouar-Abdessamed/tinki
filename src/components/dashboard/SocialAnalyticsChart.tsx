import { BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { SocialIcon } from "@/components/SocialIcon";
import { SOCIAL_PLATFORMS, type SocialKey } from "@/lib/socials";

export function SocialAnalyticsChart({
  activePlatforms,
  byPlatform,
  loading = false,
}: {
  /** Keys of the platforms whose icons are currently live on the public page. */
  activePlatforms: SocialKey[];
  byPlatform: Record<string, number>;
  loading?: boolean;
}) {
  const active = new Set(activePlatforms);
  const data = SOCIAL_PLATFORMS.filter((platform) => active.has(platform.key)).map((platform) => ({
    key: platform.key,
    name: platform.label,
    clicks: byPlatform[platform.key] ?? 0,
    tint: platform.tint,
  }));
  const total = data.reduce((sum, row) => sum + row.clicks, 0);

  return (
    <section className="panel p-6">
      <h2 className="font-display text-lg font-semibold">Social Analytics</h2>
      <p className="mt-2 text-sm text-muted-foreground">Clicks broken down by platform</p>

      {loading ? (
        <div className="mt-6 h-64 animate-pulse rounded-lg bg-muted" />
      ) : total === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <BarChart3 className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {activePlatforms.length === 0
              ? "No active social icons yet. Add a link to see clicks here"
              : "No social clicks yet. Share your link and they'll show up here"}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={88}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--secondary)" }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    fontSize: "0.8rem",
                    color: "var(--popover-foreground)",
                  }}
                />
                <Bar dataKey="clicks" radius={[0, 6, 6, 0]} barSize={16}>
                  {data.map((row) => (
                    <Cell key={row.key} fill={row.tint} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {data.map((row) => (
              <li
                key={row.key}
                className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-secondary px-3 py-2"
              >
                <SocialIcon platform={row.key} className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate text-sm">{row.name}</span>
                <span className="ms-auto shrink-0 text-sm font-medium">{row.clicks}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
