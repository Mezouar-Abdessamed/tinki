import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api-client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your Tinki password" },
      { name: "description", content: "Send yourself a link to choose a new password" },
      { property: "og:title", content: "Reset your Tinki password" },
      { property: "og:description", content: "Send yourself a link to choose a new password" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const res = await authApi.requestPasswordReset(email.trim().toLowerCase());
      if (res.resetToken) setResetToken(res.resetToken);
    } catch {
      /* always show the same generic confirmation */
    } finally {
      setSent(true);
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link"
      footer={
        <Link to="/login" className="text-primary hover:underline">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <p className="rounded-md border border-border bg-secondary p-4 text-sm text-muted-foreground">
            If an account exists for that email, a password reset link is ready. The link works once
            and expires after an hour
          </p>
          {resetToken ? (
            <Button asChild className="w-full">
              <Link to="/reset-password" search={{ token: resetToken }}>
                Continue to reset password
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
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
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
