import { BadgeCheck } from "lucide-react";
import { CoverBanner } from "@/components/CoverBanner";

import { SocialIcon } from "@/components/SocialIcon";
import { CustomLinksList } from "@/components/CustomLinksList";
import type { CustomLink } from "@/lib/custom-links";
import { SOCIAL_PLATFORMS, type SocialField, type SocialKey } from "@/lib/socials";
import type { SocialLinkSetting } from "@/lib/social-link-settings";
import {
  profileCardBackground,
  socialIconStyles,
  textTypographyStyle,
  type CardAppearance,
  type FontFamilyKey,
  type FontStyleKey,
  type PageAppearance,
} from "@/lib/profiles";

export type ProfileCardData = {
  id?: string;
  username: string;
  display_name?: string | null;
  bio?: string | null;
  verified?: boolean | null;
  name_font_family?: FontFamilyKey | null;
  name_font_weight?: number | null;
  name_font_style?: FontStyleKey | null;
  bio_font_family?: FontFamilyKey | null;
  bio_font_weight?: number | null;
  bio_font_style?: FontStyleKey | null;
  name_color?: string | null;
  bio_color?: string | null;
  cover_photo_x?: number | null;
  cover_photo_y?: number | null;
  cover_photo_path?: string | null;
} & Partial<Record<SocialField, string | null>> & CardAppearance & PageAppearance;

type ProfileCardProps = {
  profile: ProfileCardData;
  avatarUrl?: string | null | undefined;
  coverUrl?: string | null | undefined;
  compact?: boolean;
  hideAvatar?: boolean;
  onSocialClick?: ((platform: SocialKey) => void) | undefined;
  onCustomLinkClick?: ((linkId: string) => void) | undefined;
  customLinks?: CustomLink[];
  socialLinkSettings?: SocialLinkSetting[];
};

function initials(profile: ProfileCardData) {
  const source = (profile.display_name || profile.username || "?").trim();
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfileCard({
  profile,
  avatarUrl,
  coverUrl,
  compact = false,
  hideAvatar = false,
  onSocialClick,
  onCustomLinkClick,
  customLinks = [],
  socialLinkSettings = [],
}: ProfileCardProps) {
  const settings = new Map(socialLinkSettings.map((item) => [item.platform, item]));
  const links = SOCIAL_PLATFORMS.filter((platform) => {
    const value = profile[platform.field];
    return typeof value === "string" && value.trim().length > 0 && (settings.get(platform.key)?.enabled ?? true);
  }).sort((a, b) => (settings.get(a.key)?.position ?? SOCIAL_PLATFORMS.indexOf(a)) - (settings.get(b.key)?.position ?? SOCIAL_PLATFORMS.indexOf(b)));
  // Verification is fixed to a single username by design; no admin system.
  const showVerifiedBadge = profile.username === "abdessamed";
  const background = profileCardBackground(profile);
  const iconStyles = socialIconStyles(profile);
  const nameStyle = textTypographyStyle({
    family: profile.name_font_family ?? "display",
    weight: profile.name_font_weight ?? 600,
    style: profile.name_font_style ?? "normal",
    color: profile.name_color ?? null,
  });
  const bioStyle = textTypographyStyle({
    family: profile.bio_font_family ?? "sans",
    weight: profile.bio_font_weight ?? 400,
    style: profile.bio_font_style ?? "normal",
    color: profile.bio_color ?? null,
  });

  return (
    <div
      className={`panel relative overflow-hidden text-center ${profile.cover_photo_path || coverUrl ? "" : compact ? "p-6" : "p-8 sm:p-10"}`}
      style={background ? { background } : undefined}
    >
      <div className="bg-halo pointer-events-none absolute inset-x-0 top-0 h-40" />
      {(profile.cover_photo_path || coverUrl) && <CoverBanner url={coverUrl ?? null} x={profile.cover_photo_x ?? 50} y={profile.cover_photo_y ?? 50} className="w-full max-h-[280px]" />}
      {showVerifiedBadge ? (
        <BadgeCheck
          aria-label="Verified account"
          className={`absolute end-3 top-3 z-10 text-verified verified-spin ${compact ? "h-5 w-5" : "h-7 w-7"}`}
          style={{ filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))" }}
        />
      ) : null}
      <div className={`relative flex flex-col items-center ${profile.cover_photo_path || coverUrl ? `${compact ? "px-6 pb-6" : "px-8 pb-8 sm:px-10 sm:pb-10"} ${hideAvatar ? "pt-6" : "-mt-10 sm:-mt-14"}` : ""}`}>
        {!hideAvatar && (
        <div
          className={`overflow-hidden rounded-full border border-border bg-muted ${
            compact ? "h-20 w-20" : "h-28 w-28"
          }`}
          style={{ boxShadow: "var(--shadow-glow)" }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${profile.display_name || profile.username} profile picture`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-2xl text-muted-foreground">
              {initials(profile)}
            </div>
          )}
        </div>
        )}

        <h2
          className={`mt-5 text-center ${compact ? "text-xl" : "text-3xl"}`}
          style={nameStyle}
        >
          {profile.display_name || profile.username}
        </h2>
        <p className="mt-1 text-sm text-primary">@{profile.username}</p>

        {profile.bio ? (
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground" style={bioStyle}>
            {profile.bio}
          </p>
        ) : null}

        {links.length > 0 ? (
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {links.map((platform) => (
              <a
                key={platform.key}
                href={profile[platform.field] as string}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={platform.label}
                title={platform.label}
                onClick={() => onSocialClick?.(platform.key)}
                className="group flex h-12 w-12 items-center justify-center rounded-full border border-border bg-secondary transition-all hover:-translate-y-1 hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                style={{ ...iconStyles.wrapper, transitionDuration: "240ms" }}
              >
                <SocialIcon
                  platform={platform.key}
                  className="h-5 w-5 text-secondary-foreground transition-colors group-hover:text-primary"
                  style={iconStyles.icon}
                />
              </a>
            ))}
          </div>
        ) : customLinks.length === 0 ? (
          <p className="mt-7 text-xs text-muted-foreground">No links added yet</p>
        ) : null}
        <CustomLinksList
          links={customLinks}
          compact={compact}
          onLinkClick={onCustomLinkClick}
          iconStyles={iconStyles}
        />
      </div>
    </div>
  );
}
