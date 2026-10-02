import { createFileRoute } from "@tanstack/react-router";

import { ProfileAppearanceEditor } from "@/components/dashboard/ProfileAppearanceEditor";
import { useMyProfile } from "@/lib/use-profile";

export const Route = createFileRoute("/dashboard/customize")({
  head: () => ({
    meta: [
      { title: "Customize Profile — LinkMe" },
      { name: "description", content: "Customize the colors of your public LinkMe profile page and card." },
      { property: "og:title", content: "Customize Profile — LinkMe" },
      { property: "og:description", content: "Customize the colors of your public LinkMe profile page and card." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomizeProfilePage,
});

function CustomizeProfilePage() {
  const { profile, avatarUrl, refetch } = useMyProfile();
  if (!profile) return null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold">Customize profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">Choose how your public page looks to visitors.</p>
      </header>
      <ProfileAppearanceEditor profile={profile} avatarUrl={avatarUrl} onSaved={() => void refetch()} />
    </div>
  );
}