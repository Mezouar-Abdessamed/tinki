import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, QrCode as QrCodeIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { PageBackgroundVideo } from "@/components/PageBackgroundVideo";
import { ProfileCard } from "@/components/ProfileCard";
import { QrCode } from "@/components/QrCode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { trackCustomLinkClick, trackProfileView, trackSocialClick } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import {
  fetchProfileByUsername,
  getAvatarUrl,
  getBackgroundUrl,
  getCoverUrl,
  isBackgroundStoragePath,
  profilePageBackgroundStyle,
  profilePageVideoUrl,
  profileUrl,
} from "@/lib/profiles";
import { qrSettingsFromProfile } from "@/lib/qr-settings";
import { fetchCustomLinks } from "@/lib/custom-links";
import { fetchSocialLinkSettings } from "@/lib/social-link-settings";
import { registrationEntryPath } from "@/lib/signup-config";

export const Route = createFileRoute("/$username")({
  head: ({ params }) => {
    const name = params.username;
    return {
      meta: [
        { title: `@${name} — all their socials, one link` },
        {
          name: "description",
          content: `Find every social account of @${name} in one place, or scan their QR code`,
        },
        { property: "og:title", content: `@${name} — all their socials, one link` },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
        {
          property: "og:description",
          content: `Find every social account of @${name} in one place, or scan their QR code`,
        },
      ],
    };
  },
  component: PublicProfilePage,
});

// Links that can already be shown (presets, external links, links saved before object
// paths existed) paint straight away; our own uploads wait for a signed link instead.
function displayableBackground(value: string | null | undefined): string | null | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed === "" || isBackgroundStoragePath(trimmed)) return undefined;
  return trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

function PublicProfilePage() {
  const { username } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const [showQr, setShowQr] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => fetchProfileByUsername(username),
  });

  const profile = profileQuery.data;

  const customLinksQuery = useQuery({
    queryKey: ["public-custom-links", profile?.id],
    queryFn: () => fetchCustomLinks(profile?.id ?? "", true),
    enabled: Boolean(profile?.id),
  });

  const socialSettingsQuery = useQuery({
    queryKey: ["public-social-link-settings", profile?.id],
    queryFn: () => fetchSocialLinkSettings(profile?.id ?? ""),
    enabled: Boolean(profile?.id),
  });

  const avatarQuery = useQuery({
    queryKey: ["avatar", profile?.avatar_path],
    queryFn: () => getAvatarUrl(profile?.avatar_path),
    enabled: Boolean(profile?.avatar_path),
  });
  const coverQuery = useQuery({
    queryKey: ["cover", profile?.cover_photo_path],
    queryFn: () => getCoverUrl(profile?.cover_photo_path),
    enabled: Boolean(profile?.cover_photo_path),
  });
  const backgroundImageQuery = useQuery({
    queryKey: ["background-image", profile?.page_background_image_url],
    queryFn: () => getBackgroundUrl(profile?.page_background_image_url),
    enabled: Boolean(profile?.page_background_image_url),
    initialData: displayableBackground(profile?.page_background_image_url),
  });
  const backgroundVideoQuery = useQuery({
    queryKey: ["background-video", profile?.page_background_video_url],
    queryFn: () => getBackgroundUrl(profile?.page_background_video_url),
    enabled: Boolean(profile?.page_background_video_url),
    initialData: displayableBackground(profile?.page_background_video_url),
  });

  // The owner viewing their own page is never counted (the database rejects it too).
  // Clicks are also blocked until we know who is signed in, so an owner whose
  // session is still loading is never mistaken for an anonymous visitor.
  const isOwner = authLoading || Boolean(profile && user && profile.id === user.id);
  const profileId = profile?.id;

  useEffect(() => {
    if (!profileId || authLoading) return;
    void trackProfileView(profileId, isOwner);
  }, [profileId, isOwner, authLoading]);


  if (profileQuery.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="font-display text-7xl font-bold">404</h1>
          <h2 className="mt-4 font-display text-xl font-semibold">No page here</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Nobody has claimed /{username} yet. It could be yours
          </p>
          <Button asChild className="mt-6">
            <Link to={registrationEntryPath()}>Create your page</Link>
          </Button>
        </div>
      </main>
    );
  }

  const url = profileUrl(profile.username);
  // The page is styled from resolved links only: a stored object path becomes a
  // short-lived signed URL, everything already usable arrives unchanged.
  const pageAppearance = {
    ...profile,
    page_background_image_url: backgroundImageQuery.data ?? null,
    page_background_video_url: backgroundVideoQuery.data ?? null,
  };
  const pageBackground = profilePageBackgroundStyle(pageAppearance);
  const pageVideo = profilePageVideoUrl(pageAppearance);

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-14"
      style={pageBackground}
    >
      {pageVideo ? <PageBackgroundVideo src={pageVideo} /> : null}

      <div className="relative z-10 w-full max-w-md">
        {profile.show_qr_button !== false && (
        <Dialog open={showQr} onOpenChange={setShowQr}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Show QR code"
              className="absolute start-3 top-3 z-20 rounded-full bg-background/80 shadow-md backdrop-blur"
            >
              <QrCodeIcon className="h-5 w-5" />
            </Button>
          </DialogTrigger>
          <DialogContent className="flex max-w-xs flex-col items-center gap-4">
            <QrCode
              value={url}
              username={profile.username}
              size={200}
              settings={qrSettingsFromProfile(profile)}
              avatar={{
                url: avatarQuery.data,
                fallback: profile.display_name || profile.username,
              }}
            />
          </DialogContent>
        </Dialog>
        )}

        <ProfileCard
          profile={profile}
          avatarUrl={avatarQuery.data}
          coverUrl={coverQuery.data}
          customLinks={customLinksQuery.data ?? []}
          socialLinkSettings={socialSettingsQuery.data ?? []}
          onSocialClick={(platform) => trackSocialClick(profile.id, platform, isOwner)}
          onCustomLinkClick={(linkId) => trackCustomLinkClick(profile.id, linkId, isOwner)}
        />

        <div className="mt-6 flex flex-col items-center gap-5">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-auto min-h-11 max-w-full whitespace-normal bg-background/90 px-4 py-2.5 text-foreground backdrop-blur-sm"
          >
            <Link to={registrationEntryPath()}>
              <span>Create your Tinki page</span>
              <ArrowUpRight aria-hidden="true" className="rtl:-scale-x-100" />
            </Link>
          </Button>
          <Link to="/" className="text-xs text-muted-foreground transition-colors hover:text-primary">
            Powered by Tinki
          </Link>
        </div>
      </div>
    </main>
  );
}
