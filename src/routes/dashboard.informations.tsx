import { createFileRoute } from "@tanstack/react-router";

import { EditInformationsForm } from "@/components/dashboard/EditInformationsForm";
import { useMyProfile } from "@/lib/use-profile";

export const Route = createFileRoute("/dashboard/informations")({
  head: () => ({
    meta: [
      { title: "My Informations & Security — LinkMe" },
      {
        name: "description",
        content: "Edit your picture, username, bio, social links and password.",
      },
      { property: "og:title", content: "My Informations & Security — LinkMe" },
      {
        property: "og:description",
        content: "Edit your picture, username, bio, social links and password.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InformationsPage,
});

function InformationsPage() {
  const { profile, avatarUrl, refetch } = useMyProfile();
  if (!profile) return null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold">My Informations &amp; Security</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Everything about your page and your account sign-in.
        </p>
      </header>

      <EditInformationsForm
        profile={profile}
        avatarUrl={avatarUrl}
        onSaved={() => void refetch()}
      />
    </div>
  );
}
