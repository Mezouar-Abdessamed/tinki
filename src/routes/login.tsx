import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthShell } from "@/components/AuthShell";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/lib/app-supabase";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in to LinkMe" },
      { name: "description", content: "Log in to edit your social profile page and QR code." },
      { property: "og:title", content: "Log in to LinkMe" },
      {
        property: "og:description",
        content: "Log in to edit your social profile page and QR code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  

  useEffect(() => {
    if (!authLoading && session) navigate({ to: "/dashboard" });
  }, [authLoading, session, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setNeedsConfirmation(false);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes("not confirmed") || message.includes("email_not_confirmed")) {
          setNeedsConfirmation(true);
          toast.error("Please verify your email first — enter the code we sent you.");
          navigate({ to: "/verify-email", search: { email: email.trim().toLowerCase() } });
          return;
        }
        toast.error("Those details don't match an account.");
        return;
      }
      navigate({ to: "/dashboard" });
    } finally {
      setSubmitting(false);
    }
  }


  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/callback`,
    });
    if (result.error) {
      toast.error("Google sign-in didn't work. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to manage your page."
      footer={
        <>
          No page yet?{" "}
          <Link to="/register" className="text-primary hover:underline">
            Create one
          </Link>
        </>
      }
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
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </Button>
      </form>

      {needsConfirmation ? (
        <div className="mt-4 space-y-3 rounded-md border border-border bg-secondary p-4">
          <p className="text-sm text-muted-foreground">
            Your account isn't verified yet. Enter the 6-digit code we emailed you.
          </p>
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link to="/verify-email" search={{ email: email.trim().toLowerCase() }}>
              Enter verification code
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button variant="outline" className="w-full" onClick={handleGoogle}>
        Continue with Google
      </Button>
    </AuthShell>
  );
}
