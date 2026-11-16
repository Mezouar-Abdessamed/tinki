import {
  BarChart3,
  Download,
  Eye,
  Globe2,
  Link2,
  MousePointerClick,
  QrCode as QrCodeIcon,
  Share2,
} from "lucide-react";
import type { ReactNode } from "react";

import anonymousProfile from "@/assets/anonymous-profile.jpg";
import { ProfileCard, type ProfileCardData } from "@/components/ProfileCard";
import { QrCode } from "@/components/QrCode";
import { SocialIcon } from "@/components/SocialIcon";
import { Button } from "@/components/ui/button";
import type { CustomLink } from "@/lib/custom-links";
import { useLanguage } from "@/lib/i18n";
import {
  ANALYTICS_COUNTRY_MOCK,
  ANALYTICS_PLATFORM_MOCK,
  LANDING_THEME_PRESETS,
  type LandingThemePreset,
} from "@/lib/landing-content";
import type { QrSettings } from "@/lib/qr-settings";

export const DEMO_URL = "https://tinki.app/sara.designs";

export const demoProfile: ProfileCardData = {
  username: "sara.designs",
  display_name: "Sara Benali",
  bio: "Product designer in Algiers. Portfolio, shop and everything I post — right here",
  instagram_url: "https://instagram.com/sara.designs",
  tiktok_url: "https://tiktok.com/@sara.designs",
  linkedin_url: "https://linkedin.com/in/sara",
  github_url: "https://github.com/sara",
  youtube_url: "https://youtube.com/@sara",
  cover_photo_x: 50,
  cover_photo_y: 48,
};

function demoLink(id: string, name: string, icon: string, link_type = "link"): CustomLink {
  return {
    id,
    name,
    icon,
    link_type,
    url: "#",
    enabled: true,
    position: 0,
    profile_id: "demo",
    created_at: "",
    updated_at: "",
  };
}

export const demoLinks: CustomLink[] = [
  demoLink("1", "Portfolio", "portfolio"),
  demoLink("2", "My online shop", "globe"),
  demoLink("3", "Work with me", "email", "email"),
];

export const brandQr: QrSettings = {
  foregroundColor: "#0f1a2b",
  backgroundColor: "#ffffff",
  margin: 2,
  errorCorrection: "H",
  moduleShape: "rounded",
  eyeShape: "leaf",
};

/** Real ProfileCard with demo data, rendered inert so the preview can't navigate. */
export function DemoProfile({ compact = false }: { compact?: boolean }) {
  return (
    <div inert className="pointer-events-none select-none">
      <ProfileCard
        profile={demoProfile}
        avatarUrl={anonymousProfile}
        coverUrl="/presets/geometric.svg"
        customLinks={demoLinks}
        compact={compact}
      />
    </div>
  );
}

