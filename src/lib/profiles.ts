import type { CSSProperties } from "react";

import bg1 from "@/assets/rbg1.jpeg.asset.json";
import bg2 from "@/assets/rbg2.jpeg.asset.json";
import bg3 from "@/assets/rbg3.png.asset.json";
import { supabase } from "@/lib/app-supabase";
import type { SocialField } from "@/lib/socials";

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_path: string | null;
  cover_photo_path: string | null;
  cover_photo_x: number;
  cover_photo_y: number;
  show_qr_button?: boolean;
  created_at: string;
  updated_at: string;
  card_background_type: CardBackgroundType;
  card_background_color: string;
  card_gradient_color: string;
  card_gradient_angle: number;
  social_icon_color: string | null;
  social_icon_bg_color: string | null;
  page_background_type: CardBackgroundType;
  page_background_color: string;
  page_gradient_color: string;
  page_gradient_angle: number;
  page_background_image_url: string | null;
  page_background_image_mode: PageImageMode;
  page_background_use_image: boolean;
  page_background_video_url: string | null;
  page_background_media_type: PageMediaType;
  name_font_family: FontFamilyKey;
  name_font_weight: number;
  name_font_style: FontStyleKey;
  bio_font_family: FontFamilyKey;
  bio_font_weight: number;
  bio_font_style: FontStyleKey;
  name_color: string | null;
  bio_color: string | null;
  qr_foreground_color: string;
  qr_background_color: string;
  qr_margin: number;
  qr_error_correction: string;
  qr_module_shape: string;
  qr_eye_shape: string;
} & Record<SocialField, string | null>;

export type FontFamilyKey = "display" | "sans" | "serif" | "mono" | "condensed";
export type FontStyleKey = "normal" | "italic";

export const FONT_FAMILIES: Array<{ value: FontFamilyKey; label: string; stack: string }> = [
  { value: "display", label: "Space Grotesk", stack: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif' },
  { value: "sans", label: "DM Sans", stack: '"DM Sans", ui-sans-serif, system-ui, sans-serif' },
  { value: "serif", label: "Playfair Display", stack: '"Playfair Display", Georgia, serif' },
  { value: "mono", label: "JetBrains Mono", stack: '"JetBrains Mono", ui-monospace, monospace' },
  { value: "condensed", label: "Oswald", stack: 'Oswald, "DM Sans", sans-serif' },
];

export const FONT_WEIGHTS: Array<{ value: number; label: string }> = [
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
];

export const FONT_STYLES: Array<{ value: FontStyleKey; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "italic", label: "Italic" },
];

export type TextTypography = {
  family?: FontFamilyKey | string | null;
  weight?: number | null;
  style?: FontStyleKey | string | null;
  color?: string | null;
};

export const DEFAULT_NAME_COLOR = "#F4F7FB";
export const DEFAULT_BIO_COLOR = "#9AA3B2";

/** Inline CSS for the display name / bio typography chosen in Customize profile. */
export function textTypographyStyle(typography: TextTypography): {
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: string;
  color?: string;
} {
  const font = FONT_FAMILIES.find((item) => item.value === typography.family);
  const weight = FONT_WEIGHTS.find((item) => item.value === typography.weight);
  const style = typography.style === "italic" ? "italic" : "normal";
  const color = typeof typography.color === "string" && typography.color.trim() !== "" ? typography.color.trim() : null;
  return {
    ...(font ? { fontFamily: font.stack } : {}),
    ...(weight ? { fontWeight: weight.value } : {}),
    fontStyle: style,
    ...(color ? { color } : {}),
  };
}

export type CardBackgroundType = "default" | "solid" | "linear" | "radial";

export type CardAppearance = {
  card_background_type?: CardBackgroundType | null;
  card_background_color?: string | null;
  card_gradient_color?: string | null;
  card_gradient_angle?: number | null;
  social_icon_color?: string | null;
  social_icon_bg_color?: string | null;
};

export type PageImageMode = "cover" | "repeat";
export type PageMediaType = "image" | "video";

export type PageAppearance = {
  page_background_type?: CardBackgroundType | null;
  page_background_color?: string | null;
  page_gradient_color?: string | null;
  page_gradient_angle?: number | null;
  page_background_image_url?: string | null;
  page_background_image_mode?: PageImageMode | string | null;
  page_background_use_image?: boolean | null;
  page_background_video_url?: string | null;
  page_background_media_type?: PageMediaType | string | null;
};

export const PAGE_BACKGROUND_PRESETS: Array<{ label: string; url: string }> = [
  { label: "Floral", url: bg1.url },
  { label: "Geometric", url: bg2.url },
  { label: "Clouds", url: bg3.url },
];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

export function profileCardBackground(appearance: CardAppearance): string | undefined {
  const type = appearance.card_background_type ?? "default";
  const first = appearance.card_background_color;
  const second = appearance.card_gradient_color;
  if (type === "default" || !first || !HEX_COLOR.test(first)) return undefined;
  if (type === "solid") return first;
  if (!second || !HEX_COLOR.test(second)) return undefined;
  if (type === "radial") return `radial-gradient(circle at top, ${first}, ${second})`;
  const angle = Math.min(360, Math.max(0, appearance.card_gradient_angle ?? 135));
  return `linear-gradient(${angle}deg, ${first}, ${second})`;
}

