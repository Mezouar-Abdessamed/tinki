import { Mail, ShieldCheck } from "lucide-react";
import { ChangePasswordForm } from "@/components/dashboard/ChangePasswordForm";
import { useAuth } from "@/lib/auth";

export function AccountSecurity() {
  const { user } = useAuth();
  const providers = [...new Set(user?.identities?.map((identity) => identity.provider) ?? [])];
  const providerNames: Record<string, string> = { google: "Google", email: "Email and password" };
  return (
    <div className="space-y-6">
      <section aria-labelledby="account-security-title">
        <h2
          id="account-security-title"
          className="flex items-center gap-2 font-display text-lg font-semibold tracking-normal"
        >
          <ShieldCheck className="size-5 text-primary" />
          Account &amp; Security
        </h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="size-4" />
              Email
            </dt>
            <dd className="mt-2 break-all text-sm">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Connected sign-in methods</dt>
            <dd className="mt-2 flex flex-wrap gap-2 text-sm">
              {providers.map((provider) => (
                <span key={provider} className="capitalize">
                  {providerNames[provider] ?? provider}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </section>
      <ChangePasswordForm />
    </div>
  );
}
