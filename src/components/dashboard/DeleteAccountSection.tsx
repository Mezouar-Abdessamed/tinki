import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteMyAccount } from "@/lib/account.functions";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";

export function DeleteAccountSection({ username }: { username: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const hasPassword = user?.identities?.some((identity) => identity.provider === "email") ?? true;

  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function removeAccount() {
    setDeleting(true);
    try {
      await deleteMyAccount({
        data: {
          username: confirmName.trim().toLowerCase(),
          ...(hasPassword ? { password } : {}),
        },
      });
      toast.success("Your account has been deleted");
      navigate({ to: "/" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the account");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="panel border-destructive/40 p-6">
      <div className="flex min-w-0 items-center gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <h2 className="truncate font-display text-lg font-semibold">Delete Account</h2>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Deleting your account is permanent. Your page at /{username}, your links and your picture
        are removed for good and cannot be recovered
      </p>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="mt-5">
            Delete Account
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This can't be undone. Your page at /{username} will stop working immediately
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            {hasPassword ? (
              <Input
                type="password"
                placeholder="Your current password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            ) : null}
            <Input
               placeholder={t(`Type "${username}" to confirm`)}
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my account</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || confirmName.trim().toLowerCase() !== username}
              onClick={(event) => {
                event.preventDefault();
                void removeAccount();
              }}
            >
              {deleting ? "Deleting…" : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
