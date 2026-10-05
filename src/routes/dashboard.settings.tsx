import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Palette, QrCode, ShieldCheck, UserCog } from "lucide-react";

import { ChangePasswordForm } from "@/components/dashboard/ChangePasswordForm";
import { QrButtonVisibility } from "@/components/dashboard/QrButtonVisibility";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { profileUrl } from "@/lib/profiles";
import { useMyProfile } from "@/lib/use-profile";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Tinki" },
      { name: "description", content: "Manage your Tinki account, page style and QR code in one place." },
      { property: "og:title", content: "Settings — Tinki" },
      { property: "og:description", content: "Manage your Tinki account, page style and QR code in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const SECTIONS = [
  { to: "/dashboard/informations", label: "My Informations & Security", desc: "Picture, username, bio and social links.", icon: ShieldCheck },
  { to: "/dashboard/customize", label: "Customize profile", desc: "Colors, fonts and backgrounds of your public page.", icon: Palette },
  { to: "/dashboard/customize-qr-code", label: "Costumize QR Code", desc: "Colors and shapes of your QR code.", icon: QrCode },
  { to: "/dashboard/account", label: "Account & Deletion", desc: "Manage or permanently delete your account.", icon: UserCog },
] as const;

function SettingsPage() {
  const { user } = useAuth();
  const { profile, refetch } = useMyProfile();
  const { lang, setLang } = useLanguage();
  if (!profile) return null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Everything about your account in one place.</p>
      </header>

      <section className="panel space-y-3 p-6 text-sm">
        <h2 className="font-display text-lg font-semibold">Account</h2>
        <div className="flex justify-between gap-4"><span className="text-muted-foreground">Username</span><span className="truncate">@{profile.username}</span></div>
        <div className="flex justify-between gap-4"><span className="text-muted-foreground">Email</span><span className="truncate">{user?.email}</span></div>
        <div className="flex justify-between gap-4"><span className="text-muted-foreground">Public link</span><span className="truncate">{profileUrl(profile.username)}</span></div>
      </section>

      <section className="panel space-y-4 p-6">
        <div>
          <h2 className="font-display text-lg font-semibold">Language</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose the language of the whole site.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary p-1 sm:max-w-md sm:grid-cols-4">
          {([["en", "English"], ["fr", "Français"], ["es", "Español"], ["de", "Deutsch"], ["ar", "العربية"]] as const).map(([code, label]) => (
            <Button
              key={code}
              type="button"
              variant={lang === code ? "default" : "ghost"}
              onClick={() => setLang(code)}
              aria-pressed={lang === code}
              className="h-9 px-3 text-sm"
            >
              {label}
            </Button>
          ))}
        </div>
      </section>

      <ChangePasswordForm />

      <QrButtonVisibility
        profileId={profile.id}
        initial={profile.show_qr_button !== false}
        onSaved={() => void refetch()}
      />

      <section className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to} className="panel flex items-center gap-4 p-5 transition-colors hover:bg-secondary/60">
            <s.icon className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 rtl:rotate-180 text-muted-foreground" />
          </Link>
        ))}
      </section>
    </div>
  );
}
