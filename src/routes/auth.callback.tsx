import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — Tinki" },
      { name: "description", content: "Finishing your sign-in and opening your dashboard" },
      { property: "og:title", content: "Signing you in — Tinki" },
      {
        property: "og:description",
        content: "Finishing your sign-in and opening your dashboard",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && session) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, session, navigate]);

  if (!loading && !session) {
    return (
      <AuthShell
        title="Sign in to continue"
        subtitle="Use your email and password or sign in with Google"
        footer={
          <Link to="/" className="text-primary hover:underline">
            Back to home
          </Link>
        }
      >
        <Button asChild className="w-full">
          <Link to="/login">Go to log in</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Signing you in…" subtitle="One moment, opening your dashboard">
      <p className="text-center text-sm text-muted-foreground">Please wait…</p>
    </AuthShell>
  );
}
