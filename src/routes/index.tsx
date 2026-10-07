import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  Languages,
  Link2,
  Menu,
  Palette,
  QrCode as QrCodeIcon,
  Send,
  ShieldCheck,
  UserCircle,
  UserCog,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  AnalyticsMock,
  BrowserFrame,
  DemoPublicProfile,
  DemoQr,
  PhoneFrame,
  QrDownloadRow,
  ShareStrip,
  brandQr,
} from "@/components/landing/Mockups";
import { Reveal } from "@/components/landing/Reveal";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { SocialIcon } from "@/components/SocialIcon";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { SOCIAL_PLATFORMS } from "@/lib/socials";

const TITLE = "Tinki — All your links. One simple page";
const DESCRIPTION =
  "Create your personal link page with your social profiles, custom links and a QR code. Share it anywhere and see how people interact with it";

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

const NAV = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

const FEATURES = [
  { icon: Users, title: "Social profiles", body: "Connect Instagram, Facebook, Snapchat, TikTok, LinkedIn, X and 10 more platforms" },
  { icon: Link2, title: "Custom links", body: "Add any website, portfolio, store or article — plus phone and email links" },
  { icon: UserRound, title: "Personalized profile", body: "Your photo, name, username and bio, with your own fonts, colors and background" },
  { icon: QrCodeIcon, title: "QR code", body: "A QR code for your page, ready for posters, business cards and events" },
  { icon: Send, title: "Share anywhere", body: "One link for Instagram bios, TikTok, WhatsApp, Telegram and business cards" },
  { icon: BarChart3, title: "Analytics", body: "See profile views and which social icons and links people tap" },
];

const STEPS = [
  { title: "Create your account", body: "Sign up and choose your username" },
  { title: "Build your page", body: "Add your social profiles, custom links, profile information, and personalize your page" },
  { title: "Share it", body: "Share one link or QR code and let people discover everything you want them to see" },
];

const ACCOUNT = [
  { icon: UserCircle, title: "My Profile", body: "Preview your public page, copy your link, share it, and access your QR code" },
  { icon: BarChart3, title: "Dashboard", body: "See visits and link interactions through your profile analytics" },
  { icon: Link2, title: "My Links", body: "Add, reorder, and switch custom links and social icons on or off" },
  { icon: Palette, title: "Customize profile", body: "Change fonts, colors, card style and your page background" },
  { icon: QrCodeIcon, title: "Customize QR Code", body: "Personalize your QR code while keeping it readable and usable" },
  { icon: ShieldCheck, title: "My Informations & Security", body: "Manage your profile information, social links, profile picture and password" },
  { icon: UserCog, title: "Account & Deletion", body: "Review your account details or permanently delete your account" },
];

const FAQ = [
  ["What is this platform?", "Tinki gives you one personal page that collects your social profiles and important links, so you can share a single link instead of many"],
  ["How does my profile link work?", "When you sign up you choose a username. Your public page lives at that address — for example tinki.lovable.app/yourname"],
   ["Can I add social media accounts?", `Yes. You can add ${SOCIAL_PLATFORMS.length} platforms including Instagram, Facebook, TikTok, Snapchat, LinkedIn, X, YouTube, WhatsApp and Telegram`],
  ["Can I add custom links?", "Yes. Add websites, portfolios or stores, plus phone and email links, and choose an icon for each"],
  ["Can I customize my page?", "Yes. Upload a profile photo, write a bio, and change fonts, colors, the card style and the page background — a color, gradient, image or video"],
  ["Can I use a QR code?", "Every page has its own QR code. You can change its colors and shapes, add your profile picture in the center, and download it"],
  ["Can I see page analytics?", "Yes. Your dashboard shows profile views, social icon clicks and custom link clicks. Your own visits are not counted"],
  ["Can I delete my account?", "Yes. From Account & Deletion you can permanently delete your account and your page at any time"],
] as const;

function Logo() {
  return (
    <Link to="/" className="font-display text-lg font-bold tracking-tight">
      Tin<span className="text-primary">ki</span>
    </Link>
  );
}

function SectionHead({ eyebrow, title, body, center = false }: { eyebrow: string; title: string; body?: string; center?: boolean }) {
  const { t } = useLanguage();
  return (
    <Reveal className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-sm font-medium text-primary">{t(eyebrow)}</p>
      <h2 className="mt-3 font-display text-3xl font-semibold text-balance sm:text-4xl">{t(title)}</h2>
      {body && <p className="mt-4 text-base leading-relaxed text-muted-foreground">{t(body)}</p>}
    </Reveal>
  );
}

