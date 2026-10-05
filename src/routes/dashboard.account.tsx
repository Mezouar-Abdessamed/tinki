import { createFileRoute } from "@tanstack/react-router";

import { DeleteAccountSection } from "@/components/dashboard/DeleteAccountSection";
import { ProfilePreview } from "@/components/dashboard/ProfilePreview";
import { useMyProfile } from "@/lib/use-profile";

export const Route = createFileRoute("/dashboard/account")({
  head: () => ({
    meta: [
      { title: "Account & Deletion — Tinki" },
      { name: "description", content: "Review your public page and delete your account." },
      { property: "og:title", content: "Account & Deletion — Tinki" },
      {
        property: "og:description",
        content: "Review your public page and delete your account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { profile, avatarUrl } = useMyProfile();
  if (!profile) return null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold">Account &amp; Deletion</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This is what disappears if you delete your account.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">Live Preview</h2>
        <ProfilePreview profile={profile} avatarUrl={avatarUrl} />
      </section>

      <DeleteAccountSection username={profile.username} />
    </div>
  );
}
