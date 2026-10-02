import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { createProfileFromStoredUsername, fetchMyProfile, getAvatarUrl } from "@/lib/profiles";

/** Shared source of truth for the signed-in user's profile across the dashboard. */
export function useMyProfile() {
  const { user } = useAuth();
  const userId = user?.id ?? "";

  const profileQuery = useQuery({
    queryKey: ["my-profile", userId],
    queryFn: async () => {
      const existing = await fetchMyProfile(userId);
      if (existing) return existing;
      // Someone who picked a username at sign-up gets their page created here,
      // the first time they arrive with a confirmed account.
      return createProfileFromStoredUsername(userId, user?.user_metadata?.["username"]);
    },
    enabled: Boolean(userId),
  });

  const profile = profileQuery.data ?? null;

  const avatarQuery = useQuery({
    queryKey: ["avatar", profile?.avatar_path],
    queryFn: () => getAvatarUrl(profile?.avatar_path),
    enabled: Boolean(profile?.avatar_path),
  });

  return {
    userId,
    profile,
    avatarUrl: profile?.avatar_path ? (avatarQuery.data ?? null) : null,
    isLoading: profileQuery.isLoading,
    refetch: profileQuery.refetch,
  };
}
