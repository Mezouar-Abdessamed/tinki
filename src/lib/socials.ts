import { z } from "zod";

export type SocialKey =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "snapchat"
  | "linkedin"
  | "x"
  | "youtube"
  | "whatsapp"
  | "telegram"
  | "discord"
  | "github"
  | "steam"
  | "epicgames"
  | "threads"
  | "reddit"
  | "twitch";

export type SocialField =
  | "instagram_url"
  | "facebook_url"
  | "tiktok_url"
  | "snapchat_url"
  | "linkedin_url"
  | "x_url"
  | "youtube_url"
  | "whatsapp_url"
  | "telegram_url"
  | "discord_url"
  | "github_url"
  | "steam_url"
  | "epicgames_url"
  | "threads_url"
  | "reddit_url"
  | "twitch_url";

export type SocialPlatform = {
  key: SocialKey;
  field: SocialField;
  label: string;
  hosts: string[];
  placeholder: string;
  tint: string;
};

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    key: "instagram",
    field: "instagram_url",
    label: "Instagram",
    hosts: ["instagram.com"],
    placeholder: "https://instagram.com/yourname",
    tint: "oklch(0.68 0.2 15)",
  },
  {
    key: "facebook",
    field: "facebook_url",
    label: "Facebook",
    hosts: ["facebook.com", "fb.com", "m.facebook.com"],
    placeholder: "https://facebook.com/yourname",
    tint: "oklch(0.6 0.19 260)",
  },
  {
    key: "tiktok",
    field: "tiktok_url",
    label: "TikTok",
    hosts: ["tiktok.com"],
    placeholder: "https://tiktok.com/@yourname",
    tint: "oklch(0.78 0.16 195)",
  },
  {
    key: "snapchat",
    field: "snapchat_url",
    label: "Snapchat",
    hosts: ["snapchat.com"],
    placeholder: "https://snapchat.com/add/yourname",
    tint: "oklch(0.9 0.18 100)",
  },
  {
    key: "linkedin",
    field: "linkedin_url",
    label: "LinkedIn",
    hosts: ["linkedin.com"],
    placeholder: "https://linkedin.com/in/yourname",
    tint: "oklch(0.62 0.14 240)",
  },
  {
    key: "x",
    field: "x_url",
    label: "X",
    hosts: ["x.com", "twitter.com"],
    placeholder: "https://x.com/yourname",
    tint: "oklch(0.9 0.005 250)",
  },
  {
    key: "youtube",
    field: "youtube_url",
    label: "YouTube",
    hosts: ["youtube.com", "youtu.be"],
    placeholder: "https://youtube.com/@yourname",
    tint: "oklch(0.62 0.22 25)",
  },
  {
    key: "whatsapp",
    field: "whatsapp_url",
    label: "WhatsApp",
    hosts: ["wa.me", "whatsapp.com"],
    placeholder: "https://wa.me/213600000000",
    tint: "oklch(0.75 0.17 150)",
  },
  {
    key: "telegram",
    field: "telegram_url",
    label: "Telegram",
    hosts: ["t.me", "telegram.me", "telegram.org"],
    placeholder: "https://t.me/yourname",
    tint: "oklch(0.72 0.13 235)",
  },
  {
    key: "discord",
    field: "discord_url",
    label: "Discord",
    hosts: ["discord.gg", "discord.com", "discordapp.com"],
    placeholder: "https://discord.gg/yourserver",
    tint: "oklch(0.65 0.16 275)",
  },
  {
    key: "github",
    field: "github_url",
    label: "GitHub",
    hosts: ["github.com"],
    placeholder: "https://github.com/yourname",
    tint: "oklch(0.85 0.01 250)",
  },
  {
    key: "steam",
    field: "steam_url",
    label: "Steam",
    hosts: ["steamcommunity.com", "steampowered.com"],
    placeholder: "https://steamcommunity.com/id/yourname",
    tint: "oklch(0.55 0.06 250)",
  },
  {
    key: "epicgames",
    field: "epicgames_url",
    label: "Epic Games",
    hosts: ["epicgames.com"],
    placeholder: "https://store.epicgames.com/u/yourid",
    tint: "oklch(0.8 0.01 250)",
  },
  {
    key: "threads",
    field: "threads_url",
    label: "Threads",
    hosts: ["threads.net", "threads.com"],
    placeholder: "https://threads.net/@yourname",
    tint: "oklch(0.88 0.005 250)",
  },
  {
    key: "reddit",
    field: "reddit_url",
    label: "Reddit",
    hosts: ["reddit.com"],
    placeholder: "https://reddit.com/user/yourname",
    tint: "oklch(0.7 0.19 40)",
  },
  {
    key: "twitch",
    field: "twitch_url",
    label: "Twitch",
    hosts: ["twitch.tv"],
    placeholder: "https://twitch.tv/yourname",
    tint: "oklch(0.65 0.19 300)",
  },
];

/** Host must equal an allowed host or be a subdomain of it. */
function hostMatches(host: string, allowed: string[]) {
  const clean = host.toLowerCase().replace(/^www\./, "");
  return allowed.some((entry) => clean === entry || clean.endsWith(`.${entry}`));
}

/** Add https:// when the user pastes a link without a protocol. */
export function normalizeSocialUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value.replace(/^\/+/, "")}`;
}

export function validateSocialUrl(platform: SocialPlatform, raw: string): string | null {
  const value = normalizeSocialUrl(raw);
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return `Enter a valid link, like ${platform.placeholder}`;
  }

  if (parsed.protocol !== "https:") return "The link must start with https://";
  if (!hostMatches(parsed.hostname, platform.hosts)) {
    return `That doesn't look like a ${platform.label} link`;
  }
  if (parsed.pathname === "/" || parsed.pathname === "") {
    return `Add your ${platform.label} profile path, not just the site`;
  }
  return null;
}

export const RESERVED_USERNAMES = new Set([
  "admin",
  "login",
  "register",
  "dashboard",
  "api",
  "settings",
  "about",
  "contact",
  "terms",
  "privacy",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "_next",
  "auth",
  "forgot-password",
  "reset-password",
  "profile",
  "signup",
  "signin",
  "logout",
  "help",
  "support",
  "pricing",
  "blog",
  "assets",
  "static",
  "public",
  "me",
  "u",
  "user",
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Username must be at least 1 character")
  .max(20, "Username must be 20 characters or fewer")
  .regex(/^[a-z0-9_-]+$/, "Use only lowercase letters, numbers, _ and -")
  .refine((value) => !RESERVED_USERNAMES.has(value), "That username is reserved");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-zA-Z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, "Enter a valid email address")
  .max(254, "That email address is too long")
  .email("Enter a valid email address")
  // Requires text@domain.tld: no missing @, no missing local part, no bare domain.
  .regex(
    /^[^\s@]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/,
    "Enter a valid email address, like you@example.com",
  );

/** First human-readable message from a zod error. */
export function firstError(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "That value isn't valid";
}
