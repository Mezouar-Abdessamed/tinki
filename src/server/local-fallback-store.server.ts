import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { AppTableRow } from "@/lib/database-types";
import { PAGE_BACKGROUND_PRESETS, type Profile } from "@/lib/profiles";
import {
  RESERVED_USERNAMES,
  SOCIAL_PLATFORMS,
  emailSchema,
  firstError,
  passwordSchema,
  socialLinkSettingsArraySchema,
  usernameSchema,
  validateSocialUrl,
  type SocialField,
  type SocialKey,
} from "@/lib/profile-validation";

export type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  providers: string[];
  emailVerified?: boolean;
  tokenVersion?: number;
  googleUid?: string;
  name?: string;
  username?: string;
  lastReauthAt?: number;
  createdAt: string;
};

export type PublicAuthUser = {
  id: string;
  email: string;
  user_metadata: { username?: string };
  identities: Array<{ provider: string }>;
};

export type AuthSessionPayload = {
  access_token: string;
  token_type: "bearer";
  expires_at: number;
  user: PublicAuthUser;
};

type CustomLinkRow = AppTableRow<"custom_links">;
type SocialLinkRow = AppTableRow<"social_link_settings">;
type EventRow = AppTableRow<"profile_events">;
type ProfileRow = Profile & { verified: boolean };

type ResetTokenRow = {
  tokenHash: string;
  userId: string;
  expiresAt: number;
};

export type PendingSignupRow = {
  id: string;
  email: string;
  passwordHash: string;
  username: string;
  createdAt: string;
  expiresAt: number;
};

export type ReleasedUsernameRow = {
  username: string;
  previousOwnerId: string;
  releasedAt: number;
  expiresAt: number;
};

type StoreData = {
  users: StoredUser[];
  profiles: ProfileRow[];
  customLinks: CustomLinkRow[];
  socialLinkSettings: SocialLinkRow[];
  profileEvents: EventRow[];
  resetTokens: ResetTokenRow[];
  pendingSignups: PendingSignupRow[];
  releasedUsernames: ReleasedUsernameRow[];
  deletedUserIds: string[];
};

function defaultDataDir(): string {
  return process.env["TINKI_DATA_DIR"] || "/tmp/tinki-data";
}
const DEMO_EMAIL = "demo@tinki.app";
const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const USERNAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const REAUTH_MAX_AGE_MS = 5 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const PENDING_SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;

export const ALLOWED_BUCKETS = new Set(["avatars", "covers", "backgrounds"]);
export const MAX_MEDIA_FILE_BYTES = 6 * 1024 * 1024;
export const MAX_USER_STORAGE_BYTES = 50 * 1024 * 1024;
export const MAX_FILES_PER_BUCKET = 20;

export type AllowedMediaMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "video/mp4"
  | "video/webm";

const IMAGE_MIME_TYPES = new Set<AllowedMediaMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const BACKGROUND_MIME_TYPES = new Set<AllowedMediaMimeType>([
  ...IMAGE_MIME_TYPES,
  "video/mp4",
  "video/webm",
]);

export const ALLOWED_MEDIA_MIME_BY_BUCKET: Record<string, Set<AllowedMediaMimeType>> = {
  avatars: IMAGE_MIME_TYPES,
  covers: IMAGE_MIME_TYPES,
  backgrounds: BACKGROUND_MIME_TYPES,
};

const CANONICAL_EXT_BY_MIME: Record<AllowedMediaMimeType, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

const MP4_BRANDS = new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
  "F4V ",
  "dash",
  "msnv",
]);

export function normalizeDeclaredMediaType(raw: string): string {
  return (raw.split(";")[0] ?? "").trim().toLowerCase();
}

export function detectMediaContentType(bytes: Buffer): AllowedMediaMimeType | null {
  if (bytes.byteLength < 3) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // GIF: GIF87a / GIF89a
  if (bytes.byteLength >= 6) {
    const gifSig = bytes.subarray(0, 6).toString("ascii");
    if (gifSig === "GIF87a" || gifSig === "GIF89a") {
      return "image/gif";
    }
  }

  // WebP: RIFF....WEBP
  if (
    bytes.byteLength >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  // MP4: ISO BMFF ftyp box with MP4 major or compatible brand
  if (bytes.byteLength >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const majorBrand = bytes.subarray(8, 12).toString("ascii");
    if (MP4_BRANDS.has(majorBrand)) {
      return "video/mp4";
    }
    const declaredBoxSize = bytes.readUInt32BE(0);
    const boxEnd = Math.min(
      bytes.byteLength,
      declaredBoxSize >= 16 && declaredBoxSize <= 256 ? declaredBoxSize : 64,
    );
    for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
      if (MP4_BRANDS.has(bytes.subarray(offset, offset + 4).toString("ascii"))) {
        return "video/mp4";
      }
    }
  }

  // WebM: EBML header 1A 45 DF A3 (and not explicitly matroska-only)
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    const headerAscii = bytes.subarray(0, Math.min(bytes.byteLength, 128)).toString("latin1");
    if (headerAscii.includes("matroska") && !headerAscii.includes("webm")) {
      return null;
    }
    return "video/webm";
  }

  return null;
}

export function isMediaTypeAllowedForBucket(
  bucket: string,
  mimeType: string,
): mimeType is AllowedMediaMimeType {
  const allowed = ALLOWED_MEDIA_MIME_BY_BUCKET[bucket];
  if (!allowed) return false;
  return allowed.has(mimeType as AllowedMediaMimeType);
}

