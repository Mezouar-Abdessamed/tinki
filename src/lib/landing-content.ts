import type { CustomLinkType } from "@/lib/custom-links";
import type { FontFamilyKey, PageMediaType } from "@/lib/profiles";
import type { QrEyeShape, QrModuleShape, QrSettings } from "@/lib/qr-settings";
import { SOCIAL_PLATFORMS, type SocialKey } from "@/lib/socials";

export const LANDING_NAV = [
  { href: "#features", label: "Features" },
  { href: "#customization", label: "Customization" },
  { href: "#qr-studio", label: "QR Studio" },
  { href: "#analytics", label: "Analytics" },
  { href: "#faq", label: "FAQ" },
] as const;

export type LandingThemePreset = {
  id: string;
  label: string;
  pageBg: string;
  pageImageUrl?: string;
  cardBg: string;
  iconColor: string;
  iconBgColor: string;
  nameColor: string;
  bioColor: string;
  nameFontFamily: FontFamilyKey;
};

export const LANDING_THEME_PRESETS: LandingThemePreset[] = [
  {
    id: "emerald",
    label: "Tinki Dark",
    pageBg: "radial-gradient(60% 60% at 50% 0%, rgba(16, 185, 129, 0.16), #0d111a 72%)",
    cardBg: "#171c28",
    iconColor: "#34d399",
    iconBgColor: "#232a3b",
    nameColor: "#f8fafc",
    bioColor: "#94a3b8",
    nameFontFamily: "display",
  },
  {
    id: "ocean",
    label: "Ocean",
    pageBg: "linear-gradient(135deg, #0ea5e9, #0f766e)",
    cardBg: "linear-gradient(135deg, #ecfeff, #cffafe)",
    iconColor: "#0f766e",
    iconBgColor: "#ffffff",
    nameColor: "#083344",
    bioColor: "#155e75",
    nameFontFamily: "sans",
  },
  {
    id: "sunset",
    label: "Sunset",
    pageBg: "linear-gradient(135deg, #f97316, #db2777)",
    cardBg: "linear-gradient(135deg, #fff7ed, #ffe4e6)",
    iconColor: "#9a3412",
    iconBgColor: "#ffffff",
    nameColor: "#431407",
    bioColor: "#9f1239",
    nameFontFamily: "serif",
  },
  {
    id: "forest",
    label: "Forest",
    pageBg: "linear-gradient(150deg, #14532d, #365314)",
    cardBg: "linear-gradient(135deg, #f0fdf4, #ecfccb)",
    iconColor: "#166534",
    iconBgColor: "#ffffff",
    nameColor: "#052e16",
    bioColor: "#3f6212",
    nameFontFamily: "condensed",
  },
  {
    id: "neon",
    label: "Neon",
    pageBg: "linear-gradient(135deg, #09090b, #3b0764)",
    cardBg: "linear-gradient(135deg, #18181b, #27272a)",
    iconColor: "#a3e635",
    iconBgColor: "#09090b",
    nameColor: "#a3e635",
    bioColor: "#e4e4e7",
    nameFontFamily: "mono",
  },
  {
    id: "geometric",
    label: "Geometric",
    pageBg: "url('/presets/geometric.svg') center / cover no-repeat, #111827",
    pageImageUrl: "/presets/geometric.svg",
    cardBg: "#111827",
    iconColor: "#2dd4bf",
    iconBgColor: "#1e293b",
    nameColor: "#f8fafc",
    bioColor: "#94a3b8",
    nameFontFamily: "display",
  },
];