function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useLanguage();
  const activeLabel = ({ en: "EN", fr: "FR", es: "ES", de: "DE", ar: "ع" } as const)[lang];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={`gap-1.5 px-2 ${className}`} aria-label={t("Language")}>
          <Languages className="h-4 w-4" />
          <span className="min-w-5 text-xs font-semibold">{activeLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup value={lang} onValueChange={(value) => setLang(value as typeof lang)}>
          {([["en", "English"], ["fr", "Français"], ["es", "Español"], ["de", "Deutsch"], ["ar", "العربية"]] as const).map(([code, label]) => (
            <DropdownMenuRadioItem key={code} value={code}>{label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Landing() {
  const { t } = useLanguage();
  const { session } = useAuth();
  const signedIn = Boolean(session);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const primaryCta = signedIn ? (
    <Link to="/dashboard">
      {t("Open your dashboard")} <ArrowRight className="ms-2 inline h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
    </Link>
  ) : (
    <Link to="/register">
      {t("Create your page")} <ArrowRight className="ms-2 inline h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
    </Link>
  );

  const authActions = (onClick?: () => void, btnClass = "") =>
    signedIn ? (
      <Button asChild size="sm" className={btnClass}>
        <Link to="/dashboard" onClick={onClick}>{t("Dashboard")}</Link>
      </Button>
    ) : (
      <>
        <Button asChild variant="ghost" size="sm" className={btnClass}>
          <Link to="/login" onClick={onClick}>{t("Log in")}</Link>
        </Button>
        <Button asChild size="sm" className={btnClass}>
          <Link to="/register" onClick={onClick}>{t("Get started")}</Link>
        </Button>
      </>
    );

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <SmoothScroll />
      <div className="bg-halo pointer-events-none absolute inset-x-0 top-0 h-[560px]" aria-hidden="true" />

      {/* 1. Navigation */}
      <header
        className={`sticky top-0 z-40 transition-[background-color,border-color,padding] duration-300 ${
          scrolled ? "border-b border-border bg-background/85 backdrop-blur-md" : "border-b border-transparent"
        }`}
      >
        <div className={`relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 transition-[padding] duration-300 rtl:flex-row-reverse ${scrolled ? "py-3" : "py-5"}`}>
          <Logo />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 md:hidden">
            <LangSwitch className="btn-nav rounded-full" />
          </div>
          <nav aria-label={t("Main")} className="hidden items-center gap-7 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                 {t(n.label)}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex"><LangSwitch className="btn-nav rounded-full" />{authActions(undefined, "btn-nav rounded-full")}</div>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="btn-menu md:hidden" aria-label={t("Open menu")}>
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-6">
              <SheetTitle className="sr-only">{t("Menu")}</SheetTitle>
              <div className="flex h-full flex-col items-center gap-8 text-center">
                <Logo />
                <nav aria-label={t("Mobile")} className="flex w-full flex-col gap-1 text-center">
                  {NAV.map((n) => (
                    <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-base hover:bg-secondary">
                        {t(n.label)}
                    </a>
                  ))}
                </nav>
                <div className="mt-auto flex w-full flex-col items-center gap-2 text-center [&>*]:w-full [&>*]:justify-center">{authActions(() => setMenuOpen(false), "btn-sheet")}</div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="relative">
        {/* 2. Hero */}
        <section className="mx-auto flex max-w-6xl flex-col items-center px-5 pt-10 pb-24 text-center lg:pt-16 lg:pb-28">
          <Reveal className="flex w-full flex-col items-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              {t("Free personal link page")}
            </p>
            <h1 className="mt-6 max-w-4xl font-display text-[2.6rem] leading-[1.02] font-bold text-balance sm:text-6xl lg:text-[4.25rem]">
              {t("All your links")}
              <br />
              <span className="text-primary">{t("One simple page")}</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {t("Bring your social profiles, custom links, contact information, and everything you want to share into one beautiful page")}
            </p>
            <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild size="lg" className="btn-hero group h-12 rounded-full bg-gradient-primary px-7 text-base font-semibold shadow-[var(--shadow-glow)]">{primaryCta}</Button>
              <Button asChild size="lg" variant="outline" className="btn-hero h-12 rounded-full px-7 text-base font-semibold">
                <a href="#how-it-works">{t("See how it works")}</a>
              </Button>
            </div>
            <div className="mt-10 flex items-center gap-4 text-muted-foreground" aria-label={t("Supported platforms include")}>
              {(["instagram", "tiktok", "facebook", "snapchat", "linkedin", "x", "youtube", "whatsapp"] as const).map((k) => (
                <SocialIcon key={k} platform={k} className="h-4 w-4" />
              ))}
              <span className="text-xs">+{SOCIAL_PLATFORMS.length - 8} {t("more")}</span>
            </div>
          </Reveal>

          <Reveal delay={120} className="relative mt-14 w-full max-w-sm sm:mt-16">
            <PhoneFrame>
              <DemoPublicProfile compact />
            </PhoneFrame>
            <div className="panel absolute -bottom-14 -start-4 hidden items-center gap-3 p-3 text-start sm:flex lg:-start-16">
              <DemoQr size={76} />
              <div className="pe-2">
                <p className="text-sm font-medium">{t("Scan to open")}</p>
                <p className="text-xs text-muted-foreground">/sara.designs</p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* 3. Features */}
        <section id="features" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <SectionHead eyebrow="Features" title="Everything you want to share. In one place" />
            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={i * 50} className="bg-background p-7 transition-colors hover:bg-surface">
                  <f.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                   <h3 className="mt-5 font-display text-lg font-semibold">{t(f.title)}</h3>
                   <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(f.body)}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Showcase */}
        <section className="border-t border-border bg-surface/40">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <SectionHead
              center
              eyebrow="The product"
              title="One profile. Everything connected"
              body="The same page adapts to every screen — opened from a link on desktop, a bio on mobile, or a QR code on a poster"
            />
            <Reveal className="relative mt-14">
              <BrowserFrame url="tinki.lovable.app/sara.designs" className="mx-auto max-w-4xl">
                <DemoPublicProfile />
              </BrowserFrame>
              <div className="panel absolute bottom-[-2rem] -start-2 hidden flex-col items-center gap-2 p-4 lg:flex xl:-start-6">
                <DemoQr size={120} />
                <QrDownloadRow />
              </div>
            </Reveal>
          </div>
        </section>

        {/* 5. How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <SectionHead eyebrow="How it works" title="Live in three steps" />
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {STEPS.map((s, i) => (
                <Reveal key={s.title} delay={i * 80}>
                  <li className="border-t border-border pt-6">
                    <span className="font-display text-sm font-semibold text-primary">0{i + 1}</span>
                     <h3 className="mt-3 font-display text-xl font-semibold">{t(s.title)}</h3>
                     <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(s.body)}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* 6. Account */}
        <section className="border-t border-border bg-surface/40">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <SectionHead
              eyebrow="Your account"
              title="Your page. Your control center"
              body="After you sign in, everything about your page is managed from one simple dashboard"
            />
            <Reveal className="mt-12">
              <ul className="overflow-hidden rounded-xl border border-border bg-background">
                {ACCOUNT.map((a) => (
                  <li key={a.title} className="flex gap-4 border-b border-border p-5 last:border-b-0">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-secondary">
                      <a.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                       <h3 className="font-display font-semibold">{t(a.title)}</h3>
                       <p className="mt-1 text-sm text-muted-foreground">{t(a.body)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* 7. Customization */}
        <section className="border-t border-border">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 lg:grid-cols-2">
            <div>
              <SectionHead
                eyebrow="Customization"
                title="Make your page feel like you"
                body="Your photo, your words, your style. Everything visitors see can reflect who you are"
              />
              <Reveal>
                <dl className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                  {[
                    ["Profile photo & bio", "Upload a picture and describe yourself in a few words"],
                    ["Fonts & colors", "Pick fonts, weights and colors for your name and bio"],
                    ["Social icons & links", "Choose icon colors and which links are visible"],
                    ["Background", "Solid color, gradient, image, or a looping video"],
                   ].map(([heading, b]) => (
                     <div key={heading} className="border-s-2 border-primary/60 ps-4">
                       <dt className="font-medium">{t(heading ?? "")}</dt>
                       <dd className="mt-1 text-sm text-muted-foreground">{t(b ?? "")}</dd>
                    </div>
                  ))}
                </dl>
              </Reveal>
            </div>
            <Reveal delay={100} className="grid grid-cols-3 gap-3">
              {[
                ["linear-gradient(160deg, oklch(0.35 0.08 250), oklch(0.18 0.03 265))", "Gradient"],
                ["oklch(0.93 0.03 90)", "Solid"],
                ["radial-gradient(circle at top, oklch(0.55 0.12 20), oklch(0.2 0.04 330))", "Radial"],
              ].map(([bg, label], i) => (
                <figure key={label} className={i === 1 ? "translate-y-6" : ""}>
                  <div className="aspect-[9/16] rounded-2xl border border-border p-3" style={{ background: bg }}>
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
                   <figcaption className="mt-2 text-center text-xs text-muted-foreground">{t(label ?? "")}</figcaption>
                </figure>
              ))}
            </Reveal>
          </div>
        </section>

        {/* 8. QR */}
        <section className="border-t border-border bg-surface/40">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 lg:grid-cols-[1fr_1fr]">
            <Reveal className="order-2 flex flex-wrap items-end justify-center gap-5 lg:order-1">
              <div className="panel flex flex-col items-center gap-3 p-5">
                <DemoQr size={180} />
                <QrDownloadRow />
              </div>
              <div className="flex flex-col gap-4">
                <div className="panel p-3"><DemoQr size={84} settings={{ ...brandQr, moduleShape: "dots", eyeShape: "circle", foregroundColor: "#0b5d4b" }} /></div>
                <div className="panel p-3"><DemoQr size={84} settings={{ ...brandQr, moduleShape: "square", eyeShape: "square", foregroundColor: "#3b2a6b" }} /></div>
              </div>
            </Reveal>
            <div className="order-1 lg:order-2">
              <SectionHead
                eyebrow="QR code"
                title="Your page, one scan away"
                body="Every page comes with its own QR code. Print it on cards, posters or packaging — one scan opens your profile"
              />
              <Reveal>
                <ul className="mt-8 space-y-3 text-sm">
                  {[
                    "Your profile picture in the center",
                    "Custom colors, dot shapes and corner shapes",
                    "A readability check so it keeps scanning",
                    "Download in high resolution, or share from My Profile",
                   ].map((item) => (
                     <li key={item} className="flex items-center gap-3">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                       {t(item)}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </div>
        </section>

        {/* 9. Analytics */}
        <section className="border-t border-border">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 lg:grid-cols-[0.85fr_1.15fr]">
            <SectionHead
              eyebrow="Analytics"
              title="Know how your page performs"
              body="Your dashboard shows how many people open your page and which social icons and links they tap. Your own visits are never counted"
            />
            <Reveal delay={100}>
              <AnalyticsMock />
              <p className="mt-3 text-xs text-muted-foreground">{t("Illustration with sample numbers — not real user data")}</p>
            </Reveal>
          </div>
        </section>

        {/* 10. FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-border bg-surface/40">
          <div className="mx-auto max-w-6xl px-5 py-24">
            <SectionHead eyebrow="FAQ" title="Questions, answered" />
            <Reveal className="mt-12">
              <Accordion type="single" collapsible className="w-full">
                {FAQ.map(([q, a]) => (
                  <AccordionItem key={q} value={q}>
                     <AccordionTrigger className="text-start font-display text-base">{t(q)}</AccordionTrigger>
                     <AccordionContent className="text-muted-foreground">{t(a)}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </section>

        {/* 11. Final CTA */}
        <section className="border-t border-border">
          <Reveal className="mx-auto max-w-6xl px-5 py-24">
            <div className="panel flex flex-col items-start justify-between gap-8 p-8 sm:p-12 md:flex-row md:items-center">
              <div className="max-w-xl">
                <h2 className="font-display text-3xl font-semibold sm:text-4xl">{t("Everything you share, one link")}</h2>
                <p className="mt-3 text-muted-foreground">{t("Create your page and give people one simple place to find you")}</p>
                <div className="mt-6 hidden max-w-sm sm:block"><ShareStrip /></div>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Button asChild size="lg" className="btn-final group h-12 rounded-full bg-gradient-primary px-7 text-base font-semibold shadow-[var(--shadow-glow)]">{primaryCta}</Button>
                {!signedIn && (
                  <Button asChild size="lg" variant="outline" className="btn-final h-12 rounded-full px-7 text-base font-semibold">
                    <Link to="/login">{t("Log in")}</Link>
                  </Button>
                )}
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* 12. Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              {t("One personal page for your social profiles, custom links and QR code")}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium">{t("Product")}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><a href="#features" className="hover:text-foreground">{t("Features")}</a></li>
              <li><a href="#how-it-works" className="hover:text-foreground">{t("How it works")}</a></li>
              <li><a href="#faq" className="hover:text-foreground">{t("FAQ")}</a></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium">{t("Account")}</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {signedIn ? (
                <li><Link to="/dashboard" className="hover:text-foreground">{t("Dashboard")}</Link></li>
              ) : (
                <>
                  <li><Link to="/login" className="hover:text-foreground">{t("Log in")}</Link></li>
                  <li><Link to="/register" className="hover:text-foreground">{t("Sign up")}</Link></li>
                </>
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
