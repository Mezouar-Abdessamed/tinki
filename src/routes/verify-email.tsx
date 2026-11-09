import { createFileRoute, redirect } from "@tanstack/react-router";

// Preserve old bookmarks without sending users through signup code entry.
export const Route = createFileRoute("/verify-email")({
  beforeLoad: () => {
    throw redirect({ to: "/login", replace: true });
  },
  head: () => ({
    meta: [
      { title: "Continue to your Tinki account" },
      { name: "description", content: "Continue to log in and manage your Tinki page" },
      { property: "og:title", content: "Continue to your Tinki account" },
      { property: "og:description", content: "Continue to log in and manage your Tinki page" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
