import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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

/** Reads an error the provider or the confirmation link may have sent back. */
function readCallbackError(): string | null {
  if (typeof window === "undefined") return null;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const code = query.get("error_code") ?? hash.get("error_code");
  const description = query.get("error_description") ?? hash.get("error_description");
  if (!code && !description) return null;
  if (code === "otp_expired" || description?.toLowerCase().includes("expired")) {
    return "That link has expired. Please request a new one";
  }
  return description ? description.replace(/\+/g, " ") : "That link is no longer valid";
}

function AuthCallbackPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setLinkError(readCallbackError());
  }, []);

  useEffect(() => {
    if (linkError) return;
    if (!loading && session) navigate({ to: "/dashboard", replace: true });
  }, [linkError, loading, session, navigate]);

  useEffect(() => {
    if (linkError) return;
    const timer = window.setTimeout(() => setTimedOut(true), 8000);
    return () => window.clearTimeout(timer);
  }, [linkError]);

  if (linkError || (timedOut && !session)) {
    return (
      <AuthShell
        title="We couldn't finish signing you in"
        subtitle={linkError ?? "The sign-in didn't complete. Please try again"}
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
