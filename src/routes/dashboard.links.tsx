import { createFileRoute } from "@tanstack/react-router";

import { MyLinksManager } from "@/components/dashboard/MyLinksManager";
import { useMyProfile } from "@/lib/use-profile";

export const Route = createFileRoute("/dashboard/links")({
  head: () => ({
    meta: [
      { title: "My Links — Tinki" },
      { name: "description", content: "Add, edit and remove the social links on your page" },
      { property: "og:title", content: "My Links — Tinki" },
      {
        property: "og:description",
        content: "Add, edit and remove the social links on your page",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyLinksPage,
});

function MyLinksPage() {
  const { profile, refetch } = useMyProfile();
  if (!profile) return null;

  return <MyLinksManager profile={profile} onProfileSaved={() => void refetch()} />;
}
