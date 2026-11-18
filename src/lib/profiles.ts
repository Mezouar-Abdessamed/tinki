import type { CSSProperties } from "react";

import { apiFetch, storageApi } from "@/lib/api-client";
import type { SocialField } from "@/lib/profile-validation";

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
  {
    value: "display",
    label: "Space Grotesk",
    stack: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
  },
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
  const color =
    typeof typography.color === "string" && typography.color.trim() !== ""
      ? typography.color.trim()
      : null;
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
  { label: "Floral", url: "/presets/floral.svg" },
  { label: "Geometric", url: "/presets/geometric.svg" },
  { label: "Clouds", url: "/presets/clouds.svg" },
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
  if (
    !usesVideo &&
    appearance.page_background_use_image &&
    typeof image === "string" &&
    image.trim() !== ""
  ) {
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

export async function getAvatarUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  return storageApi.mediaUrl("avatars", path);
}

export async function getCoverUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  return storageApi.mediaUrl("covers", path);
}

// Backgrounds we uploaded ourselves live in the "backgrounds" bucket as
// "<user id>/<file>", supporting both Firebase Auth UIDs and UUIDs.
const BACKGROUND_STORAGE_PATH =
  /^[A-Za-z0-9_-]{8,128}\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** True only for a safe "<user id>/<file>" path inside the backgrounds bucket. */
export function isBackgroundStoragePath(value: string): boolean {
  if (!BACKGROUND_STORAGE_PATH.test(value)) return false;
  return !value.split("/").some((part) => part === "." || part === "..");
}

/**
 * Turns a stored background value into something the page can display: preset and
 * external links pass through untouched, our own uploads resolve to /media/backgrounds/...
 */
export async function getBackgroundUrl(value: string | null | undefined): Promise<string | null> {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed === "") return null;
  if (trimmed.startsWith("/") || /^(https?:|blob:|data:)/i.test(trimmed)) return trimmed;
  if (!isBackgroundStoragePath(trimmed)) return null;
  return storageApi.mediaUrl("backgrounds", trimmed);
}

export async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  if (typeof window !== "undefined") {
    const { fetchProfileByUsernameFirestore } = await import("@/lib/firestore-repository");
    return await fetchProfileByUsernameFirestore(username);
  }
  const { profile } = await apiFetch<{ profile: Profile | null }>(
    `/api/profiles/by-username/${encodeURIComponent(username.toLowerCase())}`,
  );
  return profile ?? null;
}

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  if (typeof window !== "undefined" && userId) {
    const { auth: fbAuth, fetchProfileByIdFirestore } = await import("@/lib/firestore-repository");
    if (fbAuth.currentUser?.uid === userId) {
      return await fetchProfileByIdFirestore(userId);
    }
  }
  const { profile } = await apiFetch<{ profile: Profile | null }>("/api/profiles/me");
  return profile ?? null;
}

export async function createMyProfile(username: string): Promise<Profile> {
  if (typeof window !== "undefined") {
    const { auth: fbAuth, createProfileFirestore } = await import("@/lib/firestore-repository");
    if (fbAuth.currentUser) {
      return await createProfileFirestore(username);
    }
  }
  const { profile } = await apiFetch<{ profile: Profile }>("/api/profiles", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
  return profile;
}

export async function updateMyProfile(patch: Partial<Profile>): Promise<Profile> {
  if (typeof window !== "undefined") {
    const { auth: fbAuth, updateMyProfileFirestore } = await import("@/lib/firestore-repository");
    if (fbAuth.currentUser) {
      return await updateMyProfileFirestore(patch);
    }
  }
  const { profile } = await apiFetch<{ profile: Profile }>("/api/profiles/me", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return profile;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const clean = username.toLowerCase();
  if (typeof window !== "undefined") {
    const { checkUsernameAvailableFirestore } = await import("@/lib/firestore-repository");
    return await checkUsernameAvailableFirestore(clean);
  }
  const { available } = await apiFetch<{ available: boolean }>(
    `/api/usernames/available?username=${encodeURIComponent(clean)}`,
  );
  return Boolean(available);
}

export function isUsernameTakenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; details?: string; hint?: string };
  const text = [e.message, e.details, e.hint].filter(Boolean).join(" ").toLowerCase();
  const uniqueViolation = e.code === "23505" || /duplicate key|unique constraint/.test(text);
  return uniqueViolation && (text.includes("username") || text.includes("taken"));
}

export function profileUrl(username: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/${username}`;
}

export async function createProfileFromStoredUsername(
  _userId: string,
  storedUsername: unknown,
): Promise<Profile | null> {
  if (typeof storedUsername !== "string") return null;
  const username = storedUsername.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,20}$/.test(username)) return null;
  if (!(await isUsernameAvailable(username))) return null;

  try {
    return await createMyProfile(username);
  } catch {
    return null;
  }
}
