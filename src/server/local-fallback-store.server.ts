import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import firebaseConfig from "../../firebase-applet-config.json";
import type { AppTableRow } from "@/lib/database-types";
import type { Profile } from "@/lib/profiles";
import {
  RESERVED_USERNAMES,
  SOCIAL_PLATFORMS,
  emailSchema,
  passwordSchema,
  usernameSchema,
  validateSocialUrl,
  type SocialKey,
} from "@/lib/profile-validation";

export type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  providers: string[];
  googleUid?: string;
  name?: string;
  username?: string;
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
  token: string;
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

type StoreData = {
  users: StoredUser[];
  profiles: ProfileRow[];
  customLinks: CustomLinkRow[];
  socialLinkSettings: SocialLinkRow[];
  profileEvents: EventRow[];
  resetTokens: ResetTokenRow[];
  pendingSignups: PendingSignupRow[];
};

const DEFAULT_DATA_DIR = process.env["TINKI_DATA_DIR"] || "/tmp/tinki-data";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const RESET_TTL_MS = 60 * 60 * 1000;
const PENDING_SIGNUP_TTL_MS = 24 * 60 * 60 * 1000;

const ALLOWED_BUCKETS = new Set(["avatars", "covers", "backgrounds"]);

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

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, hex] = parts;
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
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

export class TinkiStore {
  private dataDir: string;
  private dbPath: string;
  private secret: string;
  private data: StoreData;
  private deletedUserIds = new Set<string>();

  constructor(dataDir = DEFAULT_DATA_DIR) {
    this.dataDir = dataDir;
    this.dbPath = path.join(dataDir, "db.json");
    this.secret = this.loadOrCreateSecret();
    this.data = this.load();
    this.ensureDemoSeeded();
  }

