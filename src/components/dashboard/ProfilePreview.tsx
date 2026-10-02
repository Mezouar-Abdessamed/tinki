import { useQuery } from "@tanstack/react-query";

import { PageBackgroundVideo } from "@/components/PageBackgroundVideo";
import { ProfileCard, type ProfileCardData } from "@/components/ProfileCard";
import { fetchCustomLinks } from "@/lib/custom-links";
import { fetchSocialLinkSettings } from "@/lib/social-link-settings";
import { getCoverUrl, profilePageBackgroundStyle, profilePageVideoUrl } from "@/lib/profiles";

/**
 * Read-only rendering of the public profile, exactly as visitors see it.
 * Social icons stay clickable, but nothing here is editable.
 */
export function ProfilePreview({
  profile,
  avatarUrl,
}: {
  profile: ProfileCardData & { id: string };
  avatarUrl?: string | null | undefined;
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
    <div className="relative overflow-hidden rounded-xl p-5 sm:p-8" style={background}>
      {video ? <PageBackgroundVideo src={video} /> : null}
      <div className="relative z-10 mx-auto w-full max-w-md">
      <ProfileCard
        profile={profile}
        avatarUrl={avatarUrl}
        coverUrl={coverQuery.data}
        customLinks={customLinksQuery.data ?? []}
        socialLinkSettings={socialSettingsQuery.data ?? []}
        compact
      />
      </div>
    </div>
  );
}