export const LANDING_QR_PRESETS: Array<{
  id: string;
  label: string;
  patch: Pick<QrSettings, "foregroundColor" | "backgroundColor" | "moduleShape" | "eyeShape">;
}> = [
  {
    id: "classic",
    label: "Classic",
    patch: { foregroundColor: "#0d1117", backgroundColor: "#ffffff", moduleShape: "square", eyeShape: "square" },
  },
  {
    id: "soft",
    label: "Soft",
    patch: { foregroundColor: "#0f766e", backgroundColor: "#ffffff", moduleShape: "rounded", eyeShape: "rounded" },
  },
  {
    id: "dots",
    label: "Dots",
    patch: { foregroundColor: "#1e293b", backgroundColor: "#ffffff", moduleShape: "dots", eyeShape: "circle" },
  },
  {
    id: "elegant",
    label: "Elegant",
    patch: { foregroundColor: "#3b0764", backgroundColor: "#fdf4ff", moduleShape: "classy", eyeShape: "leaf" },
  },
  {
    id: "night",
    label: "Night",
    patch: { foregroundColor: "#f8fafc", backgroundColor: "#0d1117", moduleShape: "rounded", eyeShape: "rounded" },
  },
];

export const LANDING_DOT_SHAPES: Array<{ value: QrModuleShape; label: string }> = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "dots", label: "Dots" },
  { value: "classy", label: "Classy" },
  { value: "diamond", label: "Diamond" },
];

export const LANDING_EYE_SHAPES: Array<{ value: QrEyeShape; label: string }> = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "circle", label: "Circle" },
  { value: "leaf", label: "Leaf" },
];

export const DEMO_LINK_ROWS: Array<{
  title: string;
  detail: string;
  linkType: CustomLinkType;
  enabled: boolean;
}> = [
  { title: "Portfolio", detail: "sara.designs/work", linkType: "link", enabled: true },
  { title: "Work with me", detail: "sara@tinki.app", linkType: "email", enabled: true },
  { title: "Studio booking", detail: "+213 555 01 48", linkType: "phone", enabled: true },
];

export const FONT_SHOWCASE: Array<{ family: FontFamilyKey; label: string; sample: string }> = [
  { family: "display", label: "Space Grotesk", sample: "Modern geometric headings" },
  { family: "sans", label: "DM Sans", sample: "Clean everyday readability" },
  { family: "serif", label: "Playfair Display", sample: "Editorial serif warmth" },
  { family: "mono", label: "JetBrains Mono", sample: "Technical studio voice" },
  { family: "condensed", label: "Oswald", sample: "Bold condensed titles" },
];

export const BACKGROUND_MODES: Array<{ key: PageMediaType | "gradient" | "pattern"; label: string; summary: string }> = [
  { key: "gradient", label: "Solid & gradients", summary: "Pick one color or blend linear and radial angles" },
  { key: "pattern", label: "Photo & patterns", summary: "Built-in patterns, full fixed photos, or custom tiles" },
  { key: "video", label: "Looping video", summary: "Upload an MP4, WebM or MOV clip up to 5 MB" },
];

export const WORKFLOW_STEPS = [
  {
    title: "Sign in & claim your link",
    body: "Continue with Google or email and reserve your personal username URL",
  },
  {
    title: "Build your links, cover & style",
    body: "Add 16 social networks, custom links, a cover banner, typography and your page background",
  },
  {
    title: "Share your link or branded QR",
    body: "Copy one link, download your scannable QR code, and watch visits and country data arrive",
  },
] as const;

export const DASHBOARD_MODULES = [
  { id: "dashboard", title: "Dashboard", body: "Profile views, all-time social clicks, custom link clicks, platform charts and visitor countries" },
  { id: "profile", title: "My Profile", body: "Live public card preview, one-tap link copy, share actions and QR download" },
  { id: "links", title: "My Links", body: "16 social profiles and custom website, phone or email links with drag order and visibility switches" },
  { id: "customize", title: "Customize profile", body: "Ready-made themes, card gradients, 5 fonts, link icon colors and photo or video backgrounds" },
  { id: "qr", title: "Customize QR Code", body: "Presets, custom colors, 5 dot shapes, 4 corner shapes, tinted center logo and scan check" },
  { id: "info", title: "My Information & Security", body: "Avatar, cover banner focal crop, username, bio, sign-in methods and password recovery" },
  { id: "settings", title: "Settings", body: "Public QR quick-button toggle, 5-language switcher with Arabic RTL and quick page shortcuts" },
  { id: "account", title: "Account & Deletion", body: "Preview your live page and permanently delete your account and data whenever you choose" },
] as const;