  private ensureDir(dir: string) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* fallback to in-memory if filesystem is unavailable */
    }
  }

  private loadOrCreateSecret(): string {
    const envSecret = process.env["AUTH_SECRET"];
    if (envSecret && envSecret.length >= 16) return envSecret;

    if (this.dataDir === DEFAULT_DATA_DIR) {
      return crypto
        .createHash("sha256")
        .update(
          [
            "tinki-session-v2",
            firebaseConfig.projectId,
            firebaseConfig.firestoreDatabaseId,
            firebaseConfig.appId,
            firebaseConfig.apiKey,
          ].join(":"),
        )
        .digest("hex");
    }

    const secretFile = path.join(this.dataDir, ".secret");
    try {
      this.ensureDir(this.dataDir);
      if (fs.existsSync(secretFile)) {
        const existing = fs.readFileSync(secretFile, "utf8").trim();
        if (existing.length >= 16) return existing;
      }
      const generated = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(secretFile, generated, { mode: 0o600 });
      return generated;
    } catch {
      return crypto.randomBytes(32).toString("hex");
    }
  }

  private load(): StoreData {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, "utf8");
        const parsed = JSON.parse(raw) as Partial<StoreData>;
        return {
          users: parsed.users ?? [],
          profiles: parsed.profiles ?? [],
          customLinks: parsed.customLinks ?? [],
          socialLinkSettings: parsed.socialLinkSettings ?? [],
          profileEvents: parsed.profileEvents ?? [],
          resetTokens: parsed.resetTokens ?? [],
          pendingSignups: parsed.pendingSignups ?? [],
        };
      }
    } catch {
      /* fall through to empty store */
    }
    return {
      users: [],
      profiles: [],
      customLinks: [],
      socialLinkSettings: [],
      profileEvents: [],
      resetTokens: [],
      pendingSignups: [],
    };
  }

  private persist() {
    try {
      this.ensureDir(this.dataDir);
      const tmpPath = `${this.dbPath}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), "utf8");
      fs.renameSync(tmpPath, this.dbPath);
    } catch {
      /* keep in-memory state if disk persistence fails */
    }
  }

  private ensureDemoSeeded() {
    const demoEmail = "demo@tinki.app";
    const existingDemo = this.data.users.find((u) => u.email === demoEmail);
    if (existingDemo) return;

    const existingSara = this.data.profiles.find((p) => p.username === "sara");
    if (existingSara) return;

    const now = new Date().toISOString();
    const demoId = "00000000-0000-4000-8000-000000000001";

    this.data.users.push({
      id: demoId,
      email: demoEmail,
      passwordHash: hashPassword("DemoPass123!"),
      providers: ["email"],
      username: "sara",
      createdAt: now,
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

  private toPublicUser(user: StoredUser): PublicAuthUser {
    return {
      id: user.id,
      email: user.email,
      user_metadata: user.username ? { username: user.username } : {},
      identities: user.providers.map((provider) => ({ provider })),
    };
  }

  createSessionToken(user: StoredUser): { token: string; expiresAt: number } {
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = base64UrlEncode(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        ...(user.username ? { username: user.username } : {}),
        providers: user.providers,
        exp: expiresAt,
      }),
    );
    const sig = crypto.createHmac("sha256", this.secret).update(`${header}.${payload}`).digest();
    const signature = base64UrlEncode(sig);
    return { token: `${header}.${payload}.${signature}`, expiresAt };
  }

  verifySessionToken(token: string): PublicAuthUser | null {
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
        sub?: string;
        email?: string;
        username?: string;
        providers?: string[];
        exp?: number;
      };
      if (!decoded.sub || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      if (this.deletedUserIds.has(decoded.sub)) return null;
      const user = this.data.users.find((u) => u.id === decoded.sub);
      if (user) return this.toPublicUser(user);
      if (typeof decoded.email === "string" && decoded.email) {
        const providers = Array.isArray(decoded.providers) ? decoded.providers : ["google"];
        return {
          id: decoded.sub,
          email: decoded.email,
          user_metadata: decoded.username ? { username: decoded.username } : {},
          identities: providers.map((provider) => ({ provider })),
        };
      }
      return null;
    } catch {
      return null;
    }
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

  isUsernameAvailable(raw: string, excludeEmail?: string): boolean {
    const parsed = usernameSchema.safeParse(raw);
    if (!parsed.success) return false;
    const clean = parsed.data;
    if (RESERVED_USERNAMES.has(clean)) return false;
    if (this.data.profiles.some((p) => p.username.toLowerCase() === clean)) {
      return false;
    }
    const now = Date.now();
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

  createPendingSignup(input: {
    email: string;
    password: string;
    username: string;
  }): { email: string; username: string } {
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
    this.data.pendingSignups = this.data.pendingSignups.filter(
      (p) => p.email.toLowerCase() !== cleanEmail,
    );

    this.data.pendingSignups.push({
      id,
      email: cleanEmail,
      passwordHash: hashPassword(input.password),
      username: cleanUsername,
      createdAt: new Date().toISOString(),
      expiresAt: nowMs + PENDING_SIGNUP_TTL_MS,
    });

    this.persist();
    return { email: cleanEmail, username: cleanUsername };
  }

  getPendingSignupCredentialsMatch(email: string, password: string): PendingSignupRow | null {
    const cleanEmail = email.trim().toLowerCase();
    const nowMs = Date.now();
    const pending = this.data.pendingSignups.find(
      (p) => p.email.toLowerCase() === cleanEmail && p.expiresAt > nowMs,
    );
    if (!pending) return null;
    return verifyPassword(password, pending.passwordHash) ? pending : null;
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

    const now = new Date().toISOString();
    const userId = pending?.id ?? crypto.randomUUID();
    const user: StoredUser = {
      id: userId,
      email: cleanEmail,
      passwordHash: pending?.passwordHash ?? "",
      providers: ["email"],
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

  signUp(input: { email: string; password: string; username?: string }): AuthSessionPayload {
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

    this.data.pendingSignups = this.data.pendingSignups.filter(
      (p) => p.email.toLowerCase() !== cleanEmail,
    );

    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const user: StoredUser = {
      id: userId,
      email: cleanEmail,
      passwordHash: hashPassword(input.password),
      providers: ["email"],
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

  login(input: { email: string; password: string }): AuthSessionPayload {
    const cleanEmail = input.email.trim().toLowerCase();
    const user = this.data.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      throw new StoreError("Invalid login credentials", 401, "invalid_credentials");
    }
    return this.buildSession(user);
  }

  loginWithGoogle(input: { uid: string; email: string; name?: string }): AuthSessionPayload {
    const parsedEmail = emailSchema.safeParse(input.email);
    if (!parsedEmail.success) {
      throw new StoreError(parsedEmail.error.issues[0]?.message ?? "Invalid email", 400);
    }
    const cleanEmail = parsedEmail.data;
    const cleanUid = input.uid.trim();
    if (!cleanUid) {
      throw new StoreError("Missing Google account identifier", 400);
    }

    let user =
      this.data.users.find((u) => u.googleUid === cleanUid) ??
      this.data.users.find((u) => u.email.toLowerCase() === cleanEmail);

    let changed = false;
    if (user) {
      if (user.googleUid !== cleanUid) {
        user.googleUid = cleanUid;
        changed = true;
      }
      if (!user.providers.includes("google")) {
        user.providers.push("google");
        changed = true;
      }
      if (input.name && !user.name) {
        user.name = input.name;
        changed = true;
      }
    } else {
      const now = new Date().toISOString();
      user = {
        id: cleanUid,
        email: cleanEmail,
        passwordHash: "",
        providers: ["google"],
        googleUid: cleanUid,
        ...(input.name ? { name: input.name } : {}),
        createdAt: now,
      };
      this.data.users.push(user);
      changed = true;
    }

    if (changed) this.persist();
    return this.buildSession(user);
  }

  updatePassword(
    userId: string,
    newPassword: string,
    currentPassword?: string,
    fallbackUser?: PublicAuthUser,
  ): AuthSessionPayload {
    let user = this.data.users.find((u) => u.id === userId);
    if (!user && fallbackUser && fallbackUser.id === userId && fallbackUser.email) {
      const providers = [
        ...new Set(
          fallbackUser.identities
            .map((identity) => identity.provider)
            .filter((provider) => provider && provider !== "email"),
        ),
      ];
      user = {
        id: userId,
        email: fallbackUser.email.trim().toLowerCase(),
        passwordHash: "",
        providers: providers.length > 0 ? providers : ["google"],
        ...(providers.includes("google") ? { googleUid: userId } : {}),
        ...(fallbackUser.user_metadata.username
          ? { username: fallbackUser.user_metadata.username }
          : {}),
        createdAt: new Date().toISOString(),
      };
      this.data.users.push(user);
    }
    if (!user) throw new StoreError("User not found", 404);

    if (user.providers.includes("email") && user.passwordHash) {
      if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
        throw new StoreError("Your current password is incorrect", 400);
      }
    }

    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      throw new StoreError(parsed.error.issues[0]?.message ?? "Invalid password", 400);
    }

    user.passwordHash = hashPassword(newPassword);
    if (!user.providers.includes("email")) {
      user.providers.push("email");
    }
    this.persist();
    return this.buildSession(user);
  }

  createPasswordReset(email: string): { token: string } | null {
    const cleanEmail = email.trim().toLowerCase();
    const user = this.data.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user) return null;

    const now = Date.now();
    this.data.resetTokens = this.data.resetTokens.filter((t) => t.expiresAt > now);
    const token = crypto.randomBytes(24).toString("hex");
    this.data.resetTokens.push({
      token,
      userId: user.id,
      expiresAt: now + RESET_TTL_MS,
    });
    this.persist();
    return { token };
  }

  consumePasswordReset(token: string, newPassword: string): AuthSessionPayload {
    const now = Date.now();
    const record = this.data.resetTokens.find((t) => t.token === token && t.expiresAt > now);
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
    user.passwordHash = hashPassword(newPassword);
    if (!user.providers.includes("email")) {
      user.providers.push("email");
    }
    this.data.resetTokens = this.data.resetTokens.filter((t) => t.token !== token);
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
    if (!this.isUsernameAvailable(username)) {
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

    const now = new Date().toISOString();
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

  updateProfile(userId: string, patch: Partial<ProfileRow>): ProfileRow {
    const profile = this.getProfileById(userId);
    if (!profile) throw new StoreError("Profile not found", 404);

    if (patch.username !== undefined && patch.username !== profile.username) {
      const parsed = usernameSchema.safeParse(patch.username);
      if (!parsed.success) {
        throw new StoreError(parsed.error.issues[0]?.message ?? "Invalid username", 400);
      }
      if (!this.isUsernameAvailable(parsed.data)) {
        throw new StoreError(
          `duplicate key value violates unique constraint "profiles_username_key"`,
          409,
          "23505",
        );
      }
      profile.username = parsed.data;
      if (parsed.data === "abdessamed") profile.verified = true;
    }

    if (patch.bio !== undefined && patch.bio !== null && patch.bio.length > 50) {
      throw new StoreError("Bio must be 50 characters or fewer", 400);
    }

    for (const platform of SOCIAL_PLATFORMS) {
      const val = patch[platform.field];
      if (val !== undefined && val !== null && val !== "") {
        const err = validateSocialUrl(platform, val);
        if (err) throw new StoreError(`${platform.label}: ${err}`, 400);
      }
    }

    const forbidden = new Set(["id", "created_at", "updated_at", "verified"]);
    const mutable = profile as Record<string, unknown>;
    for (const [key, value] of Object.entries(patch)) {
      if (forbidden.has(key) || key === "username") continue;
      if (key in profile && value !== undefined) {
        mutable[key] = value;
      }
    }
    profile.updated_at = new Date().toISOString();
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
    items: Array<{ profile_id: string; platform: string; enabled: boolean; position: number }>,
  ) {
    const now = new Date().toISOString();
    for (const item of items) {
      if (item.profile_id !== userId) {
        throw new StoreError("Not authorized to update these settings", 403);
      }
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
  ) {
    if (actorUserId && actorUserId === input.profile_id) {
      return;
    }
    if (!this.getProfileById(input.profile_id)) return;
    if (input.event_type === "social_click" && !input.platform) return;
    if (input.event_type === "custom_link_click" && !input.custom_link_id) return;

    this.data.profileEvents.push({
      id: crypto.randomUUID(),
      profile_id: input.profile_id,
      event_type: input.event_type,
      platform: input.platform ?? null,
      custom_link_id: input.custom_link_id ?? null,
      visitor_id: input.visitor_id ?? null,
      country: input.country ?? null,
      created_at: new Date().toISOString(),
    });
    this.persist();
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
    if (
      parts.length !== 2 ||
      !parts[0] ||
      !parts[1] ||
      parts[0] === "." ||
      parts[0] === ".." ||
      parts[1] === "." ||
      parts[1] === ".." ||
      parts[1].includes("\\")
    ) {
      throw new StoreError("Invalid storage path", 400);
    }
    if (ownerId && parts[0] !== ownerId) {
      throw new StoreError("Unauthorized storage path", 403);
    }
  }

  saveMediaFile(
    userId: string,
    bucket: string,
    objectPath: string,
    bytes: Buffer,
    contentType: string,
  ): string {
    this.assertSafeMediaPath(bucket, objectPath, userId);
    const target = path.join(this.dataDir, "media", bucket, objectPath);
    this.ensureDir(path.dirname(target));
    fs.writeFileSync(target, bytes);
    fs.writeFileSync(`${target}.meta.json`, JSON.stringify({ contentType }));
    return objectPath;
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
    let contentType = "application/octet-stream";
    const metaPath = `${target}.meta.json`;
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as { contentType?: string };
        if (meta.contentType) contentType = meta.contentType;
      } catch {
        /* ignore malformed meta */
      }
    } else {
      const ext = path.extname(target).toLowerCase();
      if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
      else if (ext === ".png") contentType = "image/png";
      else if (ext === ".webp") contentType = "image/webp";
      else if (ext === ".gif") contentType = "image/gif";
      else if (ext === ".mp4") contentType = "video/mp4";
      else if (ext === ".webm") contentType = "video/webm";
    }
    return { bytes, contentType };
  }

  listMediaFiles(userId: string, bucket: string): Array<{ id: string; name: string }> {
    if (!ALLOWED_BUCKETS.has(bucket)) return [];
    const dir = path.join(this.dataDir, "media", bucket, userId);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => !name.endsWith(".meta.json"))
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

  deleteAccount(userId: string, usernameConfirmation: string, password?: string) {
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) throw new StoreError("User not found", 404);

    if (user.providers.includes("email")) {
      if (!password || !verifyPassword(password, user.passwordHash)) {
        throw new StoreError("Your current password is incorrect", 400);
      }
    }

    const profile = this.getProfileById(userId);
    if (profile && profile.username.toLowerCase() !== usernameConfirmation.trim().toLowerCase()) {
      throw new StoreError("The username you typed does not match this account", 400);
    }

    for (const bucket of ALLOWED_BUCKETS) {
      const userDir = path.join(this.dataDir, "media", bucket, userId);
      try {
        fs.rmSync(userDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }

    this.deletedUserIds.add(userId);
    this.data.profileEvents = this.data.profileEvents.filter((e) => e.profile_id !== userId);
    this.data.customLinks = this.data.customLinks.filter((l) => l.profile_id !== userId);
    this.data.socialLinkSettings = this.data.socialLinkSettings.filter(
      (s) => s.profile_id !== userId,
    );
    this.data.profiles = this.data.profiles.filter((p) => p.id !== userId);
    this.data.resetTokens = this.data.resetTokens.filter((t) => t.userId !== userId);
    this.data.users = this.data.users.filter((u) => u.id !== userId);
    this.persist();
  }
}

let sharedStore: TinkiStore | undefined;

export function getStore(): TinkiStore {
  if (!sharedStore) {
    sharedStore = new TinkiStore();
  }
  return sharedStore;
}
