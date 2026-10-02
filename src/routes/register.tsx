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
import { isUsernameAvailable, isUsernameTakenError } from "@/lib/profiles";
import { emailSchema, firstError, passwordSchema, usernameSchema } from "@/lib/socials";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create your LinkMe page" },
      {
        name: "description",
        content: "Sign up free, pick your username, and start sharing one link to all your socials.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Create your LinkMe page" },
      {
        property: "og:description",
        content: "Sign up free, pick your username, and start sharing one link to all your socials.",
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
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const cleanUsername = parsedUsername.data!;
      const cleanEmail = parsedEmail.data!;

      const available = await isUsernameAvailable(cleanUsername);
      if (!available) {
        setErrors({ username: "That username is already taken" });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          // The username is kept with the account until the email is confirmed,
          // then the page is created on first arrival at the dashboard.
          data: { username: cleanUsername },
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes("already registered")) {
          setErrors({ email: "That email already has an account. Try logging in instead." });
          return;
        }
        toast.error(error.message);
        return;
      }

      // Supabase returns a user with no identities when the email already exists,
      // so we show the same confirmation message either way.
      if (!data.session) {
        navigate({ to: "/verify-email", search: { email: cleanEmail } });
        return;
      }

      // Only happens if confirmation is switched off: create the page right away.
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({ id: data.user!.id, username: cleanUsername });
      if (profileError) {
        if (isUsernameTakenError(profileError)) {
          setErrors({ username: "That username is already taken" });
          return;
        }
        throw profileError;
      }

      toast.success("Your page is ready!");
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
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
      title="Create your page"
      subtitle="Pick a username — it becomes your public link."
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