/** Mirrors the complete public-profile view inside the landing device frames. */
export function DemoPublicProfile({
  compact = false,
  showQrButton = true,
  showCover = true,
  theme = LANDING_THEME_PRESETS[0],
}: {
  compact?: boolean;
  showQrButton?: boolean;
  showCover?: boolean;
  theme?: LandingThemePreset | undefined;
}) {
  const { t } = useLanguage();
  const activeTheme = theme ?? LANDING_THEME_PRESETS[0]!;
  const isGradientCard = activeTheme.cardBg.startsWith("linear-gradient");
  const gradientHexMatches = activeTheme.cardBg.match(/#[0-9a-f]{6}/gi) ?? [];

  const styledProfile: ProfileCardData = {
    ...demoProfile,
    bio: t(demoProfile.bio ?? ""),
    cover_photo_path: showCover ? "/presets/geometric.svg" : null,
    card_background_type: isGradientCard && gradientHexMatches.length >= 2 ? "linear" : "solid",
    card_background_color:
      isGradientCard && gradientHexMatches[0] ? gradientHexMatches[0] : activeTheme.cardBg,
    card_gradient_color: isGradientCard && gradientHexMatches[1] ? gradientHexMatches[1] : null,
    card_gradient_angle: 135,
    social_icon_color: activeTheme.iconColor,
    social_icon_bg_color: activeTheme.iconBgColor,
    name_color: activeTheme.nameColor,
    bio_color: activeTheme.bioColor,
    name_font_family: activeTheme.nameFontFamily,
  };

  const translatedLinks = demoLinks.map((item) => ({
    ...item,
    name: t(item.name),
  }));

  return (
    <div
      inert
      className={`pointer-events-none relative flex w-full flex-col items-center justify-center overflow-hidden bg-background transition-[background] duration-300 select-none ${
        compact ? "min-h-[470px] px-2 py-4" : "min-h-[540px] px-8 py-10"
      }`}
      style={{ background: activeTheme.pageBg }}
    >
      <div className={`relative z-10 w-full ${compact ? "max-w-[270px]" : "max-w-sm"}`}>
        {showQrButton && (
          <Button
            variant="outline"
            size="icon"
            tabIndex={-1}
            aria-label={t("Show QR code")}
            className={`absolute z-20 rounded-full bg-background/80 shadow-md backdrop-blur ${
              compact ? "start-2 top-2 h-8 w-8" : "start-3 top-3"
            }`}
          >
            <QrCodeIcon className={compact ? "h-4 w-4" : "h-5 w-5"} />
          </Button>
        )}
        <div className="rounded-xl [&_.panel]:border-white/10">
          <ProfileCard
            profile={styledProfile}
            avatarUrl={anonymousProfile}
            coverUrl={showCover ? "/presets/geometric.svg" : null}
            customLinks={translatedLinks}
            compact={compact}
          />
        </div>
        <p className="mt-4 text-center text-xs text-white/80 drop-shadow-xs">{t("Powered by Tinki")}</p>
      </div>
    </div>
  );
}

export function PhoneFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[2.25rem] border border-border bg-surface p-2 shadow-[var(--shadow-panel)] ${className}`}
    >
      <div className="overflow-hidden rounded-[1.75rem] bg-background">
        <div className="flex justify-center py-2">
          <span className="h-1.5 w-16 rounded-full bg-secondary" />
        </div>
        <div className="px-3 pb-4">{children}</div>
      </div>
    </div>
  );
}

export function BrowserFrame({ children, url, className = "" }: { children: ReactNode; url: string; className?: string }) {
  return (
    <div className={`liquid-glass overflow-hidden rounded-xl border border-white/10 ${className}`}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5" dir="ltr">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-secondary" />
          <span className="h-2.5 w-2.5 rounded-full bg-secondary" />
          <span className="h-2.5 w-2.5 rounded-full bg-secondary" />
        </div>
        <span className="min-w-0 flex-1 truncate rounded-md bg-background px-3 py-1 text-xs text-muted-foreground">
          {url}
        </span>
      </div>
      <div className="bg-background">{children}</div>
    </div>
  );
}

/** Share strip that mirrors the "My Profile" link card. */
export function ShareStrip() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2 ps-3 text-sm">
      <Link2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-muted-foreground" dir="ltr">
        tinki.app/sara.designs
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> {t("Share")}
      </span>
    </div>
  );
}

export function DemoQr({ size = 150, settings = brandQr }: { size?: number; settings?: QrSettings }) {
  return (
    <div inert className="pointer-events-none">
      <QrCode
        value={DEMO_URL}
        username="sara.designs"
        size={size}
        showDownload={false}
        settings={settings}
        avatar={{ url: anonymousProfile, fallback: "Sara Benali" }}
      />
    </div>
  );
}

export function QrDownloadRow() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <Download className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      <span>{t("Download as PNG")}</span>
    </div>
  );
}

const weekly = [32, 45, 38, 61, 54, 78, 70];

export function AnalyticsMock() {
  const { t } = useLanguage();
  const max = Math.max(...weekly);
  const maxPlatform = ANALYTICS_PLATFORM_MOCK[0]!.value;
  const maxCountry = ANALYTICS_COUNTRY_MOCK[0]!.views;
  const stats = [
    { label: "Profile Views", value: "1,284", icon: Eye },
    { label: "Social Clicks", value: "424", icon: MousePointerClick },
    { label: "Custom Link Clicks", value: "167", icon: Link2 },
  ];

  return (
    <div className="liquid-glass rounded-xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-display font-semibold">
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" /> {t("Dashboard")}
        </p>
        <span className="rounded-md border border-border px-2.5 py-0.5 text-[11px] tracking-wide text-muted-foreground uppercase">
          {t("Sample data")}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-background p-3">
            <s.icon className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="mt-2 font-display text-xl font-semibold sm:text-2xl">{s.value}</p>
            <p className="truncate text-xs text-muted-foreground">{t(s.label)}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs font-medium text-muted-foreground">{t("Views this week")}</p>
          <div className="mt-3 flex h-24 items-end gap-2" aria-hidden="true">
            {weekly.map((v, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center gap-1.5">
                <div className="relative w-full flex-1">
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t-md bg-primary/80"
                    style={{ height: `${(v / max) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{"MTWTFSS"[i]}</span>
              </div>
            ))}
          </div>

          <p className="mt-5 text-xs font-medium text-muted-foreground">{t("Clicks by platform")}</p>
          <ul className="mt-2.5 space-y-2">
            {ANALYTICS_PLATFORM_MOCK.map((p) => (
              <li key={p.key} className="flex items-center gap-2.5 text-xs">
                <SocialIcon platform={p.key} className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="w-20 shrink-0 truncate">{p.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(p.value / maxPlatform) * 100}%` }} />
                </span>
                <span className="w-8 shrink-0 text-end font-medium tabular-nums">{p.value}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Globe2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            {t("Views by Country")}
          </p>
          <ul className="mt-3 space-y-2.5">
            {ANALYTICS_COUNTRY_MOCK.map((country) => (
              <li key={country.code} className="relative overflow-hidden rounded-lg border border-border bg-surface">
                <div
                  className="absolute inset-y-0 start-0 bg-primary/12"
                  style={{ width: `${Math.max((country.views / maxCountry) * 100, 8)}%` }}
                  aria-hidden="true"
                />
                <div className="relative flex items-center gap-2.5 px-3 py-2 text-xs">
                  <span className="w-6 shrink-0 font-semibold text-muted-foreground uppercase">{country.code}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{t(country.name)}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{country.share}</span>
                  <span className="w-9 shrink-0 text-end font-semibold tabular-nums">{country.views}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
