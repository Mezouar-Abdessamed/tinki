import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  Film,
  GripVertical,
  Image as ImageIcon,
  Languages,
  Link2,
  Mail,
  Menu,
  Palette,
  Phone,
  QrCode as QrCodeIcon,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Type,
  UserCircle,
  UserCog,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { AmbientBackground } from "@/components/landing/AmbientBackground";
import { GlowCursor } from "@/components/landing/GlowCursor";
import {
  AnalyticsMock,
  BrowserFrame,
  DemoPublicProfile,
  DemoQr,
  PhoneFrame,
  QrDownloadRow,
  ShareStrip,
  brandQr,
} from "@/components/landing/LandingShowcaseMockups";
import { ScrollReveal } from "@/components/landing/ScrollReveal";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { SocialIcon } from "@/components/SocialIcon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { SUPPORTED_LANGUAGES, useLanguage } from "@/lib/i18n";
import {
  BACKGROUND_MODES,
  DASHBOARD_MODULES,
  DEMO_LINK_ROWS,
  FONT_SHOWCASE,
  LANDING_DOT_SHAPES,
  LANDING_EYE_SHAPES,
  LANDING_FAQ,
  LANDING_NAV,
  LANDING_QR_PRESETS,
  LANDING_THEME_PRESETS,
  WORKFLOW_STEPS,
} from "@/lib/landing-content";
import { getShinyHeadlineGradient } from "@/lib/landing-motion";
import { textTypographyStyle } from "@/lib/profiles";
import type { QrSettings } from "@/lib/qr-settings";
import { registrationEntryPath } from "@/lib/signup-config";
import { SOCIAL_PLATFORMS } from "@/lib/profile-validation";

const TITLE = "Tinki — Your links, style, and QR code. All in one personal page";
const DESCRIPTION =
  "Collect 16 social profiles and custom links, style your card with covers and video backgrounds, share a custom QR code, and see every visit by link and country";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const MODULE_ICONS = {
  dashboard: BarChart3,
  profile: UserCircle,
  links: Link2,
  customize: Palette,
  qr: QrCodeIcon,
  info: ShieldCheck,
  settings: SlidersHorizontal,
  account: UserCog,
} as const;

function Logo() {
  return (
    <Link to="/" className="font-display text-lg font-bold tracking-tight">
      Tin<span className="text-primary">ki</span>
    </Link>
  );
}

function SectionHead({
  eyebrow,
  title,
  body,
  center = false,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  center?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <ScrollReveal className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-xs font-semibold tracking-wider text-primary uppercase">{t(eyebrow)}</p>
      <h2 className="mt-3 font-display text-3xl font-semibold text-balance sm:text-4xl">
        {t(title)}
      </h2>
      {body ? (
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{t(body)}</p>
      ) : null}
    </ScrollReveal>
  );
}

