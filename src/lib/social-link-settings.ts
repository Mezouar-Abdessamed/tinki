import { supabase } from "@/lib/app-supabase";
import { SOCIAL_PLATFORMS, type SocialKey } from "@/lib/socials";

export type SocialLinkSetting = {
  id: string | undefined;
  profile_id: string;
  platform: SocialKey;
  enabled: boolean;
  position: number;
};

export async function fetchSocialLinkSettings(profileId: string) {
  const { data, error } = await supabase
    .from("social_link_settings")
    .select("id, profile_id, platform, enabled, position")
    .eq("profile_id", profileId)
    .order("position", { ascending: true });
  if (error) throw error;

  const saved = new Map((data ?? []).map((item) => [item.platform, item]));
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
  const payload = settings.map((setting, position) => ({
    profile_id: setting.profile_id,
    platform: setting.platform,
    enabled: setting.enabled,
    position,
  }));
  const { error } = await supabase
    .from("social_link_settings")
    .upsert(payload, { onConflict: "profile_id,platform" });
  if (error) throw error;
}