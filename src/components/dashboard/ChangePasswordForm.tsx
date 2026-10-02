import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/app-supabase";
import { useAuth } from "@/lib/auth";
import { firstError, passwordSchema } from "@/lib/socials";

export function ChangePasswordForm() {
  const { user } = useAuth();

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
      // Re-authenticate to prove the current password is correct.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email ?? "",
        password: currentPassword,
      });
      if (signInError) {
        setError("Your current password is incorrect");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        current_password: currentPassword,
      } as Parameters<typeof supabase.auth.updateUser>[0]);
      if (updateError) throw updateError;
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Your password has been changed.");
    } catch (updateError) {
      toast.error(
        updateError instanceof Error ? updateError.message : "Couldn't change the password",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="panel p-6">
          <h2 className="font-display text-lg font-semibold">Change Password</h2>
          <form onSubmit={submit} className="mt-5 grid gap-4 sm:max-w-md" noValidate>
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <div>
              <Button type="submit" variant="outline" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
      </section>
    </div>
  );
}
