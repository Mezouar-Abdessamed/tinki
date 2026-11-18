import type { Profile } from "@/lib/profiles";
import { RESERVED_USERNAMES, SOCIAL_PLATFORMS, usernameSchema } from "@/lib/profile-validation";

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const VALID_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export const BG_TYPES = ["default", "solid", "linear", "radial"] as const;
export const IMAGE_MODES = ["cover", "repeat"] as const;
export const MEDIA_TYPES = ["image", "video"] as const;
export const FONT_FAMILIES = ["display", "sans", "serif", "mono", "condensed"] as const;
export const FONT_STYLES = ["normal", "italic"] as const;
export const QR_ERROR_CORRECTIONS = ["L", "M", "Q", "H"] as const;
export const QR_MODULE_SHAPES = ["square", "rounded", "dots", "classy", "diamond"] as const;
export const QR_EYE_SHAPES = ["square", "rounded", "circle", "leaf"] as const;

const BG_TYPE_SET = new Set<string>(BG_TYPES);
const IMAGE_MODE_SET = new Set<string>(IMAGE_MODES);
const MEDIA_TYPE_SET = new Set<string>(MEDIA_TYPES);
const FONT_FAMILY_SET = new Set<string>(FONT_FAMILIES);
const FONT_STYLE_SET = new Set<string>(FONT_STYLES);
const QR_EC_SET = new Set<string>(QR_ERROR_CORRECTIONS);
const QR_MODULE_SET = new Set<string>(QR_MODULE_SHAPES);
const QR_EYE_SET = new Set<string>(QR_EYE_SHAPES);

const utf8Encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).byteLength;
}

/**
 * Truncates a string so its UTF-8 byte length is <= maxBytes (matching
 * Firestore Security Rules' `string.size()`), without splitting surrogate pairs.
 */
export function truncateUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0 || value.length === 0) return "";
  if (utf8ByteLength(value) <= maxBytes) return value;

  let out = "";
  let bytes = 0;
  for (const ch of value) {
    const chBytes = utf8Encoder.encode(ch).byteLength;
    if (bytes + chBytes > maxBytes) break;
    out += ch;
    bytes += chBytes;
  }
  return out;
}

export function optStr(value: unknown, maxBytes: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const bounded = truncateUtf8(trimmed, maxBytes).trim();
  return bounded ? bounded : null;
}

export function clamp(num: unknown, min: number, max: number, fallback: number): number {
  if (typeof num !== "number" || !Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function hexOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed : null;
}

export function hexOrFallback(value: unknown, fallback: string): string {
  return hexOrNull(value) ?? fallback;
}

export function enumOrFallback<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  fallback: T,
): T {
  return typeof value === "string" && allowed.has(value) ? (value as T) : fallback;
}

export const PROFILE_DEFAULTS: Omit<Profile, "id" | "username" | "created_at" | "updated_at"> & {
  verified: boolean;
} = {
  display_name: null,
  bio: null,
  avatar_path: null,
  cover_photo_path: null,
  cover_photo_x: 50,
  cover_photo_y: 50,
  show_qr_button: true,
  verified: false,
  instagram_url: null,
  facebook_url: null,
  tiktok_url: null,
  snapchat_url: null,
  linkedin_url: null,
  x_url: null,
  youtube_url: null,
  whatsapp_url: null,
  telegram_url: null,
  discord_url: null,
  github_url: null,
  steam_url: null,
  epicgames_url: null,
  threads_url: null,
  reddit_url: null,
  twitch_url: null,
  card_background_type: "default",
  card_background_color: "#222634",
  card_gradient_color: "#173D38",
  card_gradient_angle: 135,
  social_icon_color: null,
  social_icon_bg_color: null,
  page_background_type: "solid",
  page_background_color: "#10131A",
  page_gradient_color: "#173D38",
  page_gradient_angle: 135,
  page_background_image_url: null,
  page_background_image_mode: "cover",
  page_background_use_image: false,
  page_background_video_url: null,
  page_background_media_type: "image",
  name_font_family: "display",
  name_font_weight: 600,
  name_font_style: "normal",
  bio_font_family: "sans",
  bio_font_weight: 400,
  bio_font_style: "normal",
  name_color: null,
  bio_color: null,
  qr_foreground_color: "#0d1117",
  qr_background_color: "#ffffff",
  qr_margin: 4,
  qr_error_correction: "M",
  qr_module_shape: "square",
  qr_eye_shape: "square",
};

