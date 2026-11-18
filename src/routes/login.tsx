import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/AuthShell";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import {
  completeGoogleRedirectIfPending,
  signInWithEmailPasswordFirebase,
  signInWithGooglePopup,
  warmUpFirebaseAuth,
} from "@/lib/firebase-auth";
import { EMAIL_SIGNUP_ENABLED, registrationEntryPath } from "@/lib/signup-config";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { email?: string } => ({
    ...(typeof search["email"] === "string" && search["email"].trim()
      ? { email: search["email"].trim() }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "Log in to Tinki" },
      { name: "description", content: "Log in to edit your social profile page and QR code" },
      { property: "og:title", content: "Log in to Tinki" },
      {
        property: "og:description",
        content: "Log in to edit your social profile page and QR code",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { email: prefilledEmail } = Route.useSearch();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState(prefilledEmail ?? "");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [needsConfirmationEmail, setNeedsConfirmationEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && session) navigate({ to: "/dashboard" });
  }, [authLoading, session, navigate]);

  useEffect(() => {
    let active = true;
    void warmUpFirebaseAuth();
    completeGoogleRedirectIfPending()
      .then((redirectSession) => {
        if (!active || !redirectSession) return;
        toast.success("Signed in with Google");
        navigate({ to: "/dashboard" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        toast.error(
          error instanceof Error ? error.message : "Google sign-in didn't work. Please try again",
        );
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setNeedsConfirmationEmail(null);
    const cleanEmail = email.trim().toLowerCase();
    try {
      await signInWithEmailPasswordFirebase(cleanEmail, password);
      navigate({ to: "/dashboard" });
    } catch (error) {
      if (error instanceof ApiError && error.code === "email_not_verified") {
        setNeedsConfirmationEmail(cleanEmail);
        toast.error(error.message);
      } else {
        toast.error("Those details don't match an account");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      await signInWithGooglePopup();
      toast.success("Signed in with Google");
      navigate({ to: "/dashboard" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Google sign-in didn't work. Please try again";
      if (message.toLowerCase().includes("cancelled")) return;
      toast.error(message);
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to manage your page"
      {...(EMAIL_SIGNUP_ENABLED
        ? {
            footer: (
              <>
                Don&apos;t have a page yet?{" "}
                <Link to={registrationEntryPath()} className="text-primary hover:underline">
                  Create your page
                </Link>
              </>
            ),
          }
        : {})}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting || googleLoading}>
          {submitting ? "Logging in…" : "Log in"}
        </Button>

        {needsConfirmationEmail ? (
          <p className="text-xs text-muted-foreground">
            Still waiting on the email?{" "}
            <Link
              to="/verify-email"
              search={{ email: needsConfirmationEmail }}
              className="text-primary hover:underline"
            >
              Open confirmation status
            </Link>
          </p>
        ) : null}
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <GoogleSignInButton
        loading={googleLoading}
        disabled={submitting}
        onClick={() => void handleGoogle()}
      />
    </AuthShell>
  );
}
