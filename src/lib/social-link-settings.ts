import { apiFetch } from "@/lib/api-client";
import type { AppTableRow } from "@/lib/database-types";
import { SOCIAL_PLATFORMS, type SocialKey } from "@/lib/profile-validation";

export type SocialLinkSetting = {
  id: string | undefined;
  profile_id: string;
  platform: SocialKey;
  enabled: boolean;
  position: number;
};

export async function fetchSocialLinkSettings(profileId: string) {
  if (typeof window !== "undefined" && profileId) {
    try {
      const { fetchSocialLinkSettingsFirestore } = await import("@/lib/firestore-repository");
      return await fetchSocialLinkSettingsFirestore(profileId);
    } catch {
      /* fallback to server API */
    }
  }
  const { settings } = await apiFetch<{ settings: AppTableRow<"social_link_settings">[] }>(
    `/api/profiles/${encodeURIComponent(profileId)}/social-settings`,
  );

  const saved = new Map(settings.map((item) => [item.platform, item]));
  return SOCIAL_PLATFORMS.map((platform, position) => {
    const setting = saved.get(platform.key);
    return {
      id: setting?.id,
      profile_id: profileId,
      platform: platform.key,
      enabled: setting?.enabled ?? true,
      position: setting?.position ?? position,
    } satisfies SocialLinkSetting;
  }).sort((a, b) => a.position - b.position);
}

export async function saveSocialLinkSettings(settings: SocialLinkSetting[]) {
  if (typeof window !== "undefined") {
    const { auth: fbAuth, saveSocialLinkSettingsFirestore } = await import("@/lib/firestore-repository");
    if (fbAuth.currentUser) {
      await saveSocialLinkSettingsFirestore(settings);
      return;
    }
  }
  const payload = settings.map((setting, position) => ({
    profile_id: setting.profile_id,
    platform: setting.platform,
    enabled: setting.enabled,
    position,
  }));
  await apiFetch("/api/social-settings", {
    method: "PUT",
    body: JSON.stringify({ settings: payload }),
  });
}