export const ANALYTICS_PLATFORM_MOCK: Array<{ key: SocialKey; label: string; value: number }> = [
  { key: "instagram", label: "Instagram", value: 184 },
  { key: "tiktok", label: "TikTok", value: 126 },
  { key: "github", label: "GitHub", value: 73 },
  { key: "youtube", label: "YouTube", value: 41 },
];

export const ANALYTICS_COUNTRY_MOCK: Array<{ code: string; name: string; views: number; share: string }> = [
  { code: "DZ", name: "Algeria", views: 540, share: "42.1%" },
  { code: "FR", name: "France", views: 308, share: "24.0%" },
  { code: "CA", name: "Canada", views: 180, share: "14.0%" },
  { code: "DE", name: "Germany", views: 141, share: "11.0%" },
  { code: "ES", name: "Spain", views: 115, share: "8.9%" },
];

export const LANDING_FAQ: ReadonlyArray<readonly [string, string]> = [
  [
    "What is Tinki?",
    "Tinki gives you one customizable personal page for your social accounts, custom links, cover banner, and branded QR code",
  ],
  [
    "Which social platforms are supported?",
    `You can connect ${SOCIAL_PLATFORMS.length} platforms including Instagram, TikTok, Facebook, Snapchat, LinkedIn, X, YouTube, WhatsApp, Telegram, Discord, GitHub, Steam, Epic Games, Threads, Reddit and Twitch`,
  ],
  [
    "What types of custom links can I add?",
    "Add website links, direct phone numbers, and email addresses, pick from 19 custom icons, drag to reorder, and turn individual links on or off at any time",
  ],
  [
    "Can I customize my cover, theme, fonts and background?",
    "Yes. Upload a cover banner and adjust its horizontal and vertical crop, apply ready-made themes, choose from 5 fonts, and set solid colors, gradients, photos or a looping background video",
  ],
  [
    "How does QR code customization work?",
    "Style your QR code with 5 presets, custom colors, 5 dot shapes and 4 corner shapes. The center Tinki logo adapts automatically to your QR color, and a built-in readability check verifies it scans cleanly",
  ],
  [
    "What analytics does the dashboard track?",
    "Your dashboard tracks profile views, social icon clicks, custom link clicks, top platforms, and views by country. Your own visits are automatically excluded",
  ],
  [
    "Can visitors switch languages or use Arabic RTL?",
    "Yes. Tinki supports English, French, Spanish, German and Arabic across both the landing page and dashboard, including full right-to-left Arabic layout mirroring",
  ],
  [
    "Can I change my password or delete my account?",
    "Yes. Manage your profile info, connected sign-in methods, email password recovery and permanent account deletion directly inside your dashboard",
  ],
];

/**
 * Exhaustive list of all English UI strings introduced or shown on the rebuilt
 * landing page & mockups. Used by tests/landing-i18n.test.ts to guarantee
 * zero missing keys in i18n-fr, i18n-es, i18n-de, and i18n-ar.
 */