export function profilePageBackground(appearance: PageAppearance): string | undefined {
  const type = appearance.page_background_type ?? "solid";
  const first = appearance.page_background_color;
  const second = appearance.page_gradient_color;
  if (!first || !HEX_COLOR.test(first)) return undefined;
  if (type === "solid" || type === "default") return first;
  if (!second || !HEX_COLOR.test(second)) return undefined;
  if (type === "radial") return `radial-gradient(circle at top, ${first}, ${second})`;
  const angle = Math.min(360, Math.max(0, appearance.page_gradient_angle ?? 135));
  return `linear-gradient(${angle}deg, ${first}, ${second})`;
}

/** The uploaded background video to play behind the card, when one is chosen. */
export function profilePageVideoUrl(appearance: PageAppearance): string | null {
  if (!appearance.page_background_use_image) return null;
  if (appearance.page_background_media_type !== "video") return null;
  const url = appearance.page_background_video_url;
  return typeof url === "string" && url.trim() !== "" ? url.trim() : null;
}

/** Full CSS for the public page background: photo when chosen, otherwise the color/gradient. */
export function profilePageBackgroundStyle(appearance: PageAppearance): CSSProperties | undefined {
  const color = profilePageBackground(appearance);
  const image = appearance.page_background_image_url;
  const usesVideo = appearance.page_background_media_type === "video";
  if (!usesVideo && appearance.page_background_use_image && typeof image === "string" && image.trim() !== "") {
    const repeat = appearance.page_background_image_mode === "repeat";
    return {
      backgroundColor: color,
      backgroundImage: `url("${image}")`,
      backgroundRepeat: repeat ? "repeat" : "no-repeat",
      backgroundSize: repeat ? "auto" : "cover",
      backgroundPosition: "center",
      ...(repeat ? {} : { backgroundAttachment: "fixed" as const }),
    };
  }
  return color ? { background: color } : undefined;
}

export function socialIconStyles(appearance: CardAppearance): {
  wrapper: { background?: string; borderColor?: string };
  icon: { color?: string };
} {
  const bg = appearance.social_icon_bg_color;
  const icon = appearance.social_icon_color;
  return {
    wrapper: isHexColor(bg) ? { background: bg, borderColor: bg } : {},
    icon: isHexColor(icon) ? { color: icon } : {},
  };
}


// The "avatars" bucket is publicly readable, so a plain public URL is enough.
export async function getAvatarUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl ?? null;
}

// Cover images live in the public "covers" bucket, so a plain public URL is enough.
export async function getCoverUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("covers").getPublicUrl(path);
  return data.publicUrl ?? null;
}

const BACKGROUND_TTL_SECONDS = 60 * 60 * 24 * 7;

// Backgrounds we uploaded ourselves live in the "backgrounds" bucket as
// "<user id>/<file>", the same shape the appearance editor's cleanup relies on.
const BACKGROUND_STORAGE_PATH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** True only for a safe "<user id>/<file>" path inside the backgrounds bucket. */
export function isBackgroundStoragePath(value: string): boolean {
  if (!BACKGROUND_STORAGE_PATH.test(value)) return false;
  return !value.split("/").some((part) => part === "." || part === "..");
}

/**
 * Turns a stored background value into something the page can display: preset and
 * external links (and links saved before object paths were introduced) pass through
 * untouched, our own uploads get a short-lived signed URL, anything unusable is null.
 */
export async function getBackgroundUrl(value: string | null | undefined): Promise<string | null> {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed === "") return null;
  if (trimmed.startsWith("/") || /^(https?:|blob:|data:)/i.test(trimmed)) return trimmed;
  if (!isBackgroundStoragePath(trimmed)) return null;
  try {
    const { data, error } = await supabase.storage
      .from("backgrounds")
      .createSignedUrl(trimmed, BACKGROUND_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username.toLowerCase())
    .maybeSingle();

  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_username_available", {
    check_username: username.toLowerCase(),
  });
  if (error) throw error;
  return Boolean(data);
}

/**
 * True when an insert/update failed because the username was claimed between
 * the availability check and the write (Postgres unique violation, code 23505,
 * on the username constraint rather than the id primary key).
 */
export function isUsernameTakenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; details?: string; hint?: string };
  const text = [e.message, e.details, e.hint].filter(Boolean).join(" ").toLowerCase();
  const uniqueViolation = e.code === "23505" || /duplicate key|unique constraint/.test(text);
  return uniqueViolation && text.includes("username");
}

export function profileUrl(username: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/${username}`;
}

/**
 * People who sign up with email pick their username before confirming, so it is
 * kept with their account until they can create the page themselves.
 * Google users have no stored username, so they pick one in the dashboard.
 */
export async function createProfileFromStoredUsername(
  userId: string,
  storedUsername: unknown,
): Promise<Profile | null> {
  if (typeof storedUsername !== "string") return null;
  const username = storedUsername.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,20}$/.test(username)) return null;
  if (!(await isUsernameAvailable(username))) return null;

  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: userId, username })
    .select("*")
    .maybeSingle();

  if (error) return null;
  return (data as Profile | null) ?? null;
}
