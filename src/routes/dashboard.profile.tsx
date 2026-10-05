import { createFileRoute } from "@tanstack/react-router";

import { ProfileLinkCard } from "@/components/dashboard/ProfileLinkCard";
import { ProfilePreview } from "@/components/dashboard/ProfilePreview";
import { QrCodeCard } from "@/components/dashboard/QrCodeCard";
import { SocialLinksReadonly } from "@/components/dashboard/SocialLinksReadonly";
import { profileUrl } from "@/lib/profiles";
import { qrSettingsFromProfile } from "@/lib/qr-settings";
import { useMyProfile } from "@/lib/use-profile";

export const Route = createFileRoute("/dashboard/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — Tinki" },
      {
        name: "description",
        content: "Preview your public page, copy your link, and get your QR code.",
      },
      { property: "og:title", content: "My Profile — Tinki" },
      {
        property: "og:description",
        content: "Preview your public page, copy your link, and get your QR code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyProfilePage,
});

function MyProfilePage() {
  const { profile, avatarUrl } = useMyProfile();
  if (!profile) return null;

  const url = profileUrl(profile.username);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold">My Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Exactly what visitors see, plus everything you need to share it.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Live Preview</h2>
        <ProfilePreview profile={profile} avatarUrl={avatarUrl} />
      </section>

      <ProfileLinkCard url={url} username={profile.username} />
      <QrCodeCard
        url={url}
        username={profile.username}
        settings={qrSettingsFromProfile(profile)}
        avatar={{ url: avatarUrl, fallback: profile.display_name || profile.username }}
      />
      <SocialLinksReadonly profile={profile} />
    </div>
  );
}