const PROFILE_DEFAULTS: Omit<ProfileRow, "id" | "username" | "created_at" | "updated_at"> = {
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

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const SAFE_MEDIA_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BACKGROUND_PRESET_URLS = new Set(PAGE_BACKGROUND_PRESETS.map((preset) => preset.url));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasUnsafeControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function isSafeUserMediaPath(value: string, userId: string): boolean {
  if (!userId || hasUnsafeControlChars(value)) return false;
  if (!value.startsWith(`${userId}/`)) return false;
  const parts = value.split("/");
  if (parts.length !== 2) return false;
  const [owner, fileName] = parts;
  if (owner !== userId || !fileName) return false;
  if (fileName === "." || fileName === ".." || fileName.includes("..")) return false;
  if (fileName.toLowerCase().endsWith(".meta.json")) return false;
  return SAFE_MEDIA_FILE_RE.test(fileName);
}

function isStrictHttpsUrl(value: string, maxLength: number): boolean {
  if (value.length === 0 || value.length > maxLength) return false;
  if (hasUnsafeControlChars(value) || /[\s"'<>\\]/.test(value)) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === "https:" && parsed.hostname.length > 0;
}

const hexColorSchema = z
  .string()
  .regex(HEX_COLOR_RE, "Must be a 6-digit hex color like #1A2B3C");

const backgroundTypeSchema = z.enum(["default", "solid", "linear", "radial"]);
const fontFamilySchema = z.enum(["display", "sans", "serif", "mono", "condensed"]);
const fontStyleSchema = z.enum(["normal", "italic"]);
const fontWeightSchema = z
  .number()
  .finite()
  .int("Font weight must be a whole number")
  .min(100, "Font weight must be between 100 and 900")
  .max(900, "Font weight must be between 100 and 900");
const percentSchema = z
  .number()
  .finite("Percentage must be a finite number")
  .min(0, "Percentage must be between 0 and 100")
  .max(100, "Percentage must be between 0 and 100");
const angleSchema = z
  .number()
  .finite("Angle must be a finite number")
  .min(0, "Angle must be between 0 and 360")
  .max(360, "Angle must be between 0 and 360");

function buildProfileUpdateSchema(userId: string) {
  const ownMediaPathSchema = (fieldLabel: string) =>
    z
      .string()
      .max(256, `${fieldLabel} must be 256 characters or fewer`)
      .refine((value) => isSafeUserMediaPath(value, userId), {
        message: `${fieldLabel} must be a valid path inside your own media folder`,
      })
      .nullable()
      .optional();

  const backgroundMediaUrlSchema = (fieldLabel: string, allowPresets: boolean) =>
    z
      .string()
      .max(500, `${fieldLabel} must be 500 characters or fewer`)
      .superRefine((raw, ctx) => {
        const trimmed = raw.trim();
        if (!trimmed) return;
        const isAllowedPreset = allowPresets && BACKGROUND_PRESET_URLS.has(trimmed);
        if (
          !isAllowedPreset &&
          !isStrictHttpsUrl(trimmed, 500) &&
          !isSafeUserMediaPath(trimmed, userId)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${fieldLabel} must be an https:// URL or a path inside your own media folder`,
          });
        }
      })
      .transform((raw) => {
        const trimmed = raw.trim();
        return trimmed === "" ? null : trimmed;
      })
      .nullable()
      .optional();

  const socialFieldsSchema = {} as Record<SocialField, z.ZodTypeAny>;
  for (const platform of SOCIAL_PLATFORMS) {
    socialFieldsSchema[platform.field] = z
      .string()
      .max(300, `${platform.label}: Link must be 300 characters or fewer`)
      .superRefine((raw, ctx) => {
        const trimmed = raw.trim();
        if (!trimmed) return;
        if (!isStrictHttpsUrl(trimmed, 300)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${platform.label}: Link must be a valid https:// URL`,
          });
          return;
        }
        const err = validateSocialUrl(platform, trimmed);
        if (err) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${platform.label}: ${err}`,
          });
        }
      })
      .transform((raw) => {
        const trimmed = raw.trim();
        return trimmed === "" ? null : trimmed;
      })
      .nullable()
      .optional();
  }

  return z
    .object({
      username: usernameSchema.optional(),
      display_name: z
        .string()
        .max(80, "Display name must be 80 characters or fewer")
        .nullable()
        .optional(),
      bio: z.string().max(50, "Bio must be 50 characters or fewer").nullable().optional(),
      avatar_path: ownMediaPathSchema("avatar_path"),
      cover_photo_path: ownMediaPathSchema("cover_photo_path"),
      cover_photo_x: percentSchema.optional(),
      cover_photo_y: percentSchema.optional(),
      show_qr_button: z.boolean().optional(),
      ...socialFieldsSchema,
      card_background_type: backgroundTypeSchema.optional(),
      card_background_color: hexColorSchema.optional(),
      card_gradient_color: hexColorSchema.optional(),
      card_gradient_angle: angleSchema.optional(),
      social_icon_color: hexColorSchema.nullable().optional(),
      social_icon_bg_color: hexColorSchema.nullable().optional(),
      page_background_type: backgroundTypeSchema.optional(),
      page_background_color: hexColorSchema.optional(),
      page_gradient_color: hexColorSchema.optional(),
      page_gradient_angle: angleSchema.optional(),
      page_background_image_url: backgroundMediaUrlSchema("page_background_image_url", true),
      page_background_image_mode: z.enum(["cover", "repeat"]).optional(),
      page_background_use_image: z.boolean().optional(),
      page_background_video_url: backgroundMediaUrlSchema("page_background_video_url", false),
      page_background_media_type: z.enum(["image", "video"]).optional(),
      name_font_family: fontFamilySchema.optional(),
      name_font_weight: fontWeightSchema.optional(),
      name_font_style: fontStyleSchema.optional(),
      bio_font_family: fontFamilySchema.optional(),
      bio_font_weight: fontWeightSchema.optional(),
      bio_font_style: fontStyleSchema.optional(),
      name_color: hexColorSchema.nullable().optional(),
      bio_color: hexColorSchema.nullable().optional(),
      qr_foreground_color: hexColorSchema.optional(),
      qr_background_color: hexColorSchema.optional(),
      qr_margin: z
        .number()
        .finite("QR margin must be a finite number")
        .min(0, "QR margin must be between 0 and 10")
        .max(10, "QR margin must be between 0 and 10")
        .optional(),
      qr_error_correction: z.enum(["L", "M", "Q", "H"]).optional(),
      qr_module_shape: z.enum(["square", "rounded", "dots", "classy", "diamond"]).optional(),
      qr_eye_shape: z.enum(["square", "rounded", "circle", "leaf"]).optional(),
    })
    .strict();
}

function scryptAsync(password: string, salt: string, keylen = 64): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, hex] = parts;
  if (!salt || !hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = await scryptAsync(password, salt, 64);
  if (expected.length === 0 || expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLen), "base64").toString("utf8");
}

export class StoreError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "bad_request") {
    super(message);
    this.name = "StoreError";
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_PERSIST_DEBOUNCE_MS = 100;

export type TinkiStoreOptions = {
  persistDelayMs?: number | undefined;
};

export function isLocalStoreEnabled(): boolean {
  return process.env["NODE_ENV"] !== "production" && process.env["ENABLE_LOCAL_STORE"] === "true";
}

export class TinkiStore {
  private dataDir: string;
  private dbPath: string;
  private secret: string;
  private data: StoreData;
  private deletedUserIds = new Set<string>();
  private pendingDemoSeed: Promise<void> | null = null;
  private persistDelayMs: number;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistDirty = false;
  private writeInFlight: Promise<void> = Promise.resolve();

  constructor(dataDir = defaultDataDir(), options: TinkiStoreOptions = {}) {
    this.dataDir = dataDir;
    this.dbPath = path.join(dataDir, "db.json");
    this.persistDelayMs =
      typeof options.persistDelayMs === "number" && options.persistDelayMs >= 0
        ? options.persistDelayMs
        : DEFAULT_PERSIST_DEBOUNCE_MS;
    this.secret = this.loadOrCreateSecret();
    this.data = this.load();
    this.deletedUserIds = new Set(this.data.deletedUserIds);
    if (this.shouldSeedDemo()) {
      this.ensureDemoSeeded();
    } else {
      this.cleanupDemoSeed();
    }
  }

  private ensureDir(dir: string) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error(`[TinkiStore] Failed to create directory "${dir}":`, err);
    }
  }

  private loadOrCreateSecret(): string {
    const envSecret = process.env["AUTH_SECRET"];
    if (process.env["NODE_ENV"] === "production") {
      if (!envSecret || envSecret.length < 32) {
        throw new Error(
          "AUTH_SECRET environment variable must be set and at least 32 characters long in production.",
        );
      }
      return envSecret;
    }

    if (envSecret && envSecret.length >= 32) return envSecret;

    const secretFile = path.join(this.dataDir, ".secret");
    try {
      this.ensureDir(this.dataDir);
      if (fs.existsSync(secretFile)) {
        const existing = fs.readFileSync(secretFile, "utf8").trim();
        if (existing.length >= 32) return existing;
      }
      const generated = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(secretFile, generated, { mode: 0o600 });
      fs.chmodSync(secretFile, 0o600);
      return generated;
    } catch (err) {
      console.error(`[TinkiStore] Failed to load or persist session secret at "${secretFile}":`, err);
      return crypto.randomBytes(32).toString("hex");
    }
  }

  private load(): StoreData {
    try {
      const raw = fs.readFileSync(this.dbPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      return {
        users: parsed.users ?? [],
        profiles: parsed.profiles ?? [],
        customLinks: parsed.customLinks ?? [],
        socialLinkSettings: parsed.socialLinkSettings ?? [],
        profileEvents: parsed.profileEvents ?? [],
        resetTokens: (parsed.resetTokens ?? []).filter(
          (t): t is ResetTokenRow =>
            Boolean(t) && typeof (t as Partial<ResetTokenRow>).tokenHash === "string",
        ),
        pendingSignups: parsed.pendingSignups ?? [],
        releasedUsernames: Array.isArray(parsed.releasedUsernames)
          ? parsed.releasedUsernames.filter(
              (r): r is ReleasedUsernameRow =>
                Boolean(r) &&
                typeof r.username === "string" &&
                typeof r.previousOwnerId === "string" &&
                typeof r.releasedAt === "number" &&
                typeof r.expiresAt === "number" &&
                Number.isFinite(r.expiresAt),
            )
          : [],
        deletedUserIds: Array.isArray(parsed.deletedUserIds)
          ? parsed.deletedUserIds.filter((id): id is string => typeof id === "string")
          : [],
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT") {
        console.error(`[TinkiStore] Failed to load database file "${this.dbPath}":`, err);
      }
    }
    return {
      users: [],
      profiles: [],
      customLinks: [],
      socialLinkSettings: [],
      profileEvents: [],
      resetTokens: [],
      pendingSignups: [],
      releasedUsernames: [],
      deletedUserIds: [],
    };
  }

  private persist() {
    this.persistDirty = true;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flush();
    }, this.persistDelayMs);
    this.persistTimer.unref?.();
  }

  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }

    while (this.persistDirty) {
      this.persistDirty = false;
      const serialized = JSON.stringify(this.data, null, 2);
      const nextWrite = this.writeInFlight.then(async () => {
        try {
          await fs.promises.mkdir(this.dataDir, { recursive: true });
          const tmpPath = `${this.dbPath}.${crypto.randomUUID()}.tmp`;
          await fs.promises.writeFile(tmpPath, serialized, "utf8");
          await fs.promises.rename(tmpPath, this.dbPath);
        } catch (err) {
          console.error(`[TinkiStore] Failed to persist database file "${this.dbPath}":`, err);
        }
      });
      this.writeInFlight = nextWrite;
      await nextWrite;
    }

    await this.writeInFlight;
  }

  dispose(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
  }

  private shouldSeedDemo(): boolean {
    return process.env["NODE_ENV"] !== "production" && process.env["SEED_DEMO"] === "true";
  }

  private cleanupDemoSeed() {
    this.pendingDemoSeed = null;
    const demoIds = new Set<string>([DEMO_USER_ID]);
    for (const user of this.data.users) {
      if (user.email.toLowerCase() === DEMO_EMAIL) {
        demoIds.add(user.id);
      }
    }

    const prevUsers = this.data.users.length;
    const prevProfiles = this.data.profiles.length;
    const prevCustomLinks = this.data.customLinks.length;
    const prevSocialSettings = this.data.socialLinkSettings.length;
    const prevEvents = this.data.profileEvents.length;
    const prevResetTokens = this.data.resetTokens.length;
    const prevPending = this.data.pendingSignups.length;
    const prevReleased = this.data.releasedUsernames.length;

    this.data.users = this.data.users.filter(
      (u) => !demoIds.has(u.id) && u.email.toLowerCase() !== DEMO_EMAIL,
    );
    this.data.profiles = this.data.profiles.filter((p) => !demoIds.has(p.id));
    this.data.customLinks = this.data.customLinks.filter((l) => !demoIds.has(l.profile_id));
    this.data.socialLinkSettings = this.data.socialLinkSettings.filter(
      (s) => !demoIds.has(s.profile_id),
    );
    this.data.profileEvents = this.data.profileEvents.filter((e) => !demoIds.has(e.profile_id));
    this.data.resetTokens = this.data.resetTokens.filter((t) => !demoIds.has(t.userId));
    this.data.pendingSignups = this.data.pendingSignups.filter(
      (p) => p.email.toLowerCase() !== DEMO_EMAIL,
    );
    this.data.releasedUsernames = this.data.releasedUsernames.filter(
      (r) => !demoIds.has(r.previousOwnerId),
    );

    const changed =
      this.data.users.length !== prevUsers ||
      this.data.profiles.length !== prevProfiles ||
      this.data.customLinks.length !== prevCustomLinks ||
      this.data.socialLinkSettings.length !== prevSocialSettings ||
      this.data.profileEvents.length !== prevEvents ||
      this.data.resetTokens.length !== prevResetTokens ||
      this.data.pendingSignups.length !== prevPending ||
      this.data.releasedUsernames.length !== prevReleased;

    if (changed) {
      for (const id of demoIds) {
        this.deletedUserIds.add(id);
      }
      this.data.deletedUserIds = [...this.deletedUserIds];
      this.persist();
    }
  }

  private ensureDemoSeeded() {
    if (!this.shouldSeedDemo()) return;
    const demoEmail = DEMO_EMAIL;
    const existingDemo = this.data.users.find((u) => u.email === demoEmail);
    if (existingDemo) return;

    const existingSara = this.data.profiles.find((p) => p.username === "sara");
    if (existingSara) return;

    const now = new Date().toISOString();
    const demoId = DEMO_USER_ID;

    this.data.users.push({
      id: demoId,
      email: demoEmail,
      passwordHash: "",
      providers: ["email"],
      emailVerified: false,
      tokenVersion: 1,
      username: "sara",
      createdAt: now,
    });
    this.pendingDemoSeed = hashPassword("DemoPass123!").then((hashed) => {
      const seededUser = this.data.users.find((u) => u.id === demoId);
      if (seededUser && !seededUser.passwordHash) {
        seededUser.passwordHash = hashed;
        this.persist();
      }
    });

    this.data.profiles.push({
      ...PROFILE_DEFAULTS,
      id: demoId,
      username: "sara",
      display_name: "Sara Benali",
      bio: "Product designer. Portfolio & socials right here",
      instagram_url: "https://instagram.com/sara.designs",
      tiktok_url: "https://tiktok.com/@sara.designs",
      linkedin_url: "https://linkedin.com/in/sara",
      x_url: "https://x.com/sara",
      youtube_url: "https://youtube.com/@sara",
      created_at: now,
      updated_at: now,
    });

    this.data.customLinks.push(
      {
        id: crypto.randomUUID(),
        profile_id: demoId,
        name: "Portfolio",
        url: "https://example.com/portfolio",
        icon: "portfolio",
        enabled: true,
        position: 0,
        link_type: "link",
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        profile_id: demoId,
        name: "My online shop",
        url: "https://example.com/shop",
        icon: "store",
        enabled: true,
        position: 1,
        link_type: "link",
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        profile_id: demoId,
        name: "Work with me",
        url: "mailto:hello@example.com",
        icon: "email",
        enabled: true,
        position: 2,
        link_type: "email",
        created_at: now,
        updated_at: now,
      },
    );

    const demoCountries = ["US", "FR", "DZ", "GB", "DE", "ES"];
    const demoPlatforms: SocialKey[] = ["instagram", "tiktok", "linkedin", "x", "youtube"];
    for (let i = 0; i < 18; i++) {
      this.data.profileEvents.push({
        id: crypto.randomUUID(),
        profile_id: demoId,
        event_type: "profile_view",
        platform: null,
        custom_link_id: null,
        visitor_id: `seed-visitor-${i}`,
        country: demoCountries[i % demoCountries.length] ?? "US",
        created_at: now,
      });
    }
    for (let i = 0; i < 12; i++) {
      this.data.profileEvents.push({
        id: crypto.randomUUID(),
        profile_id: demoId,
        event_type: "social_click",
        platform: demoPlatforms[i % demoPlatforms.length] ?? "instagram",
        custom_link_id: null,
        visitor_id: `seed-visitor-${i}`,
        country: null,
        created_at: now,
      });
    }
    const firstLinkId = this.data.customLinks.find((l) => l.profile_id === demoId)?.id ?? null;
    if (firstLinkId) {
      for (let i = 0; i < 5; i++) {
        this.data.profileEvents.push({
          id: crypto.randomUUID(),
          profile_id: demoId,
          event_type: "custom_link_click",
          platform: null,
          custom_link_id: firstLinkId,
          visitor_id: `seed-visitor-${i}`,
          country: null,
          created_at: now,
        });
      }
    }

    this.persist();
  }

  private getTokenVersion(user: StoredUser): number {
    return typeof user.tokenVersion === "number" &&
      Number.isInteger(user.tokenVersion) &&
      user.tokenVersion >= 1
      ? user.tokenVersion
      : 1;
  }

  private toPublicUser(user: StoredUser): PublicAuthUser {
    return {
      id: user.id,
      email: user.email,
      user_metadata: user.username ? { username: user.username } : {},
      identities: user.providers.map((provider) => ({ provider })),
    };
  }

  createSessionToken(
    user: StoredUser,
    options?: { nowSeconds?: number },
  ): { token: string; expiresAt: number } {
    const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
    const expiresAt = nowSeconds + SESSION_TTL_SECONDS;
    const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = base64UrlEncode(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        ...(user.username ? { username: user.username } : {}),
        providers: user.providers,
        tv: this.getTokenVersion(user),
        iat: nowSeconds,
        exp: expiresAt,
      }),
    );
    const sig = crypto.createHmac("sha256", this.secret).update(`${header}.${payload}`).digest();
    const signature = base64UrlEncode(sig);
    return { token: `${header}.${payload}.${signature}`, expiresAt };
  }

  verifySessionToken(token: string, options?: { nowSeconds?: number }): PublicAuthUser | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    if (!header || !payload || !signature) return null;
    const expectedSig = base64UrlEncode(
      crypto.createHmac("sha256", this.secret).update(`${header}.${payload}`).digest(),
    );
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
      const decoded = JSON.parse(base64UrlDecode(payload)) as {
        sub?: unknown;
        tv?: unknown;
        exp?: unknown;
      };
      const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
      if (
        typeof decoded.sub !== "string" ||
        !decoded.sub ||
        typeof decoded.exp !== "number" ||
        !Number.isFinite(decoded.exp) ||
        decoded.exp <= nowSeconds
      ) {
        return null;
      }
      if (this.deletedUserIds.has(decoded.sub)) return null;
      const user = this.data.users.find((u) => u.id === decoded.sub);
      if (!user) return null;
      if (
        typeof decoded.tv !== "number" ||
        !Number.isInteger(decoded.tv) ||
        decoded.tv !== this.getTokenVersion(user)
      ) {
        return null;
      }
      return this.toPublicUser(user);
    } catch {
      return null;
    }
  }

  revokeUserTokens(userId: string): boolean {
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) return false;
    user.tokenVersion = this.getTokenVersion(user) + 1;
    this.persist();
    return true;
  }

  refreshSessionForUser(
    userId: string,
    options?: { nowSeconds?: number },
  ): AuthSessionPayload | null {
    if (this.deletedUserIds.has(userId)) return null;
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) return null;
    const { token, expiresAt } = this.createSessionToken(user, options);
    return {
      access_token: token,
      token_type: "bearer",
      expires_at: expiresAt,
      user: this.toPublicUser(user),
    };
  }

  private buildSession(user: StoredUser): AuthSessionPayload {
    const { token, expiresAt } = this.createSessionToken(user);
    return {
      access_token: token,
      token_type: "bearer",
      expires_at: expiresAt,
      user: this.toPublicUser(user),
    };
  }

  isUsernameAvailable(
    raw: string,
    excludeEmail?: string,
    options?: { forUserId?: string | undefined; nowMs?: number | undefined },
  ): boolean {
    const parsed = usernameSchema.safeParse(raw);
    if (!parsed.success) return false;
    const clean = parsed.data;
    if (RESERVED_USERNAMES.has(clean)) return false;
    if (this.data.profiles.some((p) => p.username.toLowerCase() === clean)) {
      return false;
    }
    const now = options?.nowMs ?? Date.now();
    const inCooldownForOther = this.data.releasedUsernames.some(
      (record) =>
        record.expiresAt > now &&
        record.username.toLowerCase() === clean &&
        (!options?.forUserId || record.previousOwnerId !== options.forUserId),
    );
    if (inCooldownForOther) {
      return false;
    }
    const cleanExclude = excludeEmail?.trim().toLowerCase();
    return !this.data.pendingSignups.some(
      (pending) =>
        pending.expiresAt > now &&
        pending.username.toLowerCase() === clean &&
        (!cleanExclude || pending.email.toLowerCase() !== cleanExclude),
    );
  }

  validatePendingSignupCandidate(input: { email: string; username: string }): void {
    const parsedEmail = emailSchema.safeParse(input.email);
    if (!parsedEmail.success) {
      throw new StoreError(parsedEmail.error.issues[0]?.message ?? "Invalid email", 400);
    }
    const cleanEmail = parsedEmail.data;

    if (this.data.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      throw new StoreError("User already registered", 409, "already_registered");
    }

    const parsedUsername = usernameSchema.safeParse(input.username);
    if (!parsedUsername.success) {
      throw new StoreError(parsedUsername.error.issues[0]?.message ?? "Invalid username", 400);
    }
    const cleanUsername = parsedUsername.data;

    const nowMs = Date.now();
    this.data.pendingSignups = this.data.pendingSignups.filter((p) => p.expiresAt > nowMs);

    if (!this.isUsernameAvailable(cleanUsername, cleanEmail)) {
      throw new StoreError("That username is already taken", 409, "23505");
    }
  }

  async createPendingSignup(input: {
    email: string;
    password: string;
    username: string;
  }): Promise<{ email: string; username: string }> {
    const parsedEmail = emailSchema.safeParse(input.email);
    if (!parsedEmail.success) {
      throw new StoreError(parsedEmail.error.issues[0]?.message ?? "Invalid email", 400);
    }
    const cleanEmail = parsedEmail.data;

    const parsedPass = passwordSchema.safeParse(input.password);
    if (!parsedPass.success) {
      throw new StoreError(parsedPass.error.issues[0]?.message ?? "Invalid password", 400);
    }

    if (this.data.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      throw new StoreError("User already registered", 409, "already_registered");
    }

    const parsedUsername = usernameSchema.safeParse(input.username);
    if (!parsedUsername.success) {
      throw new StoreError(parsedUsername.error.issues[0]?.message ?? "Invalid username", 400);
    }
    const cleanUsername = parsedUsername.data;

    const nowMs = Date.now();
    this.data.pendingSignups = this.data.pendingSignups.filter((p) => p.expiresAt > nowMs);

    if (!this.isUsernameAvailable(cleanUsername, cleanEmail)) {
      throw new StoreError("That username is already taken", 409, "23505");
    }

    const existingForEmail = this.data.pendingSignups.find(
      (p) => p.email.toLowerCase() === cleanEmail,
    );
    const id = existingForEmail?.id ?? crypto.randomUUID();
    const passwordHash = await hashPassword(input.password);
    const currentNowMs = Date.now();
    this.data.pendingSignups = this.data.pendingSignups.filter(
      (p) => p.expiresAt > currentNowMs && p.email.toLowerCase() !== cleanEmail,
    );

    this.data.pendingSignups.push({
      id,
      email: cleanEmail,
      passwordHash,
      username: cleanUsername,
      createdAt: new Date(currentNowMs).toISOString(),
      expiresAt: currentNowMs + PENDING_SIGNUP_TTL_MS,
    });

    this.persist();
    return { email: cleanEmail, username: cleanUsername };
  }

  async getPendingSignupCredentialsMatch(
    email: string,
    password: string,
  ): Promise<PendingSignupRow | null> {
    const cleanEmail = email.trim().toLowerCase();
    const nowMs = Date.now();
    const pending = this.data.pendingSignups.find(
      (p) => p.email.toLowerCase() === cleanEmail && p.expiresAt > nowMs,
    );
    if (!pending) return null;
    return (await verifyPassword(password, pending.passwordHash)) ? pending : null;
  }

  completeVerifiedEmailSignup(
    input: { email: string; name?: string },
    fallbackUsername?: string,
  ): AuthSessionPayload {
    const parsedEmail = emailSchema.safeParse(input.email);
    if (!parsedEmail.success) {
      throw new StoreError(parsedEmail.error.issues[0]?.message ?? "Invalid email", 400);
    }
    const cleanEmail = parsedEmail.data;

    const existing = this.data.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      if (existing.emailVerified !== true) {
        throw new StoreError(
          "An unverified account with this email already exists",
          409,
          "email_not_verified",
        );
      }
      return this.buildSession(existing);
    }

    const pending = this.data.pendingSignups.find((p) => p.email.toLowerCase() === cleanEmail);
    this.data.pendingSignups = this.data.pendingSignups.filter(
      (p) => p.email.toLowerCase() !== cleanEmail,
    );

    let chosenUsername: string | undefined;
    const candidate = pending?.username ?? fallbackUsername;
    if (candidate) {
      const parsedUsername = usernameSchema.safeParse(candidate);
      if (parsedUsername.success && this.isUsernameAvailable(parsedUsername.data, cleanEmail)) {
        chosenUsername = parsedUsername.data;
      }
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const userId = pending?.id ?? crypto.randomUUID();
    const user: StoredUser = {
      id: userId,
      email: cleanEmail,
      passwordHash: pending?.passwordHash ?? "",
      providers: ["email"],
      emailVerified: true,
      tokenVersion: 1,
      lastReauthAt: nowMs,
      ...(input.name ? { name: input.name } : {}),
      ...(chosenUsername ? { username: chosenUsername } : {}),
      createdAt: now,
    };
    this.data.users.push(user);

    if (chosenUsername) {
      this.data.profiles.push({
        ...PROFILE_DEFAULTS,
        id: userId,
        username: chosenUsername,
        display_name: input.name ? input.name.slice(0, 80) : null,
        verified: chosenUsername === "abdessamed",
        created_at: now,
        updated_at: now,
      });
    }

    this.persist();
    return this.buildSession(user);
  }

  async signUp(input: {
    email: string;
    password: string;
    username?: string;
  }): Promise<AuthSessionPayload> {
    const parsedEmail = emailSchema.safeParse(input.email);
    if (!parsedEmail.success) {
      throw new StoreError(parsedEmail.error.issues[0]?.message ?? "Invalid email", 400);
    }
    const cleanEmail = parsedEmail.data;

    const parsedPass = passwordSchema.safeParse(input.password);
    if (!parsedPass.success) {
      throw new StoreError(parsedPass.error.issues[0]?.message ?? "Invalid password", 400);
    }

    if (this.data.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      throw new StoreError("User already registered", 409, "already_registered");
    }

    let cleanUsername: string | undefined;
    if (input.username !== undefined && input.username.trim() !== "") {
      const parsedUsername = usernameSchema.safeParse(input.username);
      if (!parsedUsername.success) {
        throw new StoreError(parsedUsername.error.issues[0]?.message ?? "Invalid username", 400);
      }
      cleanUsername = parsedUsername.data;
      if (!this.isUsernameAvailable(cleanUsername, cleanEmail)) {
        throw new StoreError("That username is already taken", 409, "23505");
      }
    }

    const passwordHash = await hashPassword(input.password);
    if (this.data.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      throw new StoreError("User already registered", 409, "already_registered");
    }
    if (cleanUsername && !this.isUsernameAvailable(cleanUsername, cleanEmail)) {
      throw new StoreError("That username is already taken", 409, "23505");
    }

    this.data.pendingSignups = this.data.pendingSignups.filter(
      (p) => p.email.toLowerCase() !== cleanEmail,
    );

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const userId = crypto.randomUUID();
    const user: StoredUser = {
      id: userId,
      email: cleanEmail,
      passwordHash,
      providers: ["email"],
      emailVerified: false,
      tokenVersion: 1,
      lastReauthAt: nowMs,
      ...(cleanUsername ? { username: cleanUsername } : {}),
      createdAt: now,
    };
    this.data.users.push(user);

    if (cleanUsername) {
      this.data.profiles.push({
        ...PROFILE_DEFAULTS,
        id: userId,
        username: cleanUsername,
        verified: cleanUsername === "abdessamed",
        created_at: now,
        updated_at: now,
      });
    }

    this.persist();
    return this.buildSession(user);
  }

  async login(input: { email: string; password: string }): Promise<AuthSessionPayload> {
    if (this.pendingDemoSeed) {
      await this.pendingDemoSeed;
    }
    const cleanEmail = input.email.trim().toLowerCase();
    const user = this.data.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new StoreError("Invalid login credentials", 401, "invalid_credentials");
    }
    user.lastReauthAt = Date.now();
    this.persist();
    return this.buildSession(user);
  }

  loginWithGoogle(input: {
    uid: string;
    email: string;
    name?: string;
    authTime?: number;
  }): AuthSessionPayload {
    const parsedEmail = emailSchema.safeParse(input.email);
    if (!parsedEmail.success) {
      throw new StoreError(parsedEmail.error.issues[0]?.message ?? "Invalid email", 400);
    }
    const cleanEmail = parsedEmail.data;
    const cleanUid = input.uid.trim();
    if (!cleanUid) {
      throw new StoreError("Missing Google account identifier", 400);
    }

    const byGoogleUid = this.data.users.find((u) => u.googleUid === cleanUid);
    const byEmail = byGoogleUid
      ? undefined
      : this.data.users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (byEmail) {
      if (byEmail.emailVerified !== true) {
        throw new StoreError(
          "An unverified account with this email already exists and cannot be linked to Google",
          409,
          "email_not_verified",
        );
      }
      if (byEmail.googleUid && byEmail.googleUid !== cleanUid) {
        throw new StoreError(
          "This account is already linked to a different Google account",
          409,
          "google_account_mismatch",
        );
      }
    }

    let user = byGoogleUid ?? byEmail;
    let changed = false;
    const authTimestampMs =
      typeof input.authTime === "number" && Number.isFinite(input.authTime) && input.authTime > 0
        ? input.authTime * 1000
        : Date.now();

    const prevPendingCount = this.data.pendingSignups.length;
    this.data.pendingSignups = this.data.pendingSignups.filter(
      (p) => p.email.toLowerCase() !== cleanEmail,
    );
    if (this.data.pendingSignups.length !== prevPendingCount) {
      changed = true;
    }

    if (user) {
      if (user.googleUid !== cleanUid) {
        user.googleUid = cleanUid;
        changed = true;
      }
      if (!user.providers.includes("google")) {
        user.providers.push("google");
        changed = true;
      }
      if (user.emailVerified !== true) {
        user.emailVerified = true;
        changed = true;
      }
      if (input.name && !user.name) {
        user.name = input.name;
        changed = true;
      }
      if (user.lastReauthAt !== authTimestampMs) {
        user.lastReauthAt = authTimestampMs;
        changed = true;
      }
    } else {
      const now = new Date().toISOString();
      user = {
        id: cleanUid,
        email: cleanEmail,
        passwordHash: "",
        providers: ["google"],
        emailVerified: true,
        tokenVersion: 1,
        googleUid: cleanUid,
        lastReauthAt: authTimestampMs,
        ...(input.name ? { name: input.name } : {}),
        createdAt: now,
      };
      this.data.users.push(user);
      changed = true;
    }

    if (changed) this.persist();
    return this.buildSession(user);
  }

  reauthWithGoogle(
    userId: string,
    claims: { uid: string; email: string; authTime?: number },
    options?: { nowMs?: number },
  ): void {
    const nowMs = options?.nowMs ?? Date.now();
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) throw new StoreError("User not found", 404);
    const claimsEmail = claims.email.trim().toLowerCase();
    const matchesIdentity =
      claims.uid === user.googleUid ||
      claims.uid === user.id ||
      claimsEmail === user.email.toLowerCase();
    if (!matchesIdentity) {
      throw new StoreError(
        "Google account does not match the signed-in user",
        403,
        "google_account_mismatch",
      );
    }
    const authTimestampMs =
      typeof claims.authTime === "number" && Number.isFinite(claims.authTime) && claims.authTime > 0
        ? claims.authTime * 1000
        : nowMs;
    if (nowMs - authTimestampMs > REAUTH_MAX_AGE_MS) {
      throw new StoreError(
        "Please sign in with Google again before deleting your account",
        401,
        "reauth_required",
      );
    }
    user.lastReauthAt = authTimestampMs;
    this.persist();
  }

  async syncFirebasePasswordLogin(
    input: { uid: string; email: string; name?: string },
    password: string,
  ): Promise<AuthSessionPayload> {
    const parsedEmail = emailSchema.safeParse(input.email);
    if (!parsedEmail.success) {
      throw new StoreError(parsedEmail.error.issues[0]?.message ?? "Invalid email", 400);
    }
    const cleanEmail = parsedEmail.data;
    const cleanUid = input.uid.trim();
    const passwordHash = await hashPassword(password);

    let user =
      (cleanUid ? this.data.users.find((u) => u.id === cleanUid || u.googleUid === cleanUid) : undefined) ??
      this.data.users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (user) {
      user.passwordHash = passwordHash;
      if (!user.providers.includes("email")) {
        user.providers.push("email");
      }
      if (input.name && !user.name) {
        user.name = input.name;
      }
    } else {
      const now = new Date().toISOString();
      user = {
        id: cleanUid || crypto.randomUUID(),
        email: cleanEmail,
        passwordHash,
        providers: ["email"],
        emailVerified: false,
        tokenVersion: 1,
        ...(input.name ? { name: input.name } : {}),
        createdAt: now,
      };
      this.data.users.push(user);
    }

    this.persist();
    return this.buildSession(user);
  }

  async updatePassword(
    userId: string,
    newPassword: string,
    currentPassword?: string,
  ): Promise<AuthSessionPayload> {
    if (this.pendingDemoSeed) {
      await this.pendingDemoSeed;
    }
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) throw new StoreError("User not found", 404);

    if (user.providers.includes("email") && user.passwordHash) {
      if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new StoreError("Your current password is incorrect", 400);
      }
    }

    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      throw new StoreError(parsed.error.issues[0]?.message ?? "Invalid password", 400);
    }

    user.passwordHash = await hashPassword(newPassword);
    if (!user.providers.includes("email")) {
      user.providers.push("email");
    }
    user.lastReauthAt = Date.now();
    user.tokenVersion = this.getTokenVersion(user) + 1;
    this.persist();
    return this.buildSession(user);
  }

  createPasswordReset(email: string): { token: string } | null {
    const cleanEmail = email.trim().toLowerCase();
    const now = Date.now();
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(token);
    const user = this.data.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user) return null;

    this.data.resetTokens = this.data.resetTokens.filter(
      (t) => t.expiresAt > now && t.userId !== user.id,
    );
    this.data.resetTokens.push({
      tokenHash,
      userId: user.id,
      expiresAt: now + RESET_TTL_MS,
    });
    this.persist();
    return { token };
  }

  async consumePasswordReset(token: string, newPassword: string): Promise<AuthSessionPayload> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new StoreError("That reset link has expired or is invalid", 400);
    }
    const now = Date.now();
    const tokenHashBuf = Buffer.from(hashResetToken(trimmed), "hex");
    const record = this.data.resetTokens.find((t) => {
      if (t.expiresAt <= now || typeof t.tokenHash !== "string") return false;
      const storedBuf = Buffer.from(t.tokenHash, "hex");
      return (
        storedBuf.length === tokenHashBuf.length && crypto.timingSafeEqual(storedBuf, tokenHashBuf)
      );
    });
    if (!record) {
      throw new StoreError("That reset link has expired or is invalid", 400);
    }
    const user = this.data.users.find((u) => u.id === record.userId);
    if (!user) {
      throw new StoreError("User not found", 404);
    }
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      throw new StoreError(parsed.error.issues[0]?.message ?? "Invalid password", 400);
    }
    user.passwordHash = await hashPassword(newPassword);
    if (!user.providers.includes("email")) {
      user.providers.push("email");
    }
    user.lastReauthAt = Date.now();
    user.tokenVersion = this.getTokenVersion(user) + 1;
    this.data.resetTokens = this.data.resetTokens.filter(
      (t) => t.tokenHash !== record.tokenHash && t.userId !== user.id,
    );
    this.persist();
    return this.buildSession(user);
  }

  getProfileByUsername(username: string): ProfileRow | null {
    const clean = username.trim().toLowerCase();
    return this.data.profiles.find((p) => p.username.toLowerCase() === clean) ?? null;
  }

  getProfileById(userId: string): ProfileRow | null {
    return this.data.profiles.find((p) => p.id === userId) ?? null;
  }

  createProfile(userId: string, rawUsername: string): ProfileRow {
    const existing = this.getProfileById(userId);
    if (existing) return existing;

    const parsed = usernameSchema.safeParse(rawUsername);
    if (!parsed.success) {
      throw new StoreError(parsed.error.issues[0]?.message ?? "Invalid username", 400);
    }
    const username = parsed.data;
    const nowMs = Date.now();
    if (!this.isUsernameAvailable(username, undefined, { forUserId: userId, nowMs })) {
      throw new StoreError(
        `duplicate key value violates unique constraint "profiles_username_key"`,
        409,
        "23505",
      );
    }

    const user = this.data.users.find((u) => u.id === userId);
    if (user) {
      user.username = username;
    }

    this.data.releasedUsernames = this.data.releasedUsernames.filter(
      (r) => r.expiresAt > nowMs && r.username !== username,
    );

    const now = new Date(nowMs).toISOString();
    const profile: ProfileRow = {
      ...PROFILE_DEFAULTS,
      id: userId,
      username,
      display_name: user?.name ? user.name.slice(0, 80) : null,
      verified: username === "abdessamed",
      created_at: now,
      updated_at: now,
    };
    this.data.profiles.push(profile);
    this.persist();
    return profile;
  }

  updateProfile(
    userId: string,
    patch: Partial<ProfileRow> | unknown,
    options?: { nowMs?: number | undefined },
  ): ProfileRow {
    const profile = this.getProfileById(userId);
    if (!profile) throw new StoreError("Profile not found", 404);

    if (!isPlainObject(patch)) {
      throw new StoreError("Profile update payload must be a JSON object", 400);
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, "__proto__") ||
      Object.prototype.hasOwnProperty.call(patch, "constructor") ||
      Object.prototype.hasOwnProperty.call(patch, "prototype")
    ) {
      throw new StoreError("Unrecognized or forbidden key in profile update", 400);
    }

    const parsed = buildProfileUpdateSchema(userId).safeParse(patch);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const fieldPrefix = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
      throw new StoreError(`${fieldPrefix}${issue?.message ?? "Invalid profile update"}`, 400);
    }

    // Build and validate the entire candidate copy before mutating any persisted state.
    const nowMs = options?.nowMs ?? Date.now();
    const validPatch = parsed.data as Record<string, unknown>;
    const previousUsername = profile.username;
    const candidate: ProfileRow = { ...profile };

    const nextUsername = validPatch["username"];
    const usernameChanged = typeof nextUsername === "string" && nextUsername !== previousUsername;
    if (usernameChanged) {
      if (!this.isUsernameAvailable(nextUsername, undefined, { forUserId: userId, nowMs })) {
        throw new StoreError(
          `duplicate key value violates unique constraint "profiles_username_key"`,
          409,
          "23505",
        );
      }
      candidate.username = nextUsername;
      candidate.verified = nextUsername === "abdessamed";
    }

    const mutableCandidate = candidate as Record<string, unknown>;
    for (const [key, value] of Object.entries(validPatch)) {
      if (key === "username" || value === undefined) continue;
      mutableCandidate[key] = value;
    }
    candidate.updated_at = new Date(nowMs).toISOString();

    // All validations succeeded — apply changes atomically and persist once.
    Object.assign(profile, candidate);
    if (usernameChanged) {
      const user = this.data.users.find((u) => u.id === userId);
      if (user) {
        user.username = candidate.username;
      }
      this.data.releasedUsernames = this.data.releasedUsernames.filter(
        (r) =>
          r.expiresAt > nowMs &&
          r.username !== candidate.username &&
          r.username !== previousUsername.toLowerCase(),
      );
      this.data.releasedUsernames.push({
        username: previousUsername.toLowerCase(),
        previousOwnerId: userId,
        releasedAt: nowMs,
        expiresAt: nowMs + USERNAME_COOLDOWN_MS,
      });
    }
    this.persist();
    return profile;
  }

  listCustomLinks(profileId: string, enabledOnly = false): CustomLinkRow[] {
    return this.data.customLinks
      .filter((l) => l.profile_id === profileId && (!enabledOnly || l.enabled))
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  }

  createCustomLink(
    userId: string,
    input: { name: string; url: string; icon?: string; link_type?: string },
  ): CustomLinkRow {
    const profile = this.getProfileById(userId);
    if (!profile) throw new StoreError("Profile not found", 404);

    const name = input.name.trim();
    if (!name || name.length > 80) {
      throw new StoreError("Link name must be 1-80 characters", 400);
    }
    const existing = this.listCustomLinks(userId);
    const nextPos = existing.length > 0 ? Math.max(...existing.map((l) => l.position)) + 1 : 0;
    const now = new Date().toISOString();
    const row: CustomLinkRow = {
      id: crypto.randomUUID(),
      profile_id: userId,
      name,
      url: input.url,
      icon: input.icon ?? "globe",
      enabled: true,
      position: nextPos,
      link_type: input.link_type ?? "link",
      created_at: now,
      updated_at: now,
    };
    this.data.customLinks.push(row);
    this.persist();
    return row;
  }

  updateCustomLink(userId: string, linkId: string, patch: Partial<CustomLinkRow>): CustomLinkRow {
    const row = this.data.customLinks.find((l) => l.id === linkId && l.profile_id === userId);
    if (!row) throw new StoreError("Custom link not found", 404);

    if (patch.name !== undefined) {
      const clean = patch.name.trim();
      if (!clean || clean.length > 80)
        throw new StoreError("Link name must be 1-80 characters", 400);
      row.name = clean;
    }
    if (patch.url !== undefined) row.url = patch.url;
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.link_type !== undefined) row.link_type = patch.link_type;
    if (patch.enabled !== undefined) row.enabled = Boolean(patch.enabled);
    row.updated_at = new Date().toISOString();
    this.persist();
    return row;
  }

  deleteCustomLink(userId: string, linkId: string) {
    const idx = this.data.customLinks.findIndex((l) => l.id === linkId && l.profile_id === userId);
    if (idx === -1) throw new StoreError("Custom link not found", 404);
    this.data.customLinks.splice(idx, 1);
    this.persist();
  }

  reorderCustomLinks(userId: string, targetProfileId: string, orderedIds: string[]) {
    if (userId !== targetProfileId) {
      throw new StoreError("Not authorized to reorder links for this profile", 403);
    }
    const owned = this.data.customLinks.filter((l) => l.profile_id === userId);
    if (owned.length !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length) {
      throw new StoreError("The complete set of custom links must be supplied", 400);
    }
    const byId = new Map(owned.map((l) => [l.id, l]));
    orderedIds.forEach((id, index) => {
      const item = byId.get(id);
      if (!item)
        throw new StoreError("One or more custom links do not belong to this profile", 400);
      item.position = index;
      item.updated_at = new Date().toISOString();
    });
    this.persist();
  }

  listSocialLinkSettings(profileId: string): SocialLinkRow[] {
    return this.data.socialLinkSettings
      .filter((s) => s.profile_id === profileId)
      .sort((a, b) => a.position - b.position);
  }

  saveSocialLinkSettings(
    userId: string,
    items: Array<{
      profile_id?: string | undefined;
      platform: string;
      enabled: boolean;
      position: number;
    }>,
  ) {
    if (!Array.isArray(items)) {
      throw new StoreError("settings must be an array", 400, "invalid_social_settings");
    }
    const parsed = socialLinkSettingsArraySchema.safeParse(items);
    if (!parsed.success) {
      throw new StoreError(firstError(parsed.error), 400, "invalid_social_settings");
    }

    for (const item of parsed.data) {
      if (item.profile_id !== undefined && item.profile_id !== userId) {
        throw new StoreError("Not authorized to update these settings", 403);
      }
    }

    const now = new Date().toISOString();
    for (const item of parsed.data) {
      const existing = this.data.socialLinkSettings.find(
        (s) => s.profile_id === userId && s.platform === item.platform,
      );
      if (existing) {
        existing.enabled = item.enabled;
        existing.position = item.position;
        existing.updated_at = now;
      } else {
        this.data.socialLinkSettings.push({
          id: crypto.randomUUID(),
          profile_id: userId,
          platform: item.platform,
          enabled: item.enabled,
          position: item.position,
          created_at: now,
          updated_at: now,
        });
      }
    }
    this.persist();
  }

  recordEvent(
    actorUserId: string | null,
    input: {
      profile_id: string;
      event_type: "profile_view" | "social_click" | "custom_link_click";
      platform?: string | null;
      custom_link_id?: string | null;
      visitor_id?: string | null;
      country?: string | null;
    },
    nowMs = Date.now(),
  ): { recorded: boolean; deduplicated: boolean } {
    if (actorUserId && actorUserId === input.profile_id) {
      return { recorded: false, deduplicated: false };
    }
    if (!this.getProfileById(input.profile_id)) {
      throw new StoreError("Target profile not found", 404, "profile_not_found");
    }
    if (input.event_type === "social_click" && !input.platform) {
      throw new StoreError("platform is required for social_click events", 400, "invalid_event");
    }
    if (input.event_type === "custom_link_click") {
      if (!input.custom_link_id) {
        throw new StoreError(
          "custom_link_id is required for custom_link_click events",
          400,
          "invalid_custom_link",
        );
      }
      const ownedLink = this.data.customLinks.find(
        (l) => l.id === input.custom_link_id && l.profile_id === input.profile_id,
      );
      if (!ownedLink) {
        throw new StoreError(
          "custom_link_id does not belong to the target profile",
          400,
          "invalid_custom_link",
        );
      }
    }

    if (input.event_type === "profile_view" && input.visitor_id) {
      const oneHourMs = 60 * 60 * 1000;
      const alreadyViewedThisHour = this.data.profileEvents.some((ev) => {
        if (
          ev.event_type !== "profile_view" ||
          ev.profile_id !== input.profile_id ||
          ev.visitor_id !== input.visitor_id
        ) {
          return false;
        }
        const evTime = Date.parse(ev.created_at);
        return Number.isFinite(evTime) && nowMs - evTime >= 0 && nowMs - evTime < oneHourMs;
      });
      if (alreadyViewedThisHour) {
        return { recorded: false, deduplicated: true };
      }
    }

    this.data.profileEvents.push({
      id: crypto.randomUUID(),
      profile_id: input.profile_id,
      event_type: input.event_type,
      platform: input.platform ?? null,
      custom_link_id: input.custom_link_id ?? null,
      visitor_id: input.visitor_id ?? null,
      country: input.country ?? null,
      created_at: new Date(nowMs).toISOString(),
    });
    this.persist();
    return { recorded: true, deduplicated: false };
  }

  getAnalytics(userId: string, targetProfileId: string) {
    if (userId !== targetProfileId) {
      throw new StoreError("Forbidden", 403);
    }
    const events = this.data.profileEvents.filter((e) => e.profile_id === targetProfileId);
    const seenVisitors = new Set<string>();
    let anonymousViews = 0;
    let clicks = 0;
    let customLinkClicks = 0;
    const byPlatform: Record<string, number> = {};
    const byCustomLink: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    const seenCountryVisitors = new Set<string>();

    for (const ev of events) {
      if (ev.event_type === "profile_view") {
        if (ev.visitor_id) {
          if (!seenVisitors.has(ev.visitor_id)) {
            seenVisitors.add(ev.visitor_id);
            if (ev.country && !seenCountryVisitors.has(ev.visitor_id)) {
              seenCountryVisitors.add(ev.visitor_id);
              byCountry[ev.country] = (byCountry[ev.country] ?? 0) + 1;
            }
          }
        } else {
          anonymousViews += 1;
          if (ev.country) {
            byCountry[ev.country] = (byCountry[ev.country] ?? 0) + 1;
          }
        }
      } else if (ev.event_type === "social_click") {
        clicks += 1;
        if (ev.platform) {
          byPlatform[ev.platform] = (byPlatform[ev.platform] ?? 0) + 1;
        }
      } else if (ev.event_type === "custom_link_click") {
        customLinkClicks += 1;
        if (ev.custom_link_id) {
          byCustomLink[ev.custom_link_id] = (byCustomLink[ev.custom_link_id] ?? 0) + 1;
        }
      }
    }

    return {
      views: seenVisitors.size + anonymousViews,
      clicks,
      byPlatform,
      customLinkClicks,
      byCustomLink,
      byCountry,
    };
  }

  private assertSafeMediaPath(bucket: string, objectPath: string, ownerId?: string) {
    if (!ALLOWED_BUCKETS.has(bucket)) {
      throw new StoreError("Invalid storage bucket", 400);
    }
    const parts = objectPath.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new StoreError("Invalid storage path", 400);
    }
    const [owner, fileName] = parts;
    const hasControlChars = (value: string) => {
      for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i);
        if (code < 0x20 || code === 0x7f) return true;
      }
      return false;
    };
    if (
      hasControlChars(owner) ||
      hasControlChars(fileName) ||
      owner === "." ||
      owner === ".." ||
      owner.includes("\\") ||
      fileName === "." ||
      fileName === ".." ||
      fileName.startsWith(".") ||
      fileName.includes("\\") ||
      fileName.toLowerCase().endsWith(".meta.json")
    ) {
      throw new StoreError("Invalid storage path", 400);
    }
    if (ownerId && owner !== ownerId) {
      throw new StoreError("Unauthorized storage path", 403);
    }
  }

  private getUserMediaUsage(
    userId: string,
    targetBucket: string,
    replacingFileName?: string,
  ): { totalBytes: number; bucketFileCount: number } {
    let totalBytes = 0;
    let bucketFileCount = 0;

    for (const b of ALLOWED_BUCKETS) {
      const userDir = path.join(this.dataDir, "media", b, userId);
      if (!fs.existsSync(userDir)) continue;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(userDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile() || entry.name.endsWith(".meta.json") || entry.name.startsWith(".")) {
          continue;
        }
        if (b === targetBucket && replacingFileName && entry.name === replacingFileName) {
          continue;
        }
        if (b === targetBucket) {
          bucketFileCount += 1;
        }
        try {
          totalBytes += fs.statSync(path.join(userDir, entry.name)).size;
        } catch {
          /* ignore stat error */
        }
      }
    }

    return { totalBytes, bucketFileCount };
  }

  saveMediaFile(
    userId: string,
    bucket: string,
    objectPath: string,
    bytes: Buffer,
    contentType: string,
  ): string {
    this.assertSafeMediaPath(bucket, objectPath, userId);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_MEDIA_FILE_BYTES) {
      throw new StoreError("File size must be between 1 byte and 6 MB", 400);
    }

    const declared = normalizeDeclaredMediaType(contentType);
    if (!declared || !isMediaTypeAllowedForBucket(bucket, declared)) {
      throw new StoreError("Unsupported file type for this upload", 415, "unsupported_media_type");
    }

    const detected = detectMediaContentType(bytes);
    if (!detected || !isMediaTypeAllowedForBucket(bucket, detected)) {
      throw new StoreError("Unsupported or unrecognized file content", 415, "unsupported_media_type");
    }

    if (detected !== declared) {
      throw new StoreError(
        "File content does not match declared Content-Type",
        415,
        "media_type_mismatch",
      );
    }

    const [owner, rawFileName] = objectPath.split("/") as [string, string];
    const lastDot = rawFileName.lastIndexOf(".");
    const stem = lastDot > 0 ? rawFileName.slice(0, lastDot) : rawFileName;
    if (!stem) {
      throw new StoreError("Invalid storage filename", 400);
    }
    const normalizedFileName = `${stem}${CANONICAL_EXT_BY_MIME[detected]}`;
    if (normalizedFileName.toLowerCase().endsWith(".meta.json")) {
      throw new StoreError("Invalid storage filename", 400);
    }
    const normalizedObjectPath = `${owner}/${normalizedFileName}`;

    const { totalBytes, bucketFileCount } = this.getUserMediaUsage(
      userId,
      bucket,
      normalizedFileName,
    );
    if (bucketFileCount >= MAX_FILES_PER_BUCKET) {
      throw new StoreError(
        `Maximum of ${MAX_FILES_PER_BUCKET} files per bucket exceeded`,
        413,
        "quota_exceeded",
      );
    }
    if (totalBytes + bytes.byteLength > MAX_USER_STORAGE_BYTES) {
      throw new StoreError("User storage quota of 50 MB exceeded", 413, "quota_exceeded");
    }

    const target = path.join(this.dataDir, "media", bucket, normalizedObjectPath);
    this.ensureDir(path.dirname(target));
    fs.writeFileSync(target, bytes);
    fs.writeFileSync(`${target}.meta.json`, JSON.stringify({ contentType: detected }));
    return normalizedObjectPath;
  }

  readMediaFile(bucket: string, objectPath: string): { bytes: Buffer; contentType: string } | null {
    try {
      this.assertSafeMediaPath(bucket, objectPath);
    } catch {
      return null;
    }
    const target = path.join(this.dataDir, "media", bucket, objectPath);
    if (!fs.existsSync(target)) return null;
    const bytes = fs.readFileSync(target);
    const detected = detectMediaContentType(bytes);
    if (!detected || !isMediaTypeAllowedForBucket(bucket, detected)) {
      return null;
    }

    const metaPath = `${target}.meta.json`;
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as { contentType?: string };
        if (typeof meta.contentType === "string") {
          const storedType = normalizeDeclaredMediaType(meta.contentType);
          if (!isMediaTypeAllowedForBucket(bucket, storedType) || storedType !== detected) {
            return null;
          }
        }
      } catch {
        /* ignore malformed meta */
      }
    }

    return { bytes, contentType: detected };
  }

  listMediaFiles(userId: string, bucket: string): Array<{ id: string; name: string }> {
    if (!ALLOWED_BUCKETS.has(bucket)) return [];
    const dir = path.join(this.dataDir, "media", bucket, userId);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => !name.endsWith(".meta.json") && !name.startsWith("."))
      .map((name) => ({ id: `${userId}/${name}`, name }));
  }

  removeMediaFiles(userId: string, bucket: string, paths: string[]) {
    for (const objectPath of paths) {
      try {
        this.assertSafeMediaPath(bucket, objectPath, userId);
        const target = path.join(this.dataDir, "media", bucket, objectPath);
        if (fs.existsSync(target)) fs.unlinkSync(target);
        if (fs.existsSync(`${target}.meta.json`)) fs.unlinkSync(`${target}.meta.json`);
      } catch {
        /* ignore invalid or missing path */
      }
    }
  }

  async deleteAccount(
    userId: string,
    usernameConfirmation: string,
    password?: string,
    options?: {
      googleClaims?: { uid: string; email: string; authTime?: number };
      nowMs?: number;
    },
  ) {
    if (this.pendingDemoSeed) {
      await this.pendingDemoSeed;
    }
    const nowMs = options?.nowMs ?? Date.now();
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) throw new StoreError("User not found", 404);

    if (user.providers.includes("email")) {
      if (!password || !(await verifyPassword(password, user.passwordHash))) {
        throw new StoreError("Your current password is incorrect", 400);
      }
    } else if (options?.googleClaims) {
      const claims = options.googleClaims;
      const claimsEmail = claims.email.trim().toLowerCase();
      const matchesIdentity =
        claims.uid === user.googleUid ||
        claims.uid === user.id ||
        claimsEmail === user.email.toLowerCase();
      if (!matchesIdentity) {
        throw new StoreError(
          "Google account does not match the signed-in user",
          403,
          "google_account_mismatch",
        );
      }
      if (
        typeof claims.authTime !== "number" ||
        !Number.isFinite(claims.authTime) ||
        nowMs - claims.authTime * 1000 > REAUTH_MAX_AGE_MS
      ) {
        throw new StoreError(
          "Please re-authenticate with Google before deleting your account",
          401,
          "reauth_required",
        );
      }
    } else if (
      typeof user.lastReauthAt !== "number" ||
      !Number.isFinite(user.lastReauthAt) ||
      nowMs - user.lastReauthAt > REAUTH_MAX_AGE_MS
    ) {
      throw new StoreError(
        "Please re-authenticate with Google before deleting your account",
        401,
        "reauth_required",
      );
    }

    const profile = this.getProfileById(userId);
    const expectedUsername = profile?.username ?? user.username;
    if (
      expectedUsername &&
      expectedUsername.toLowerCase() !== usernameConfirmation.trim().toLowerCase()
    ) {
      throw new StoreError("The username you typed does not match this account", 400);
    }

    for (const bucket of ALLOWED_BUCKETS) {
      const userDir = path.join(this.dataDir, "media", bucket, userId);
      try {
        fs.rmSync(userDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`[TinkiStore] Failed to remove media directory "${userDir}":`, err);
      }
    }

    const cleanEmail = user.email.toLowerCase();
    user.tokenVersion = this.getTokenVersion(user) + 1;
    this.deletedUserIds.add(userId);
    this.data.deletedUserIds = [...this.deletedUserIds];
    this.data.profileEvents = this.data.profileEvents.filter((e) => e.profile_id !== userId);
    this.data.customLinks = this.data.customLinks.filter((l) => l.profile_id !== userId);
    this.data.socialLinkSettings = this.data.socialLinkSettings.filter(
      (s) => s.profile_id !== userId,
    );
    this.data.profiles = this.data.profiles.filter((p) => p.id !== userId);
    this.data.resetTokens = this.data.resetTokens.filter((t) => t.userId !== userId);
    this.data.pendingSignups = this.data.pendingSignups.filter(
      (p) => p.id !== userId && p.email.toLowerCase() !== cleanEmail,
    );
    this.data.releasedUsernames = this.data.releasedUsernames.filter(
      (r) => r.previousOwnerId !== userId,
    );
    this.data.users = this.data.users.filter((u) => u.id !== userId);
    this.persist();
  }
}

let sharedStore: TinkiStore | undefined;

export function resetSharedStoreForTests(): void {
  if (sharedStore) {
    sharedStore.dispose();
    sharedStore = undefined;
  }
}

export function getStore(): TinkiStore {
  if (!isLocalStoreEnabled()) {
    throw new StoreError(
      "Local fallback store is disabled. Set ENABLE_LOCAL_STORE=true in development or tests.",
      503,
      "local_store_disabled",
    );
  }
  if (!sharedStore) {
    sharedStore = new TinkiStore();
  }
  return sharedStore;
}
