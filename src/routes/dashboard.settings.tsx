import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Languages,
  Palette,
  QrCode,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { QrButtonVisibility } from "@/components/dashboard/QrButtonVisibility";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { profileUrl } from "@/lib/profiles";
import { useMyProfile } from "@/hooks/use-my-profile";
import { SUPPORTED_LANGUAGES, useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Tinki" },
      {
        name: "description",
        content: "Manage your Tinki language, public page preferences and account settings",
      },
      { property: "og:title", content: "Settings — Tinki" },
      {
        property: "og:description",
        content: "Manage your Tinki language, public page preferences and account settings",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const SECTIONS = [
  {
    to: "/dashboard/customize",
    label: "Customize profile",
    desc: "Colors, fonts and backgrounds of your public page",
    icon: Palette,
  },
  {
    to: "/dashboard/customize-qr-code",
    label: "Customize QR Code",
    desc: "Colors and shapes of your QR code",
    icon: QrCode,
  },
] as const;

function SettingsPage() {
  const { user } = useAuth();
  const { profile, avatarUrl, refetch } = useMyProfile();
  const { lang, setLang, t } = useLanguage();
  const [copied, setCopied] = useState(false);
  if (!profile) return null;
  const url = profileUrl(profile.username);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("Link copied!"));
    } catch {
      toast.error(t("Couldn't copy the link"));
    }
  }

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-4xl">
        <header>
          <h1 className="font-display text-3xl font-semibold tracking-normal">Settings</h1>
        </header>

        <section
          aria-labelledby="settings-account"
          className="grid gap-5 border-b border-border py-8 sm:grid-cols-[160px_minmax(0,1fr)] lg:gap-10"
        >
          <h2
            id="settings-account"
            className="flex items-center gap-2 self-start font-display text-base font-semibold tracking-normal"
          >
            <UserRound className="size-4 text-primary" />
            Account overview
          </h2>
          <div className="min-w-0 space-y-5">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={profile.display_name || profile.username}
                  className="size-11 shrink-0 rounded-full object-cover"
                />
              ) : (
                <UserRound className="size-11 shrink-0 rounded-full bg-secondary p-2.5 text-primary" />
              )}
              <dl className="min-w-0 text-sm">
                <dt className="text-xs text-muted-foreground">Username</dt>
                <dd className="mt-1 break-all font-medium" dir="ltr">
                  @{profile.username}
                </dd>
              </dl>
            </div>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="mt-1 break-all" dir="ltr">
                  {user?.email}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Public link</dt>
                <dd className="mt-2 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
                  <span className="min-w-0 flex-1 break-all text-sm" dir="ltr">
                    {url}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-9 shrink-0"
                        onClick={() => void copyLink()}
                        aria-label={t(copied ? "Copied" : "Copy Link")}
                      >
                        {copied ? <Check className="text-primary" /> : <Copy />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t(copied ? "Copied" : "Copy Link")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button asChild size="icon" variant="ghost" className="size-9 shrink-0">
                        <Link
                          to="/$username"
                          params={{ username: profile.username }}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t("Open page")}
                        >
                          <ExternalLink />
                        </Link>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open page</TooltipContent>
                  </Tooltip>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section
          aria-labelledby="settings-language"
          className="grid gap-5 border-b border-border py-8 sm:grid-cols-[160px_minmax(0,1fr)] lg:gap-10"
        >
          <h2
            id="settings-language"
            className="flex items-center gap-2 self-start font-display text-base font-semibold tracking-normal"
          >
            <Languages className="size-4 text-primary" />
            Language
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {SUPPORTED_LANGUAGES.map(({ code, label }) => (
              <Button
                key={code}
                type="button"
                variant={lang === code ? "default" : "ghost"}
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
                className="h-auto min-h-11 min-w-0 gap-1.5 whitespace-normal rounded-md border border-border px-2 py-2 text-sm"
              >
                <span className="size-4 shrink-0">
                  {lang === code ? <Check className="size-4" aria-hidden="true" /> : null}
                </span>
                <span lang={code}>{label}</span>
              </Button>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="settings-public-page"
          className="grid gap-5 border-b border-border py-8 sm:grid-cols-[160px_minmax(0,1fr)] lg:gap-10"
        >
          <h2
            id="settings-public-page"
            className="flex items-center gap-2 self-start font-display text-base font-semibold tracking-normal"
          >
            <QrCode className="size-4 text-primary" />
            Public page
          </h2>
          <div className="min-w-0 divide-y divide-border">
            <QrButtonVisibility
              profileId={profile.id}
              initial={profile.show_qr_button !== false}
              onSaved={() => void refetch()}
            />
            {SECTIONS.map((s) => (
              <Button
                key={s.to}
                asChild
                variant="ghost"
                className="h-auto w-full justify-start gap-3 whitespace-normal rounded-none px-0 py-4 text-start hover:bg-secondary/40"
              >
                <Link to={s.to}>
                  <s.icon className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{s.label}</span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {s.desc}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                </Link>
              </Button>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="settings-security"
          className="grid gap-5 border-b border-border py-8 sm:grid-cols-[160px_minmax(0,1fr)] lg:gap-10"
        >
          <h2
            id="settings-security"
            className="flex items-center gap-2 self-start font-display text-base font-semibold tracking-normal"
          >
            <ShieldCheck className="size-4 text-primary" />
            Account &amp; Security
          </h2>
          <div className="min-w-0 divide-y divide-border">
            <Button
              asChild
              variant="ghost"
              className="h-auto w-full justify-start gap-3 whitespace-normal rounded-none px-0 py-3 text-start"
            >
              <Link to="/dashboard/informations">
                <UserRound className="text-primary" />
                <span className="min-w-0 flex-1">Edit My Information</span>
                <ChevronRight className="text-muted-foreground rtl:rotate-180" />
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="h-auto w-full justify-start gap-3 whitespace-normal rounded-none px-0 py-3 text-start"
            >
              <Link to="/dashboard/informations" search={{ tab: "security" }}>
                <ShieldCheck className="text-primary" />
                <span className="min-w-0 flex-1">Account &amp; Security</span>
                <ChevronRight className="text-muted-foreground rtl:rotate-180" />
              </Link>
            </Button>
          </div>
        </section>

        <section
          aria-labelledby="settings-deletion"
          className="grid gap-5 py-8 sm:grid-cols-[160px_minmax(0,1fr)] lg:gap-10"
        >
          <h2
            id="settings-deletion"
            className="flex items-center gap-2 self-start font-display text-base font-semibold tracking-normal"
          >
            <Trash2 className="size-4 text-destructive" />
            Account &amp; Deletion
          </h2>
          <div className="min-w-0">
            <Button
              asChild
              variant="outline"
              className="h-auto min-h-10 max-w-full whitespace-normal border-destructive/30 py-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Link to="/dashboard/account">
                <Trash2 />
                Account &amp; Deletion
                <ChevronRight className="rtl:rotate-180" />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </TooltipProvider>
  );
}