export function isValidFirestoreId(id: string): boolean {
  return VALID_ID_RE.test(id);
}

export function buildUsernameClaimPayload<T>(params: {
  username: string;
  ownerId: string;
  createdAt: T;
}): { username: string; owner_id: string; created_at: T } {
  const parsed = usernameSchema.safeParse(params.username);
  if (!parsed.success || RESERVED_USERNAMES.has(parsed.data)) {
    throw new Error(
      parsed.success
        ? "That username is reserved"
        : (parsed.error.issues[0]?.message ?? "Invalid username"),
    );
  }
  if (!isValidFirestoreId(params.ownerId)) {
    throw new Error("Invalid user ID");
  }
  return {
    username: parsed.data,
    owner_id: params.ownerId,
    created_at: params.createdAt,
  };
}

export function buildCreateProfilePayload<T>(params: {
  uid: string;
  username: string;
  displayName?: string | null | undefined;
  seed?: Partial<Profile> | undefined;
  createdAt: T;
  updatedAt: T;
}): Record<string, unknown> {
  const parsed = usernameSchema.safeParse(params.username);
  if (!parsed.success || RESERVED_USERNAMES.has(parsed.data)) {
    throw new Error(
      parsed.success
        ? "That username is reserved"
        : (parsed.error.issues[0]?.message ?? "Invalid username"),
    );
  }
  if (!isValidFirestoreId(params.uid)) {
    throw new Error("Invalid user ID");
  }

  const username = parsed.data;
  const seed = params.seed;

  const payload: Record<string, unknown> = {
    id: params.uid,
    username,
    display_name: optStr(seed?.display_name ?? params.displayName ?? null, 80),
    bio: optStr(seed?.bio ?? null, 50),
    avatar_path: optStr(seed?.avatar_path ?? null, 256),
    cover_photo_path: optStr(seed?.cover_photo_path ?? null, 256),
    cover_photo_x: clamp(seed?.cover_photo_x, 0, 100, PROFILE_DEFAULTS.cover_photo_x),
    cover_photo_y: clamp(seed?.cover_photo_y, 0, 100, PROFILE_DEFAULTS.cover_photo_y),
    show_qr_button:
      typeof seed?.show_qr_button === "boolean"
        ? seed.show_qr_button
        : Boolean(PROFILE_DEFAULTS.show_qr_button),
    verified: username === "abdessamed",
    instagram_url: optStr(seed?.instagram_url ?? null, 300),
    facebook_url: optStr(seed?.facebook_url ?? null, 300),
    tiktok_url: optStr(seed?.tiktok_url ?? null, 300),
    snapchat_url: optStr(seed?.snapchat_url ?? null, 300),
    linkedin_url: optStr(seed?.linkedin_url ?? null, 300),
    x_url: optStr(seed?.x_url ?? null, 300),
    youtube_url: optStr(seed?.youtube_url ?? null, 300),
    whatsapp_url: optStr(seed?.whatsapp_url ?? null, 300),
    telegram_url: optStr(seed?.telegram_url ?? null, 300),
    discord_url: optStr(seed?.discord_url ?? null, 300),
    github_url: optStr(seed?.github_url ?? null, 300),
    steam_url: optStr(seed?.steam_url ?? null, 300),
    epicgames_url: optStr(seed?.epicgames_url ?? null, 300),
    threads_url: optStr(seed?.threads_url ?? null, 300),
    reddit_url: optStr(seed?.reddit_url ?? null, 300),
    twitch_url: optStr(seed?.twitch_url ?? null, 300),
    card_background_type: enumOrFallback(
      seed?.card_background_type,
      BG_TYPE_SET,
      PROFILE_DEFAULTS.card_background_type,
    ),
    card_background_color: hexOrFallback(
      seed?.card_background_color,
      PROFILE_DEFAULTS.card_background_color,
    ),
    card_gradient_color: hexOrFallback(
      seed?.card_gradient_color,
      PROFILE_DEFAULTS.card_gradient_color,
    ),
    card_gradient_angle: clamp(
      seed?.card_gradient_angle,
      0,
      360,
      PROFILE_DEFAULTS.card_gradient_angle,
    ),
    social_icon_color: hexOrNull(seed?.social_icon_color),
    social_icon_bg_color: hexOrNull(seed?.social_icon_bg_color),
    page_background_type: enumOrFallback(
      seed?.page_background_type,
      BG_TYPE_SET,
      PROFILE_DEFAULTS.page_background_type,
    ),
    page_background_color: hexOrFallback(
      seed?.page_background_color,
      PROFILE_DEFAULTS.page_background_color,
    ),
    page_gradient_color: hexOrFallback(
      seed?.page_gradient_color,
      PROFILE_DEFAULTS.page_gradient_color,
    ),
    page_gradient_angle: clamp(
      seed?.page_gradient_angle,
      0,
      360,
      PROFILE_DEFAULTS.page_gradient_angle,
    ),
    page_background_image_url: optStr(seed?.page_background_image_url ?? null, 500),
    page_background_image_mode: enumOrFallback(
      seed?.page_background_image_mode,
      IMAGE_MODE_SET,
      PROFILE_DEFAULTS.page_background_image_mode,
    ),
    page_background_use_image:
      typeof seed?.page_background_use_image === "boolean"
        ? seed.page_background_use_image
        : PROFILE_DEFAULTS.page_background_use_image,
    page_background_video_url: optStr(seed?.page_background_video_url ?? null, 500),
    page_background_media_type: enumOrFallback(
      seed?.page_background_media_type,
      MEDIA_TYPE_SET,
      PROFILE_DEFAULTS.page_background_media_type,
    ),
    name_font_family: enumOrFallback(
      seed?.name_font_family,
      FONT_FAMILY_SET,
      PROFILE_DEFAULTS.name_font_family,
    ),
    name_font_weight: clamp(seed?.name_font_weight, 100, 900, PROFILE_DEFAULTS.name_font_weight),
    name_font_style: enumOrFallback(
      seed?.name_font_style,
      FONT_STYLE_SET,
      PROFILE_DEFAULTS.name_font_style,
    ),
    bio_font_family: enumOrFallback(
      seed?.bio_font_family,
      FONT_FAMILY_SET,
      PROFILE_DEFAULTS.bio_font_family,
    ),
    bio_font_weight: clamp(seed?.bio_font_weight, 100, 900, PROFILE_DEFAULTS.bio_font_weight),
    bio_font_style: enumOrFallback(
      seed?.bio_font_style,
      FONT_STYLE_SET,
      PROFILE_DEFAULTS.bio_font_style,
    ),
    name_color: hexOrNull(seed?.name_color),
    bio_color: hexOrNull(seed?.bio_color),
    qr_foreground_color: hexOrFallback(
      seed?.qr_foreground_color,
      PROFILE_DEFAULTS.qr_foreground_color,
    ),
    qr_background_color: hexOrFallback(
      seed?.qr_background_color,
      PROFILE_DEFAULTS.qr_background_color,
    ),
    qr_margin: Math.round(clamp(seed?.qr_margin, 0, 10, PROFILE_DEFAULTS.qr_margin)),
    qr_error_correction: enumOrFallback(
      seed?.qr_error_correction,
      QR_EC_SET,
      PROFILE_DEFAULTS.qr_error_correction,
    ),
    qr_module_shape: enumOrFallback(
      seed?.qr_module_shape,
      QR_MODULE_SET,
      PROFILE_DEFAULTS.qr_module_shape,
    ),
    qr_eye_shape: enumOrFallback(seed?.qr_eye_shape, QR_EYE_SET, PROFILE_DEFAULTS.qr_eye_shape),
    created_at: params.createdAt,
    updated_at: params.updatedAt,
  };

  for (const p of SOCIAL_PLATFORMS) {
    payload[p.field] = optStr(seed?.[p.field] ?? null, 300);
  }

  return payload;
}