export const LANDING_TRANSLATION_KEYS: readonly string[] = [
  ...LANDING_NAV.map((item) => item.label),
  "Features",
  "Customization",
  "QR Studio",
  "Analytics",
  "FAQ",
  "How it works",
  "Language",
  "Main",
  "Open menu",
  "Log in",
  "Dashboard",
  "Open your dashboard",
  "Create account",
  "Explore what's included",
  "Your links, style, and QR code",
  "All in one personal page",
  "Collect 16 social profiles and custom links, style your card with covers and video backgrounds, share a custom QR code, and see every visit by link and country",
  "Supported platforms include",
  "all 16 platforms supported",
  "Scan to open",
  "Everything your page can do",
  "Built for every detail visitors see",
  "From the cover banner and social icon order to QR scan checks and visitor countries, every tool works together in one workspace",
  "Social profiles & custom links",
  "Connect 16 social networks plus website, phone and email links",
  "Drag rows to set your icon order, pick from 19 link icons, and flip individual links on or off without losing saved details",
  "Portfolio",
  "My online shop",
  "Work with me",
  "Studio booking",
  "Active",
  "Cover banners & public QR button",
  "Stand out before visitors scroll",
  "Upload a profile picture and cover banner with adjustable horizontal and vertical focus, and toggle the quick-share QR button right on your public page",
  "Five languages with Arabic RTL",
  "Speak every visitor's language",
  "Switch instantly between English, Français, Español, Deutsch and العربية in the header or Settings with automatic right-to-left layout support",
  "Safety checks before you publish",
  "Contrast & QR scan verification",
  "Get warned when text contrast is too low or a styled QR loses contrast, then fix readability in one click",
  "Account & security control",
  "Stay signed in your way",
  "Sign in with Google or email, protect unsaved edits with exit guards, recover your password by email, or delete your account cleanly anytime",
  "Interactive preview",
  "One profile. Live theme switching",
  "Preview how the public page responds in real time — pick a ready-made theme below to update the background, card gradient, typography and icon colors",
  "Public QR button",
  "Visible",
  "Hidden",
  ...LANDING_THEME_PRESETS.map((theme) => theme.label),
  "Make every screen feel like you",
  "Customize your card and background without limits",
  "Set ready-made themes in one tap or fine-tune page gradients, repeated pattern presets, uploaded looping videos, card colors and link icon palettes",
  "Typography for name & bio",
  "Choose from 5 curated typefaces with custom weights, italic styles, colors and live contrast checking",
  ...FONT_SHOWCASE.map((f) => f.sample),
  ...BACKGROUND_MODES.flatMap((m) => [m.label, m.summary]),
  "Gradient",
  "Photo preset",
  "Looping video",
  "Your branded QR, verified to scan",
  "Click a preset, dot shape or corner eye below — the center Tinki logo automatically adapts to your chosen QR color inside a clean medallion",
  "Quick styles",
  "Dot shape",
  "Corner shape",
  "Readable — scanned and verified",
  "Logo tinted dynamically to match QR color",
  "Profile photo medallion centered at top",
  "Real scan verification before saving",
  "High-resolution PNG download",
  "Download as PNG",
  ...LANDING_QR_PRESETS.map((p) => p.label),
  ...LANDING_DOT_SHAPES.map((s) => s.label),
  ...LANDING_EYE_SHAPES.map((e) => e.label),
  "Know who visits and where from",
  "See profile views, social icon taps, custom link clicks and visitor countries — while your own preview visits are never counted",
  "Illustration with sample numbers — not real user data",
  "Sample data",
  "Profile Views",
  "Social Clicks",
  "Custom Link Clicks",
  "Views this week",
  "Clicks by platform",
  "Views by Country",
  ...ANALYTICS_COUNTRY_MOCK.map((c) => c.name),
  "Live in three steps",
  "Eight focused sections in one dashboard",
  "Everything you manage after signing in lives in one clean workspace",
  ...WORKFLOW_STEPS.flatMap((s) => [s.title, s.body]),
  ...DASHBOARD_MODULES.flatMap((m) => [m.title, m.body]),
  "Questions, answered",
  ...LANDING_FAQ.flatMap(([q, a]) => [q, a]),
  "Ready to bring every link together?",
  "Set up your page, style your QR code and share one link everywhere",
  "Share",
  "One personal page for social profiles, custom links, covers, analytics and QR codes",
  "Product",
  "Account",
  "All rights reserved",
  "Powered by Tinki",
  "Show QR code",
  "Product designer in Algiers. Portfolio, shop and everything I post — right here",
];
