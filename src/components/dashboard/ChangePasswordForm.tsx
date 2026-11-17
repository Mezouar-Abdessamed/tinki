import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api-client";
import { firstError, passwordSchema } from "@/lib/profile-validation";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!currentPassword) {
      setError("Enter your current password");
      return;
    }
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      setError(firstError(parsed.error));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords don't match");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await authApi.updatePassword({ password: newPassword, currentPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Your password has been changed");
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : "Couldn't change the password";
      if (message.toLowerCase().includes("current password")) {
        setError(message);
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="border-t border-border pt-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-normal"><KeyRound className="size-5 text-primary" />Change Password</h2>
          <form onSubmit={submit} className="mt-5 grid gap-4 sm:max-w-md" noValidate>
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <PasswordInput
                id="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
            <div>
              <Button type="submit" variant="outline" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
          <div className="mt-6 space-y-3 border-t border-border pt-5">
            <p className="text-sm text-muted-foreground">No current password? Set or reset it through your account email</p>
            <Button asChild variant="outline" className="h-auto min-h-9 whitespace-normal text-start"><Link to="/forgot-password"><Mail className="me-2 size-4 shrink-0" />Set or reset password by email</Link></Button>
          </div>
      </section>
    </div>
  );
}
