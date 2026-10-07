import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/app-supabase";
import { emailSchema } from "@/lib/socials";
import { useLanguage } from "@/lib/i18n";

const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search["email"] === "string" ? search["email"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Verify your email — Tinki" },
      {
        name: "description",
        content: "Enter the 6-digit code we emailed you to activate your Tinki page",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Verify your email — Tinki" },
      {
        property: "og:description",
        content: "Enter the 6-digit code we emailed you to activate your Tinki page",
      },
    ],
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { email: rawEmail } = Route.useSearch();
  const email = useMemo(() => rawEmail.trim().toLowerCase(), [rawEmail]);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const emailValid = emailSchema.safeParse(email).success;

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (attempts >= MAX_ATTEMPTS) {
      setError("Too many attempts. Ask for a new code and try again");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from the email");
      return;
    }

    setVerifying(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "signup",
      });

      if (verifyError || !data.session) {
        setAttempts((value) => value + 1);
        const message = (verifyError?.message ?? "").toLowerCase();
        if (message.includes("expired")) {
          setError("That code has expired. Ask for a new one below");
        } else if (message.includes("rate") || message.includes("too many")) {
          setError("Too many tries. Please wait a moment and try again");
        } else {
          setError("That code isn't right. Check the email and try again");
        }
        return;
      }

      setVerified(true);
      toast.success("Email verified — welcome!");
      setTimeout(() => navigate({ to: "/dashboard", replace: true }), 900);
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || !emailValid) return;
    setResending(true);
    setError(null);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (resendError) {
        setError(
          resendError.message.toLowerCase().includes("rate")
            ? "Please wait a minute before asking for another code"
            : "We couldn't send another code right now. Please try again shortly",
        );
        return;
      }
      setAttempts(0);
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success("New code sent");
    } finally {
      setResending(false);
    }
  }

  if (!emailValid) {
    return (
      <AuthShell
        title="Verify your email"
        subtitle="We need to know which address to check"
        footer={
          <Link to="/register" className="text-primary hover:underline">
            Back to sign up
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          Start the sign-up again so we can send your code
        </p>
      </AuthShell>
    );
  }

  if (verified) {
    return (
      <AuthShell title="You're verified" subtitle="Taking you to your dashboard…">
        <p className="rounded-md border border-border bg-secondary p-4 text-sm text-muted-foreground">
          Your email is confirmed and your account is active
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Verify your email"
       subtitle={t(`Enter the 6-digit code we sent to ${email}.`)}
      footer={
        <Link to="/login" className="text-primary hover:underline">
          Back to log in
        </Link>
      }
    >
      <form onSubmit={handleVerify} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="text-center text-lg tracking-[0.5em]"
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <Button type="submit" className="w-full" disabled={verifying}>
          {verifying ? "Verifying…" : "Verify"}
        </Button>
      </form>

      <div className="mt-4 space-y-3 rounded-md border border-border bg-secondary p-4">
        <p className="text-xs text-muted-foreground">
          Nothing in your inbox? Check spam, then ask for a new code
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleResend}
          disabled={resending || cooldown > 0}
        >
          {cooldown > 0
             ? t(`Resend code in ${cooldown}s`)
            : resending
              ? "Sending…"
              : "Resend code"}
        </Button>
      </div>
    </AuthShell>
  );
}