function Landing() {
  const { lang, setLang, t } = useLanguage();
  const { session } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const signedIn = Boolean(session);
  const currentLanguage =
    SUPPORTED_LANGUAGES.find((item) => item.code === lang) ?? SUPPORTED_LANGUAGES[0]!;
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [activeThemeId, setActiveThemeId] = useState<string>(LANDING_THEME_PRESETS[0]!.id);
  const [previewQrButton, setPreviewQrButton] = useState(true);
  const [qrSettings, setQrSettings] = useState<QrSettings>(() => ({
    ...brandQr,
    ...LANDING_QR_PRESETS[1]!.patch,
  }));

  const activeTheme =
    LANDING_THEME_PRESETS.find((item) => item.id === activeThemeId) ?? LANDING_THEME_PRESETS[0]!;
  const matchedQrPresetId =
    LANDING_QR_PRESETS.find(
      (preset) =>
        preset.patch.foregroundColor === qrSettings.foregroundColor &&
        preset.patch.backgroundColor === qrSettings.backgroundColor &&
        preset.patch.moduleShape === qrSettings.moduleShape &&
        preset.patch.eyeShape === qrSettings.eyeShape,
    )?.id ?? null;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function navigateFromSidebar(href: string) {
    setMobileMenuOpen(false);
    const id = href.replace(/^#/, "");
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }, 320);
  }

  const primaryCta = signedIn ? (
    <Link to="/dashboard">
      {t("Open your dashboard")}{" "}
      <ArrowRight className="ms-2 inline h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
    </Link>
  ) : (
    <Link to={registrationEntryPath()}>
      {t("Create account")}
      {"\u00a0"}{" "}
      <ArrowRight className="ms-2 inline h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
    </Link>
  );

  const authActions = (btnClass = "") =>
    signedIn ? (
      <Button asChild size="sm" className={btnClass}>
        <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)}>
          {t("Dashboard")}
        </Link>
      </Button>
    ) : (
      <Button asChild size="sm" className={btnClass}>
        <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
          {t("Log in")}
        </Link>
      </Button>
    );

  const renderLanguageMenu = (align: "center" | "end" = "end") => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("Language")}
          className="h-8 gap-1.5 rounded-full border border-border/80 bg-surface/60 px-2.5 text-xs font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
        >
          <Languages className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span className="hidden sm:inline" lang={lang}>
            {currentLanguage.label}
          </span>
          <span className="uppercase sm:hidden">{lang}</span>
          <ChevronDown className="h-3 w-3 opacity-70" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-40">
        {SUPPORTED_LANGUAGES.map((option) => (
          <DropdownMenuItem
            key={option.code}
            onSelect={() => setLang(option.code)}
            className="flex cursor-pointer items-center justify-between gap-3"
          >
            <span lang={option.code}>{option.label}</span>
            {lang === option.code ? (
              <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const shinyHeadlineStyle = {
    backgroundImage: getShinyHeadlineGradient(),
    backgroundSize: "200% auto",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
  } as const;

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <SmoothScroll />
      <GlowCursor />
      <AmbientBackground />

      {/* Fixed subtle vertical guide lines aligned with container edges */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-1/2 z-[5] hidden w-px -translate-x-[calc(50%+36rem)] bg-white/[0.06] md:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-1/2 z-[5] hidden w-px translate-x-[calc(-50%+36rem)] bg-white/[0.06] md:block"
      />

      {/* 1. Navigation */}
      <header
        className={`sticky top-0 z-40 transition-[background-color,border-color,padding] duration-300 ${
          scrolled
            ? "border-b border-border bg-background/85 backdrop-blur-md"
            : "border-b border-transparent"
        }`}
      >
        <div
          dir="ltr"
          className={`landing-enter-down relative mx-auto grid max-w-6xl grid-cols-3 items-center gap-2 px-5 transition-[padding] duration-300 lg:flex lg:justify-between lg:gap-4 ${scrolled ? "py-3" : "py-5"}`}
        >
          <div className="justify-self-start">
            <Logo />
          </div>
          <nav
            dir={lang === "ar" ? "rtl" : "ltr"}
            aria-label={t("Main")}
            className="hidden items-center gap-6 lg:flex"
          >
            {LANDING_NAV.map((n, index) => (
              <a
                key={n.href}
                href={n.href}
                style={{
                  ["--enter-y" as string]: "-6px",
                  ["--enter-dur" as string]: "450ms",
                  ["--enter-delay" as string]: `${100 + index * 50}ms`,
                }}
                className="landing-enter-down text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t(n.label)}
              </a>
            ))}
          </nav>
          <div className="justify-self-center lg:hidden">{renderLanguageMenu("center")}</div>
          <div className="flex shrink-0 items-center gap-2 justify-self-end">
            <div className="hidden lg:block">{renderLanguageMenu("end")}</div>
            <div className="hidden sm:block">{authActions("btn-nav rounded-full")}</div>
            <div className="lg:hidden">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("Open menu")}
                    className="h-9 w-9 rounded-full border border-border/80 bg-surface/60 text-muted-foreground hover:bg-surface hover:text-foreground"
                  >
                    <Menu className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  className="flex w-72 flex-col justify-between p-6"
                >
                  <SheetTitle className="sr-only">{t("Main")}</SheetTitle>
                  <div className="flex justify-center" onClick={() => setMobileMenuOpen(false)}>
                    <Logo />
                  </div>
                  <nav
                    aria-label={t("Main")}
                    className="flex flex-1 flex-col items-center justify-center gap-2"
                  >
                    {LANDING_NAV.map((n) => (
                      <a
                        key={n.href}
                        href={n.href}
                        onClick={(event) => {
                          event.preventDefault();
                          navigateFromSidebar(n.href);
                        }}
                        className="flex min-h-11 w-full items-center justify-center rounded-lg px-4 py-2.5 text-center text-base font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                      >
                        {t(n.label)}
                      </a>
                    ))}
                  </nav>
                  <div className="border-t border-border pt-4">
                    {authActions("btn-nav w-full rounded-full justify-center")}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* 2. Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-6 pb-14 lg:grid-cols-[1.08fr_0.92fr] lg:pt-8 lg:pb-16">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-start">
            <h1
              style={{
                ["--enter-y" as string]: "20px",
                ["--enter-dur" as string]: "700ms",
                ["--enter-delay" as string]: "120ms",
              }}
              className="landing-enter-up max-w-3xl font-display text-[clamp(2.3rem,4.5vw,4rem)] leading-[1.03] font-bold text-balance"
            >
              {t("Your links, style, and QR code")}
              <br />
              <span className="animate-shiny inline-block" style={shinyHeadlineStyle}>
                {t("All in one personal page")}
              </span>
            </h1>
            <p
              style={{
                ["--enter-y" as string]: "16px",
                ["--enter-dur" as string]: "650ms",
                ["--enter-delay" as string]: "240ms",
              }}
              className="landing-enter-up mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              {t(
                "Collect 16 social profiles and custom links, style your card with covers and video backgrounds, share a custom QR code, and see every visit by link and country",
              )}
            </p>
            <div
              style={{
                ["--enter-y" as string]: "16px",
                ["--enter-dur" as string]: "650ms",
                ["--enter-delay" as string]: "360ms",
              }}
              className="landing-enter-up mt-8 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row lg:items-center"
            >
              <Button
                asChild
                size="lg"
                className="btn-hero group h-12 w-full rounded-full bg-gradient-primary px-7 text-base font-semibold shadow-[var(--shadow-glow)] sm:w-auto"
              >
                {primaryCta}
              </Button>
              <a
                href="#features"
                className="liquid-glass inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-medium text-foreground transition-colors hover:bg-surface"
              >
                {t("Explore what's included")}
              </a>
            </div>
            <div
              style={{
                ["--enter-y" as string]: "12px",
                ["--enter-dur" as string]: "550ms",
                ["--enter-delay" as string]: "460ms",
              }}
              className="landing-enter-up mt-9 flex flex-wrap items-center justify-center gap-3 text-muted-foreground lg:justify-start"
              aria-label={t("Supported platforms include")}
            >
              {(
                [
                  "instagram",
                  "tiktok",
                  "facebook",
                  "snapchat",
                  "linkedin",
                  "x",
                  "youtube",
                  "whatsapp",
                  "github",
                  "discord",
                ] as const
              ).map((k) => (
                <SocialIcon key={k} platform={k} className="h-4 w-4" />
              ))}
              <span className="text-xs font-medium text-muted-foreground">
                {t("all 16 platforms supported")}
              </span>
            </div>
          </div>

          <div
            style={{
              ["--enter-y" as string]: "36px",
              ["--enter-dur" as string]: "750ms",
              ["--enter-delay" as string]: "300ms",
            }}
            className="landing-enter-up relative mx-auto w-full max-w-[330px] sm:max-w-[350px]"
          >
            <PhoneFrame className="liquid-glass">
              <DemoPublicProfile compact showCover showQrButton />
            </PhoneFrame>
            <div
              style={{
                ["--enter-y" as string]: "16px",
                ["--enter-dur" as string]: "600ms",
                ["--enter-delay" as string]: "500ms",
              }}
              className="landing-enter-up liquid-glass absolute bottom-4 -start-5 z-20 hidden items-center gap-3 rounded-2xl p-3 text-start sm:flex lg:-start-8"
            >
              <DemoQr size={72} />
              <div className="pe-2">
                <p className="text-sm font-medium">{t("Scan to open")}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  /sara.designs
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Asymmetric Capabilities Bento */}
        <section id="features" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:py-24">
            <SectionHead
              eyebrow="Everything your page can do"
              title="Built for every detail visitors see"
              body="From the cover banner and social icon order to QR scan checks and visitor countries, every tool works together in one workspace"
            />

            <div className="mt-12 grid gap-5 lg:grid-cols-12">
              {/* 01 Wide Bento Card: 16 Socials + Custom Links + Reordering */}
              <ScrollReveal className="liquid-glass flex flex-col justify-between rounded-2xl p-6 transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1 sm:p-8 lg:col-span-7">
                <div>
                  <span className="font-display text-xs font-semibold text-primary">01</span>
                  <h3 className="mt-2 font-display text-xl font-semibold sm:text-2xl">
                    {t("Social profiles & custom links")}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t("Connect 16 social networks plus website, phone and email links")}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t(
                      "Drag rows to set your icon order, pick from 19 link icons, and flip individual links on or off without losing saved details",
                    )}
                  </p>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {SOCIAL_PLATFORMS.map((platform) => (
                      <span
                        key={platform.key}
                        title={platform.label}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                      >
                        <SocialIcon platform={platform.key} className="h-4 w-4" />
                      </span>
                    ))}
                  </div>

                  <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                    {DEMO_LINK_ROWS.map((row) => {
                      const RowIcon =
                        row.linkType === "email"
                          ? Mail
                          : row.linkType === "phone"
                            ? Phone
                            : BriefcaseBusiness;
                      return (
                        <div
                          key={row.title}
                          className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
                        >
                          <GripVertical
                            className="h-4 w-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-background text-primary">
                            <RowIcon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{t(row.title)}</p>
                            <p className="truncate text-xs text-muted-foreground" dir="ltr">
                              {row.detail}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {t("Active")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ScrollReveal>

              {/* 02 Companion Card: Cover Banners + Avatar + Public QR Button */}
              <ScrollReveal
                delay={60}
                className="liquid-glass flex flex-col justify-between rounded-2xl p-6 transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1 sm:p-8 lg:col-span-5"
              >
                <div>
                  <span className="font-display text-xs font-semibold text-primary">02</span>
                  <h3 className="mt-2 font-display text-xl font-semibold sm:text-2xl">
                    {t("Cover banners & public QR button")}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t("Stand out before visitors scroll")}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t(
                      "Upload a profile picture and cover banner with adjustable horizontal and vertical focus, and toggle the quick-share QR button right on your public page",
                    )}
                  </p>
                </div>

                <div className="mt-6 overflow-hidden rounded-xl border border-border bg-background">
                  <div className="relative aspect-[851/315] overflow-hidden border-b border-border">
                    <img
                      src="/presets/geometric.svg"
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute start-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-border bg-background/85 text-foreground backdrop-blur">
                      <QrCodeIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 text-xs text-muted-foreground">
                    <span>{t("Public QR button")}</span>
                    <span className="font-medium text-primary">{t("Visible")}</span>
                  </div>
                </div>
              </ScrollReveal>

              {/* 03: Five Languages & RTL */}
              <ScrollReveal
                delay={90}
                className="liquid-glass flex flex-col justify-between rounded-2xl p-6 transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1 lg:col-span-4"
              >
                <div>
                  <span className="font-display text-xs font-semibold text-primary">03</span>
                  <h3 className="mt-2 font-display text-lg font-semibold">
                    {t("Five languages with Arabic RTL")}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-foreground/90">
                    {t("Speak every visitor's language")}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t(
                      "Switch instantly between English, Français, Español, Deutsch and العربية in the header or Settings with automatic right-to-left layout support",
                    )}
                  </p>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {SUPPORTED_LANGUAGES.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => setLang(item.code)}
                      aria-pressed={lang === item.code}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        lang === item.code
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      <span lang={item.code}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </ScrollReveal>

              {/* 04: Safety Checks */}
              <ScrollReveal
                delay={120}
                className="liquid-glass flex flex-col justify-between rounded-2xl p-6 transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1 lg:col-span-4"
              >
                <div>
                  <span className="font-display text-xs font-semibold text-primary">04</span>
                  <h3 className="mt-2 font-display text-lg font-semibold">
                    {t("Safety checks before you publish")}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-foreground/90">
                    {t("Contrast & QR scan verification")}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t(
                      "Get warned when text contrast is too low or a styled QR loses contrast, then fix readability in one click",
                    )}
                  </p>
                </div>
                <div className="mt-5 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{t("Readable — scanned and verified")}</span>
                </div>
              </ScrollReveal>

              {/* 05: Security & Account Control */}
              <ScrollReveal
                delay={150}
                className="liquid-glass flex flex-col justify-between rounded-2xl p-6 transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1 lg:col-span-4"
              >
                <div>
                  <span className="font-display text-xs font-semibold text-primary">05</span>
                  <h3 className="mt-2 font-display text-lg font-semibold">
                    {t("Account & security control")}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-foreground/90">
                    {t("Stay signed in your way")}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t(
                      "Sign in with Google or email, protect unsaved edits with exit guards, recover your password by email, or delete your account cleanly anytime",
                    )}
                  </p>
                </div>
                <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{t("My Information & Security")}</span>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </section>

        {/* 4. Interactive Live Product Showcase (Desktop BrowserFrame + DemoPublicProfile) */}
        <section className="border-t border-border bg-surface/28">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:py-24">
            <SectionHead
              center
              eyebrow="Interactive preview"
              title="One profile. Live theme switching"
              body="Preview how the public page responds in real time — pick a ready-made theme below to update the background, card gradient, typography and icon colors"
            />

            <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
              {LANDING_THEME_PRESETS.map((preset) => {
                const active = preset.id === activeTheme.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setActiveThemeId(preset.id)}
                    aria-pressed={active}
                    className={`rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {t(preset.label)}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setPreviewQrButton((current) => !current)}
                aria-pressed={previewQrButton}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary/50"
              >
                <QrCodeIcon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>{t("Public QR button")}:</span>
                <span className="text-primary">{t(previewQrButton ? "Visible" : "Hidden")}</span>
              </button>
            </div>

            <ScrollReveal className="relative mt-8">
              <BrowserFrame url="tinki.app/sara.designs" className="mx-auto max-w-4xl">
                <DemoPublicProfile theme={activeTheme} showCover showQrButton={previewQrButton} />
              </BrowserFrame>
            </ScrollReveal>
          </div>
        </section>

        {/* 5. Customization & Typography Studio */}
        <section id="customization" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 lg:grid-cols-2 lg:py-24">
            <div>
              <SectionHead
                eyebrow="Customization"
                title="Make every screen feel like you"
                body="Set ready-made themes in one tap or fine-tune page gradients, repeated pattern presets, uploaded looping videos, card colors and link icon palettes"
              />

              <div className="mt-8 space-y-3">
                {BACKGROUND_MODES.map((mode) => {
                  const ModeIcon =
                    mode.key === "video" ? Film : mode.key === "pattern" ? ImageIcon : Sparkles;
                  return (
                    <div
                      key={mode.key}
                      className="flex items-start gap-3.5 rounded-xl border border-border bg-surface/60 p-4"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-background text-primary">
                        <ModeIcon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div>
                        <h3 className="font-display text-sm font-semibold">{t(mode.label)}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {t(mode.summary)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 rounded-xl border border-border bg-surface/60 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Type className="h-4 w-4 text-primary" aria-hidden="true" />
                  <span>{t("Typography for name & bio")}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "Choose from 5 curated typefaces with custom weights, italic styles, colors and live contrast checking",
                  )}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {FONT_SHOWCASE.map((font) => (
                    <div
                      key={font.family}
                      className="rounded-lg border border-border bg-background px-3 py-2"
                    >
                      <p
                        className="text-sm font-semibold"
                        style={textTypographyStyle({ family: font.family, weight: 600 })}
                      >
                        {font.label}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{t(font.sample)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <ScrollReveal delay={100} className="grid grid-cols-3 gap-3">
              {[
                {
                  bg: "linear-gradient(160deg, oklch(0.38 0.1 195), oklch(0.18 0.03 240))",
                  label: "Gradient",
                },
                {
                  bg: "url('/presets/geometric.svg') center / cover no-repeat, #111827",
                  label: "Photo preset",
                },
                {
                  bg: "radial-gradient(circle at top, oklch(0.52 0.14 25), oklch(0.18 0.04 330))",
                  label: "Looping video",
                },
              ].map((card, i) => (
                <figure key={card.label} className={i === 1 ? "translate-y-6" : ""}>
                  <div
                    className="aspect-[9/16] rounded-2xl border border-border p-3"
                    style={{ background: card.bg }}
                  >
                    <div className="flex h-full flex-col items-center rounded-xl bg-background/85 p-3 pt-5">
                      <span className="h-10 w-10 rounded-full bg-secondary ring-2 ring-primary/50" />
                      <span className="mt-3 h-2 w-16 rounded-full bg-foreground/70" />
                      <span className="mt-2 h-1.5 w-20 rounded-full bg-muted-foreground/40" />
                      <div className="mt-4 flex gap-1.5">
                        {[0, 1, 2].map((d) => (
                          <span key={d} className="h-5 w-5 rounded-full bg-primary/70" />
                        ))}
                      </div>
                      <span className="mt-4 h-5 w-full rounded-md bg-secondary" />
                      <span className="mt-2 h-5 w-full rounded-md bg-secondary" />
                    </div>
                  </div>
                  <figcaption className="mt-2 text-center text-xs text-muted-foreground">
                    {t(card.label)}
                  </figcaption>
                </figure>
              ))}
            </ScrollReveal>
          </div>
        </section>

        {/* 6. Interactive QR Studio */}
        <section id="qr-studio" className="scroll-mt-20 border-t border-border bg-surface/28">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
            <ScrollReveal className="flex flex-col items-center">
              <div className="liquid-glass flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl p-6 transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1">
                <DemoQr size={196} settings={qrSettings} />
                <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{t("Readable — scanned and verified")}</span>
                </p>
                <QrDownloadRow />
              </div>
            </ScrollReveal>

            <div>
              <SectionHead
                eyebrow="QR Studio"
                title="Your branded QR, verified to scan"
                body="Click a preset, dot shape or corner eye below — the center Tinki logo automatically adapts to your chosen QR color inside a clean medallion"
              />

              <div className="mt-8 space-y-5 rounded-xl border border-border bg-background p-5">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("Quick styles")}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {LANDING_QR_PRESETS.map((preset) => {
                      const active = matchedQrPresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setQrSettings((curr) => ({ ...curr, ...preset.patch }));
                          }}
                          aria-pressed={active}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          }`}
                        >
                          <span
                            className="h-3 w-3 rounded-xs border border-border"
                            style={{ backgroundColor: preset.patch.foregroundColor }}
                            aria-hidden="true"
                          />
                          {t(preset.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("Dot shape")}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {LANDING_DOT_SHAPES.map((shape) => {
                      const active = qrSettings.moduleShape === shape.value;
                      return (
                        <button
                          key={shape.value}
                          type="button"
                          onClick={() =>
                            setQrSettings((curr) => ({ ...curr, moduleShape: shape.value }))
                          }
                          aria-pressed={active}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          }`}
                        >
                          {t(shape.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("Corner shape")}</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {LANDING_EYE_SHAPES.map((eye) => {
                      const active = qrSettings.eyeShape === eye.value;
                      return (
                        <button
                          key={eye.value}
                          type="button"
                          onClick={() =>
                            setQrSettings((curr) => ({ ...curr, eyeShape: eye.value }))
                          }
                          aria-pressed={active}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          }`}
                        >
                          {t(eye.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <ul className="mt-6 grid gap-2.5 text-sm sm:grid-cols-2">
                {[
                  "Logo tinted dynamically to match QR color",
                  "Profile photo medallion centered at top",
                  "Real scan verification before saving",
                  "High-resolution PNG download",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-muted-foreground">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                    <span>{t(item)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 7. Analytics */}
        <section id="analytics" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-[0.78fr_1.22fr] lg:py-24">
            <SectionHead
              eyebrow="Analytics"
              title="Know who visits and where from"
              body="See profile views, social icon taps, custom link clicks and visitor countries — while your own preview visits are never counted"
            />
            <ScrollReveal delay={100}>
              <AnalyticsMock />
              <p className="mt-3 text-xs text-muted-foreground">
                {t("Illustration with sample numbers — not real user data")}
              </p>
            </ScrollReveal>
          </div>
        </section>

        {/* 8. How it works & Complete Dashboard Overview */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-border bg-surface/28">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:py-24">
            <SectionHead
              eyebrow="How it works"
              title="Live in three steps"
              body="Everything you manage after signing in lives in one clean workspace"
            />

            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {WORKFLOW_STEPS.map((s, i) => (
                <ScrollReveal key={s.title} delay={i * 70}>
                  <li className="border-t border-border pt-6">
                    <span className="font-display text-sm font-semibold text-primary">
                      0{i + 1}
                    </span>
                    <h3 className="mt-3 font-display text-xl font-semibold">{t(s.title)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {t(s.body)}
                    </p>
                  </li>
                </ScrollReveal>
              ))}
            </ol>

            <ScrollReveal className="mt-16">
              <p className="text-xs font-semibold tracking-wider text-primary uppercase">
                {t("Eight focused sections in one dashboard")}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {DASHBOARD_MODULES.map((mod, idx) => {
                  const Icon = MODULE_ICONS[mod.id as keyof typeof MODULE_ICONS];
                  return (
                    <motion.div
                      key={mod.id}
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.15 }}
                      transition={{
                        duration: 0.5,
                        delay: idx * 0.04,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="liquid-glass rounded-xl p-4 transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-background/80 text-primary">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <h3 className="mt-3 font-display text-sm font-semibold">{t(mod.title)}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t(mod.body)}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* 9. FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-20 lg:py-24">
            <SectionHead eyebrow="FAQ" title="Questions, answered" />
            <ScrollReveal className="mt-12">
              <dl className="grid gap-x-10 divide-y divide-border md:grid-cols-2 md:divide-y-0">
                {LANDING_FAQ.map(([q, a]) => (
                  <div key={q} className="border-b border-border py-5">
                    <dt className="font-display text-base font-semibold">{t(q)}</dt>
                    <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(a)}</dd>
                  </div>
                ))}
              </dl>
            </ScrollReveal>
          </div>
        </section>

        {/* 10. Final CTA */}
        <section className="border-t border-border bg-surface/28">
          <ScrollReveal className="mx-auto max-w-6xl px-5 py-20">
            <div className="liquid-glass relative flex flex-col items-start justify-between gap-8 rounded-3xl p-8 sm:p-12 md:flex-row md:items-center">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-45"
                style={{
                  background:
                    "radial-gradient(600px circle at 50% 0%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)",
                }}
              />
              <div className="relative z-10 max-w-xl">
                <h2 className="font-display text-3xl font-semibold sm:text-4xl">
                  {t("Ready to bring every link together?")}
                </h2>
                <p className="mt-3 text-muted-foreground">
                  {t("Set up your page, style your QR code and share one link everywhere")}
                </p>
                <div className="mt-6 hidden max-w-sm sm:block">
                  <ShareStrip />
                </div>
              </div>
              <div className="relative z-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="btn-final group h-12 rounded-full bg-gradient-primary px-7 text-base font-semibold shadow-[var(--shadow-glow)]"
                >
                  {primaryCta}
                </Button>
              </div>
            </div>
          </ScrollReveal>
        </section>
      </main>

      {/* 11. Footer */}
      <footer className="relative z-10 border-t border-border bg-background/95">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              {t(
                "One personal page for social profiles, custom links, covers, analytics and QR codes",
              )}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">{t("Product")}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {LANDING_NAV.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="hover:text-foreground">
                    {t(item.label)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium">{t("Account")}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {signedIn ? (
                <li>
                  <Link to="/dashboard" className="hover:text-foreground">
                    {t("Dashboard")}
                  </Link>
                </li>
              ) : (
                <li>
                  <Link to="/login" className="hover:text-foreground">
                    {t("Log in")}
                  </Link>
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="border-t border-border">
          <p className="mx-auto max-w-6xl px-5 py-6 text-xs text-muted-foreground">
            © {new Date().getFullYear()} Tinki {t("All rights reserved")}
          </p>
        </div>
      </footer>
    </div>
  );
}
