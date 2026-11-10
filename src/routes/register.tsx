import { Link, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
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
import { isUsernameAvailable } from "@/lib/profiles";
import { signUpDirectly } from "@/lib/signup";
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

  useEffect(() => {
    if (!authLoading && session) navigate({ to: "/dashboard" });
  }, [authLoading, session, navigate]);

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
    if (Object.keys(nextErrors).length > 0 || !parsedUsername.success || !parsedEmail.success) return;

    setSubmitting(true);
    try {
      const cleanUsername = parsedUsername.data;
      const cleanEmail = parsedEmail.data;

      const available = await isUsernameAvailable(cleanUsername);
      if (!available) {
        setErrors({ username: "That username is already taken" });
        return;
      }

      await signUpDirectly(supabase.auth, {
        email: cleanEmail,
        password,
        username: cleanUsername,
        origin: window.location.origin,
      });
      // The dashboard's shared profile query creates the chosen page once.
      toast.success("Welcome to Tinki!");
      navigate({ to: "/dashboard" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      if (message.toLowerCase().includes("already registered")) {
        setErrors({ email: "That email already has an account. Try logging in instead" });
      } else {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/callback`,
    });
    if (result.error) {
      toast.error("Google sign-in didn't work. Please try again");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
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

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Creating your page…" : "Create my page"}
        </Button>
      </form>

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
