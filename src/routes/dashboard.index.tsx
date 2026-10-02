import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, Link2, MousePointerClick } from "lucide-react";

import { CountriesAnalytics } from "@/components/dashboard/CountriesAnalytics";
import { SocialAnalyticsChart } from "@/components/dashboard/SocialAnalyticsChart";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { fetchMyAnalytics } from "@/lib/analytics";
import { fetchSocialLinkSettings } from "@/lib/social-link-settings";
import { SOCIAL_PLATFORMS } from "@/lib/socials";
import { useMyProfile } from "@/lib/use-profile";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Dashboard — LinkMe" },
      { name: "description", content: "See how many people visit your page and click your links." },
      { property: "og:title", content: "Dashboard — LinkMe" },
      {
        property: "og:description",
        content: "See how many people visit your page and click your links.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardHome,
});

function DashboardHome() {
  const { profile } = useMyProfile();
  const profileId = profile?.id ?? "";

  const analyticsQuery = useQuery({
    queryKey: ["analytics", profileId],
    queryFn: () => fetchMyAnalytics(profileId),
    enabled: Boolean(profileId),
  });

  const socialSettingsQuery = useQuery({
    queryKey: ["dashboard-social-link-settings", profileId],
    queryFn: () => fetchSocialLinkSettings(profileId),
    enabled: Boolean(profileId),
  });

  if (!profile) return null;

  const analytics = analyticsQuery.data;
  const loading = analyticsQuery.isLoading;

  // "Active" icons: the platform has a link and its toggle is on — the same
  // icons visitors see on the public page.
  const enabledByPlatform = new Map(
    (socialSettingsQuery.data ?? []).map((setting) => [setting.platform, setting.enabled]),
  );
  const activePlatforms = SOCIAL_PLATFORMS.filter(
    (platform) =>
      typeof profile[platform.field] === "string" &&
      profile[platform.field]!.trim().length > 0 &&
      (enabledByPlatform.get(platform.key) ?? true),
  );
  // "Social Clicks" intentionally shows ALL-TIME clicks (analytics.clicks),
  // not a sum over currently-active platforms. Filtering by active state here
  // made the number silently drop when a link was removed or toggled off,
  // even though those clicks are still recorded. Active-platform filtering
  // belongs only to the chart breakdown below.


  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Real numbers from your public page at /{profile.username}.
        </p>
      </header>

      {analyticsQuery.isError ? (
        <p className="text-sm text-destructive">
          We couldn't load your statistics right now. Please refresh the page.
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          label="Profile Views"
          value={analytics?.views ?? 0}
          hint="People who opened your page. Your own visits are never counted."
          icon={Eye}
          loading={loading}
        />
        <StatsCard
          label="Social Clicks"
          value={analytics?.clicks ?? 0}
          hint="All-time taps on your social icons — including platforms you've since removed or turned off."
          icon={MousePointerClick}
          loading={loading}
        />
        <StatsCard
          label="Custom Link Clicks"
          value={analytics?.customLinkClicks ?? 0}
          hint="Times a visitor tapped one of your custom links."
          icon={Link2}
          loading={loading}
        />
      </div>

      <SocialAnalyticsChart
        activePlatforms={activePlatforms.map((platform) => platform.key)}
        byPlatform={analytics?.byPlatform ?? {}}
        loading={loading}
      />

      <CountriesAnalytics byCountry={analytics?.byCountry ?? {}} loading={loading} />
    </div>
  );
}
