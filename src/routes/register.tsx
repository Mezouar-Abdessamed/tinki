import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/AuthShell";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import {
  completeGoogleRedirectIfPending,
  signInWithGooglePopup,
  warmUpFirebaseAuth,
} from "@/lib/firebase-auth";
import { signUpWithEmailConfirmation } from "@/lib/signup";
import { EMAIL_SIGNUP_ENABLED, registrationEntryPath } from "@/lib/signup-availability";
import { emailSchema, firstError, passwordSchema, usernameSchema } from "@/lib/socials";

export const Route = createFileRoute("/register")({
  beforeLoad: () => {
    if (!EMAIL_SIGNUP_ENABLED) throw redirect({ to: registrationEntryPath(), replace: true });
  },
  head: () => ({
    meta: [
      { title: "Create your Tinki page" },
      {
        name: "description",
        content: "Sign up free, pick your username, and start sharing one link to all your socials",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Create your Tinki page" },
      {
        property: "og:description",
        content: "Sign up free, pick your username, and start sharing one link to all your socials",
      },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<
    Partial<Record<"username" | "email" | "password" | "confirm", string>>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
    if (!EMAIL_SIGNUP_ENABLED) return;
    type FieldKey = "username" | "email" | "password" | "confirm";
    const nextErrors: Partial<Record<FieldKey, string>> = {};

    const parsedUsername = usernameSchema.safeParse(username);
    if (!parsedUsername.success) nextErrors.username = firstError(parsedUsername.error);

    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) nextErrors.email = firstError(parsedEmail.error);

    const parsedPassword = passwordSchema.safeParse(password);
    if (!parsedPassword.success) nextErrors.password = firstError(parsedPassword.error);

    if (password !== confirm) nextErrors.confirm = "Passwords don't match";

    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0 || !parsedUsername.success || !parsedEmail.success)
      return;

    setSubmitting(true);
    try {
      const cleanUsername = parsedUsername.data;
      const cleanEmail = parsedEmail.data;

      const result = await signUpWithEmailConfirmation({
        email: cleanEmail,
        password,
        username: cleanUsername,
        origin: window.location.origin,
      });
      if (result.status === "verified") {
        toast.success("Welcome to Tinki!");
        navigate({ to: "/dashboard/profile" });
        return;
      }
      toast.success("Confirmation email sent! Check your inbox");
      navigate({
        to: "/verify-email",
        search: { email: cleanEmail, username: cleanUsername },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      const lower = message.toLowerCase();
      if (lower.includes("already registered") || lower.includes("already has an account")) {
        setErrors({ email: "That email already has an account. Try logging in instead" });
      } else if (lower.includes("already taken")) {
        setErrors({ username: "That username is already taken" });
      } else {
        setSubmitError(message);
        toast.error(message);
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
      const message = error instanceof Error ? error.message : "Google sign-in didn't work. Please try again";
      if (message.toLowerCase().includes("cancelled")) return;
      toast.error(message);
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your page"
      subtitle="Pick a username — it becomes your public link"
      footer={
        <>
          Already have a page?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3">
            <span className="text-sm text-muted-foreground">/</span>
            <Input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              placeholder="yourname"
              autoComplete="username"
              className="border-0 bg-transparent px-0 focus-visible:ring-0"
            />
          </div>
          {errors.username ? <p className="text-xs text-destructive">{errors.username}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
          {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
          {errors.password ? <p className="text-xs text-destructive">{errors.password}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <PasswordInput
            id="confirm"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
          {errors.confirm ? <p className="text-xs text-destructive">{errors.confirm}</p> : null}
        </div>

        {submitError ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
          >
            {submitError}
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={submitting || googleLoading}>
          {submitting ? "Sending confirmation email…" : "Create my page"}
        </Button>
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
