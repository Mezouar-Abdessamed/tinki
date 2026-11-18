import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/AuthShell";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import {
  confirmFirebasePasswordReset,
  signOutFirebaseGoogle,
  verifyFirebasePasswordResetCode,
} from "@/lib/firebase-auth";
import { firstError, passwordSchema } from "@/lib/profile-validation";

type ResetPasswordSearch = {
  token?: string;
  oobCode?: string;
  mode?: string;
};

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    ...(typeof search["token"] === "string" && search["token"].length > 0
      ? { token: search["token"] }
      : {}),
    ...(typeof search["oobCode"] === "string" && search["oobCode"].length > 0
      ? { oobCode: search["oobCode"] }
      : {}),
    ...(typeof search["mode"] === "string" && search["mode"].length > 0
      ? { mode: search["mode"] }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "Choose a new password — Tinki" },
      { name: "description", content: "Set a new password for your Tinki account" },
      { property: "og:title", content: "Choose a new password — Tinki" },
      { property: "og:description", content: "Set a new password for your Tinki account" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token, oobCode } = Route.useSearch();
  const { session, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifyingOobCode, setVerifyingOobCode] = useState(Boolean(oobCode));
  const [oobCodeValid, setOobCodeValid] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setVerifyingOobCode(false);
      setOobCodeValid(false);
      return;
    }
    let active = true;
    setVerifyingOobCode(true);
    verifyFirebasePasswordResetCode(oobCode)
      .then(() => {
        if (active) setOobCodeValid(true);
      })
      .catch(() => {
        if (active) setOobCodeValid(false);
      })
      .finally(() => {
        if (active) setVerifyingOobCode(false);
      });
    return () => {
      active = false;
    };
  }, [oobCode]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      let targetEmail: string | null = null;
      if (oobCode) {
        targetEmail = await confirmFirebasePasswordReset(oobCode, password);
      } else if (token) {
        await authApi.confirmPasswordReset({ token, password });
      } else {
        await authApi.updatePassword({ password });
      }
      await Promise.allSettled([authApi.signOut(), signOutFirebaseGoogle()]);
      toast.success("Password updated. Please log in again");
      navigate({
        to: "/login",
        ...(targetEmail ? { search: { email: targetEmail } } : {}),
      });
    } catch (updateError) {
      toast.error(
        updateError instanceof Error ? updateError.message : "That reset link is no longer valid",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (oobCode && verifyingOobCode) {
    return (
      <AuthShell title="Checking reset link…" subtitle="One moment while we verify your request">
        <p className="text-center text-sm text-muted-foreground">Please wait…</p>
      </AuthShell>
    );
  }

  const invalidLink = oobCode ? !oobCodeValid : !token && !loading && !session;

  if (invalidLink) {
    return (
      <AuthShell
        title="Reset link expired"
        subtitle="This link has already been used or is more than an hour old"
        footer={
          <Link to="/forgot-password" className="text-primary hover:underline">
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">
          Request a fresh reset link and open it to set your new password
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="You'll log in again with the new one">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm new password</Label>
          <PasswordInput
            id="confirm"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Saving…" : "Save new password"}
        </Button>
      </form>
    </AuthShell>
  );
}
