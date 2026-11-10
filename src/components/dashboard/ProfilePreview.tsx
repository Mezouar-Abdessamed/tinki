import { useQuery } from "@tanstack/react-query";

import { PageBackgroundVideo } from "@/components/PageBackgroundVideo";
import { ProfileCard, type ProfileCardData } from "@/components/ProfileCard";
import { fetchCustomLinks } from "@/lib/custom-links";
import { fetchSocialLinkSettings } from "@/lib/social-link-settings";
import { getCoverUrl, profilePageBackgroundStyle, profilePageVideoUrl } from "@/lib/profiles";
import { cn } from "@/lib/utils";

/**
 * Read-only rendering of the public profile, exactly as visitors see it.
 * Social icons stay clickable, but nothing here is editable.
 */
export function ProfilePreview({
  profile,
  avatarUrl,
  fullPage = false,
  backgroundOnly = false,
  className,
}: {
  profile: ProfileCardData & { id: string };
  avatarUrl?: string | null | undefined;
  fullPage?: boolean;
  backgroundOnly?: boolean;
  className?: string;
}) {
  const customLinksQuery = useQuery({
    queryKey: ["custom-links", profile.id],
    queryFn: () => fetchCustomLinks(profile.id, true),
  });
  const socialSettingsQuery = useQuery({
    queryKey: ["social-link-settings", profile.id],
    queryFn: () => fetchSocialLinkSettings(profile.id),
  });
  const coverQuery = useQuery({
    queryKey: ["cover", profile.cover_photo_path],
    queryFn: () => getCoverUrl(profile.cover_photo_path),
    enabled: Boolean(profile.cover_photo_path),
  });

  const background = profilePageBackgroundStyle(profile);
  const video = profilePageVideoUrl(profile);

  return (
    <div
      data-profile-preview={fullPage ? "page" : "compact"}
      className={cn(
        fullPage
          ? "profile-page-preview relative flex min-h-[720px] flex-col items-center justify-center overflow-hidden bg-background px-6 py-16 sm:px-12 sm:py-20"
          : "relative overflow-hidden rounded-xl p-5 sm:p-8",
        className,
      )}
      style={background ? { ...background, ...(fullPage ? { backgroundAttachment: "scroll" } : {}) } : undefined}
    >
      {video ? <PageBackgroundVideo src={video} /> : null}
      <div
        className={cn("relative z-10 mx-auto w-full max-w-md", fullPage && "profile-page-preview-card", backgroundOnly && "invisible")}
        aria-hidden={backgroundOnly || undefined}
        inert={backgroundOnly || undefined}
      >
      <ProfileCard
        profile={profile}
        avatarUrl={avatarUrl}
        coverUrl={coverQuery.data}
        customLinks={customLinksQuery.data ?? []}
        socialLinkSettings={socialSettingsQuery.data ?? []}
        compact={!fullPage}
      />
      </div>
    </div>
  );
}
