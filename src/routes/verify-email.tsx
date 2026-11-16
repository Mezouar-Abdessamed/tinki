import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, MailCheck, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  checkAndCompleteEmailVerification,
  readPendingVerificationState,
  resendSignupVerificationEmail,
} from "@/lib/firebase-auth";
import { EMAIL_SIGNUP_ENABLED, registrationEntryPath } from "@/lib/signup-availability";

type VerifyEmailSearch = {
  email?: string;
  username?: string;
  mode?: string;
  oobCode?: string;
};

export const Route = createFileRoute("/verify-email")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): VerifyEmailSearch => ({
    ...(typeof search["email"] === "string" && search["email"].trim()
      ? { email: search["email"].trim() }
      : {}),
    ...(typeof search["username"] === "string" && search["username"].trim()
      ? { username: search["username"].trim() }
      : {}),
    ...(typeof search["mode"] === "string" && search["mode"].trim()
      ? { mode: search["mode"].trim() }
      : {}),
    ...(typeof search["oobCode"] === "string" && search["oobCode"].trim()
      ? { oobCode: search["oobCode"].trim() }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "Confirm your email — Tinki" },
      { name: "description", content: "Confirm your email address to continue to your Tinki profile" },
      { property: "og:title", content: "Confirm your email — Tinki" },
      {
        property: "og:description",
        content: "Confirm your email address to continue to your Tinki profile",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { session, loading: authLoading } = useAuth();
  const stored = readPendingVerificationState();

  const pendingEmail = search.email ?? stored.email;
  const pendingUsername = search.username ?? stored.username;

  const [checking, setChecking] = useState(true);
  const [manualChecking, setManualChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [verifiedNeedsLogin, setVerifiedNeedsLogin] = useState(false);
  const [hasFirebaseUser, setHasFirebaseUser] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resolvedEmail, setResolvedEmail] = useState<string | undefined>(pendingEmail);

  useEffect(() => {
    if (!authLoading && session) {
      navigate({ to: "/dashboard/profile", replace: true });
    }
  }, [authLoading, session, navigate]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  const runVerificationCheck = useCallback(
    async (opts?: { silent?: boolean; oobCode?: string }) => {
      if (!opts?.silent) setManualChecking(true);
      setErrorMessage(null);
      try {
        const checkParams: { oobCode?: string; username?: string } = {};
        if (opts?.oobCode) checkParams.oobCode = opts.oobCode;
        if (pendingUsername) checkParams.username = pendingUsername;
        const result = await checkAndCompleteEmailVerification(checkParams);

        if (result.status === "confirmed") {
          toast.success("Email confirmed! Taking you to your profile…");
          navigate({ to: "/dashboard/profile", replace: true });
          return true;
        }
        if (result.status === "verified_needs_login") {
          setVerifiedNeedsLogin(true);
          setHasFirebaseUser(false);
          return true;
        }
        if (result.status === "no_user") {
          setHasFirebaseUser(false);
          if (!opts?.silent && !pendingEmail) {
            toast.info("Log in with your email and password to continue");
          }
          return false;
        }
        if (result.email) {
          setResolvedEmail(result.email);
        }
        setHasFirebaseUser(true);
        if (!opts?.silent) {
          toast.info("Not confirmed yet — click the link in your email first");
        }
        return false;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unable to verify confirmation status";
        setErrorMessage(message);
        if (!opts?.silent) {
          toast.error(message);
        }
        return false;
      } finally {
        setChecking(false);
        setManualChecking(false);
      }
    },
    [navigate, pendingEmail, pendingUsername],
  );

  useEffect(() => {
    const oobCode =
      search.mode === "verifyEmail" || !search.mode ? search.oobCode : undefined;
    void runVerificationCheck({
      silent: true,
      ...(oobCode ? { oobCode } : {}),
    });
  }, [runVerificationCheck, search.mode, search.oobCode]);

  useEffect(() => {
    if (verifiedNeedsLogin || !hasFirebaseUser) return;

    const intervalId = window.setInterval(() => {
      void runVerificationCheck({ silent: true });
    }, 3000);

    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        void runVerificationCheck({ silent: true });
      }
    };

    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [hasFirebaseUser, runVerificationCheck, verifiedNeedsLogin]);

  async function handleResend() {
    setResending(true);
    setErrorMessage(null);
    try {
      const sentTo = await resendSignupVerificationEmail(pendingUsername);
      setResolvedEmail(sentTo);
      setCooldownSeconds(30);
      toast.success(`Confirmation email resent to ${sentTo}`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not resend confirmation email";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setResending(false);
    }
  }

  if (checking) {
    return (
      <AuthShell
        title="Confirming your email…"
        subtitle="One moment while we check your confirmation status"
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Please wait…</p>
        </div>
      </AuthShell>
    );
  }

  if (verifiedNeedsLogin) {
    return (
      <AuthShell
        title="Email confirmed"
        subtitle="Your email has been verified. Log in to continue to your profile"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3.5 text-sm">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-foreground">
              Your email address is verified. Log in below to open your profile.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link to="/login" search={resolvedEmail ? { email: resolvedEmail } : {}}>
              Log in to open your profile
            </Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (!hasFirebaseUser && !resolvedEmail) {
    return (
      <AuthShell
        title="Confirm your email"
        subtitle="Create a page or log in to continue to your profile"
        footer={
          <Link to="/" className="text-primary hover:underline">
            Back to home
          </Link>
        }
      >
        <div className="space-y-3">
          {EMAIL_SIGNUP_ENABLED ? (
            <Button asChild className="w-full">
              <Link to={registrationEntryPath()}>Create your page</Link>
            </Button>
          ) : null}
          <Button asChild variant={EMAIL_SIGNUP_ENABLED ? "outline" : "default"} className="w-full">
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Check your email"
      subtitle={
        resolvedEmail
          ? `We sent a confirmation link to ${resolvedEmail}`
          : "Click the confirmation link in your inbox to continue"
      }
      {...(EMAIL_SIGNUP_ENABLED
        ? {
            footer: (
              <>
                Wrong email address?{" "}
                <Link to={registrationEntryPath()} className="text-primary hover:underline">
                  Sign up again
                </Link>
              </>
            ),
          }
        : {})}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-background/60 p-4">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">
              Open the email and click the confirmation link
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              As soon as you confirm your email{pendingUsername ? ` for /${pendingUsername}` : ""},
              we&apos;ll continue automatically to your profile. Check your spam folder if you
              don&apos;t see it within a minute.
            </p>
          </div>
        </div>

        {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}

        {hasFirebaseUser ? (
          <>
            <Button
              type="button"
              className="w-full"
              disabled={manualChecking}
              onClick={() => void runVerificationCheck({ silent: false })}
            >
              {manualChecking ? "Checking confirmation…" : "I've confirmed my email — Continue"}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={resending || cooldownSeconds > 0}
              onClick={() => void handleResend()}
            >
              {resending
                ? "Sending email…"
                : cooldownSeconds > 0
                  ? `Resend email in ${cooldownSeconds}s`
                  : "Resend confirmation email"}
            </Button>
          </>
        ) : (
          <Button asChild className="w-full">
            <Link to="/login" search={resolvedEmail ? { email: resolvedEmail } : {}}>
              Already confirmed? Log in to your profile
            </Link>
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
