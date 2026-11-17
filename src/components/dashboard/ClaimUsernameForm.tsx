import { useState } from "react";
import { toast } from "sonner";

import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api-client";
import { createMyProfile, isUsernameAvailable, isUsernameTakenError } from "@/lib/profiles";
import { firstError, passwordSchema, usernameSchema } from "@/lib/profile-validation";

export function ClaimUsernameForm({
  userId: _userId,
  requirePassword,
  onDone,
}: {
  userId: string;
  requirePassword: boolean;
  onDone: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }
    setError(null);

    if (requirePassword) {
      const parsedPassword = passwordSchema.safeParse(password);
      if (!parsedPassword.success) {
        setPasswordError(firstError(parsedPassword.error));
        return;
      }
      if (password !== confirmPassword) {
        setPasswordError("Passwords don't match");
        return;
      }
      setPasswordError(null);
    }

    setSaving(true);
    try {
      if (!(await isUsernameAvailable(parsed.data))) {
        setError("That username is already taken");
        return;
      }

      await createMyProfile(parsed.data);

      if (requirePassword) {
        try {
          await authApi.updatePassword({ password });
        } catch (passwordSaveError) {
          const message =
            passwordSaveError instanceof Error ? passwordSaveError.message.toLowerCase() : "";
          await authApi.getSession().catch(() => null);
          toast.warning(
            message.includes("current password")
              ? "Your page is ready! Your account already has an email password."
              : "Your page is ready! You can set your email password in Account & Security.",
          );
          onDone();
          return;
        }
      }

      toast.success("Your page is ready!");
      onDone();
    } catch (insertError) {
      if (isUsernameTakenError(insertError)) {
        setError("That username is already taken");
        return;
      }
      toast.error(insertError instanceof Error ? insertError.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel mx-auto max-w-md p-7">
      <h1 className="font-display text-2xl font-semibold">Pick your username</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {requirePassword
          ? "This becomes your public link. Also set a password so you can sign in with your email too"
          : "This becomes your public link, so choose carefully"}
      </p>
      <form onSubmit={save} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="claim-username">Username</Label>
          <Input
            id="claim-username"
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            placeholder="yourname"
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        {requirePassword ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="claim-password">Password</Label>
              <PasswordInput
                id="claim-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="claim-password-confirm">Confirm password</Label>
              <PasswordInput
                id="claim-password-confirm"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat your password"
                autoComplete="new-password"
              />
              {passwordError ? <p className="text-xs text-destructive">{passwordError}</p> : null}
            </div>
          </>
        ) : null}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Saving…" : "Claim it"}
        </Button>
      </form>
    </div>
  );
}
