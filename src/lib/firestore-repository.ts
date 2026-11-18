import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

import firebaseConfig from "../../firebase-applet-config.json";
import type { ProfileAnalytics } from "@/lib/analytics";
import type { CustomLink, CustomLinkType } from "@/lib/custom-links";
import type { Profile } from "@/lib/profiles";
import type { SocialLinkSetting } from "@/lib/social-link-settings";
import {
  RESERVED_USERNAMES,
  SOCIAL_PLATFORMS,
  usernameSchema,
  validateSocialUrl,
  type SocialKey,
} from "@/lib/profile-validation";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;
let cachedAuth: Auth | null = null;
let connectionTested = false;
let persistenceConfigured = false;

export function getFirebaseClientApp(): FirebaseApp {
  if (cachedApp) return cachedApp;
  cachedApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return cachedApp;
}

export function getFirebaseClientAuth(): Auth {
  if (!cachedAuth) {
    const app = getFirebaseClientApp();
    cachedAuth = getAuth(app);
  }
  if (!persistenceConfigured && typeof window !== "undefined") {
    persistenceConfigured = true;
    void setPersistence(cachedAuth, browserLocalPersistence).catch(() => {
      /* persistence unavailable in restricted private context */
    });
  }
  return cachedAuth;
}

export const db: Firestore = (() => {
  if (cachedDb) return cachedDb;
  const app = getFirebaseClientApp();
  try {
    cachedDb = initializeFirestore(
      app,
      { experimentalAutoDetectLongPolling: true },
      firebaseConfig.firestoreDatabaseId,
    );
  } catch {
    cachedDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
  return cachedDb;
})();

export const auth: Auth = getFirebaseClientAuth();

async function testConnection() {
  if (typeof window === "undefined" || connectionTested) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline") &&
      (typeof navigator === "undefined" || navigator.onLine !== false)
    ) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

void testConnection();

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const currentUser = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid ?? null,
      email: currentUser?.email ?? null,
      emailVerified: currentUser?.emailVerified ?? null,
      isAnonymous: currentUser?.isAnonymous ?? null,
      tenantId: currentUser?.tenantId ?? null,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId ?? null,
          email: provider.email ?? null,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function isoFromFirestoreTimestamp(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const fn = (value as { toDate?: () => Date }).toDate;
    if (typeof fn === "function") return fn().toISOString();
  }
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

function clamp(num: unknown, min: number, max: number, fallback: number): number {
  if (typeof num !== "number" || !Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function optStr(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
function hexOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed : null;
}

function hexOrFallback(value: unknown, fallback: string): string {
  return hexOrNull(value) ?? fallback;
}

const PROFILE_DEFAULTS: Omit<Profile, "id" | "username" | "created_at" | "updated_at"> & {
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

function docToProfile(id: string, data: DocumentData): Profile & { verified: boolean } {
  return {
    ...PROFILE_DEFAULTS,
    ...(data as Partial<Profile & { verified: boolean }>),
    id,
    username: String(data["username"] ?? ""),
    verified: Boolean(data["verified"] ?? data["username"] === "abdessamed"),
    created_at: isoFromFirestoreTimestamp(data["created_at"]),
    updated_at: isoFromFirestoreTimestamp(data["updated_at"]),
  };
}

function docToCustomLink(id: string, data: DocumentData): CustomLink {
  return {
    id,
    profile_id: String(data["profile_id"] ?? ""),
    name: String(data["name"] ?? ""),
    url: String(data["url"] ?? ""),
    icon: String(data["icon"] ?? "globe"),
    enabled: Boolean(data["enabled"] ?? true),
    position: typeof data["position"] === "number" ? data["position"] : 0,
    link_type: String(data["link_type"] ?? "link"),
    created_at: isoFromFirestoreTimestamp(data["created_at"]),
    updated_at: isoFromFirestoreTimestamp(data["updated_at"]),
  };
}

function docToSocialSetting(id: string, data: DocumentData) {
  return {
    id,
    profile_id: String(data["profile_id"] ?? ""),
    platform: String(data["platform"] ?? ""),
    enabled: Boolean(data["enabled"] ?? true),
    position: typeof data["position"] === "number" ? data["position"] : 0,
    created_at: isoFromFirestoreTimestamp(data["created_at"]),
    updated_at: isoFromFirestoreTimestamp(data["updated_at"]),
  };
}

export function isFirebaseOwnerActive(targetId?: string): boolean {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return false;
  return !targetId || user.uid === targetId;
}

export async function syncFirebaseAccountDoc(
  fbUser: FirebaseUser,
  username?: string | null,
): Promise<void> {
  if (!fbUser.email || !fbUser.emailVerified) return;
  const accountPath = `accounts/${fbUser.uid}`;
  const ref = doc(db, "accounts", fbUser.uid);
  const providers = [
    ...new Set(
      fbUser.providerData
        .map((p) => (p.providerId === "password" ? "email" : p.providerId === "google.com" ? "google" : p.providerId))
        .filter(Boolean),
    ),
  ];
  if (providers.length === 0) providers.push("google");

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        id: fbUser.uid,
        email: fbUser.email.trim().toLowerCase().slice(0, 254),
        name: fbUser.displayName ? fbUser.displayName.trim().slice(0, 80) : null,
        username: username ? username.trim().toLowerCase() : null,
        providers: providers.slice(0, 4),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    } else {
      const current = existing.data();
      const nextUsername = username ? username.trim().toLowerCase() : (current["username"] ?? null);
      const nextName = fbUser.displayName ? fbUser.displayName.trim().slice(0, 80) : (current["name"] ?? null);
      await updateDoc(ref, {
        email: fbUser.email.trim().toLowerCase().slice(0, 254),
        name: nextName,
        username: nextUsername,
        providers: [...new Set([...(Array.isArray(current["providers"]) ? current["providers"] : []), ...providers])].slice(0, 4),
        updated_at: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, accountPath);
  }
}

export async function checkUsernameAvailableFirestore(username: string): Promise<boolean> {
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) return false;
  const clean = parsed.data;
  if (RESERVED_USERNAMES.has(clean)) return false;

  const path = `usernames/${clean}`;
  try {
    const snap = await getDocFromServer(doc(db, "usernames", clean));
    return !snap.exists();
  } catch {
    try {
      const snap = await getDoc(doc(db, "usernames", clean));
      return !snap.exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }
}

export async function fetchProfileByIdFirestore(uid: string): Promise<Profile | null> {
  if (!uid) return null;
  const path = `profiles/${uid}`;
  try {
    const snap = await getDoc(doc(db, "profiles", uid));
    if (!snap.exists()) return null;
    return docToProfile(snap.id, snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function fetchProfileByUsernameFirestore(username: string): Promise<Profile | null> {
  const clean = username.trim().toLowerCase();
  if (!clean || !/^[a-z0-9_-]{1,20}$/.test(clean)) return null;

  const unamePath = `usernames/${clean}`;
  try {
    const unameSnap = await getDoc(doc(db, "usernames", clean));
    if (unameSnap.exists()) {
      const ownerId = unameSnap.data()["owner_id"];
      if (typeof ownerId === "string" && ownerId) {
        return await fetchProfileByIdFirestore(ownerId);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, unamePath);
  }

  try {
    const q = query(collection(db, "profiles"), where("username", "==", clean));
    const snaps = await getDocs(q);
    const first = snaps.docs[0];
    return first ? docToProfile(first.id, first.data()) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "profiles");
  }
}

export async function createProfileFirestore(
  rawUsername: string,
  seed?: Partial<Profile>,
): Promise<Profile> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");

  const parsed = usernameSchema.safeParse(rawUsername);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid username");
  }
  const username = parsed.data;
  const available = await checkUsernameAvailableFirestore(username);
  if (!available) {
    const err = new Error('duplicate key value violates unique constraint "profiles_username_key"') as Error & {
      code?: string;
    };
    err.code = "23505";
    throw err;
  }

  const uid = user.uid;
  const batch = writeBatch(db);
  const unameRef = doc(db, "usernames", username);
  const profileRef = doc(db, "profiles", uid);

  const profilePayload: Record<string, unknown> = {
    ...PROFILE_DEFAULTS,
    ...(seed ?? {}),
    id: uid,
    username,
    display_name: optStr(seed?.display_name ?? user.displayName ?? null, 80),
    bio: optStr(seed?.bio ?? null, 50),
    avatar_path: optStr(seed?.avatar_path ?? null, 256),
    cover_photo_path: optStr(seed?.cover_photo_path ?? null, 256),
    cover_photo_x: clamp(seed?.cover_photo_x, 0, 100, 50),
    cover_photo_y: clamp(seed?.cover_photo_y, 0, 100, 50),
    show_qr_button: seed?.show_qr_button ?? true,
    verified: username === "abdessamed",
    card_background_color: hexOrFallback(seed?.card_background_color, PROFILE_DEFAULTS.card_background_color),
    card_gradient_color: hexOrFallback(seed?.card_gradient_color, PROFILE_DEFAULTS.card_gradient_color),
    card_gradient_angle: clamp(seed?.card_gradient_angle, 0, 360, 135),
    social_icon_color: hexOrNull(seed?.social_icon_color),
    social_icon_bg_color: hexOrNull(seed?.social_icon_bg_color),
    page_background_color: hexOrFallback(seed?.page_background_color, PROFILE_DEFAULTS.page_background_color),
    page_gradient_color: hexOrFallback(seed?.page_gradient_color, PROFILE_DEFAULTS.page_gradient_color),
    page_gradient_angle: clamp(seed?.page_gradient_angle, 0, 360, 135),
    page_background_image_url: optStr(seed?.page_background_image_url ?? null, 500),
    page_background_video_url: optStr(seed?.page_background_video_url ?? null, 500),
    name_color: hexOrNull(seed?.name_color),
    bio_color: hexOrNull(seed?.bio_color),
    qr_foreground_color: hexOrFallback(seed?.qr_foreground_color, PROFILE_DEFAULTS.qr_foreground_color),
    qr_background_color: hexOrFallback(seed?.qr_background_color, PROFILE_DEFAULTS.qr_background_color),
    qr_margin: Math.round(clamp(seed?.qr_margin, 0, 10, 4)),
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };

  for (const p of SOCIAL_PLATFORMS) {
    profilePayload[p.field] = optStr(seed?.[p.field] ?? null, 300);
  }

  batch.set(unameRef, {
    username,
    owner_id: uid,
    created_at: serverTimestamp(),
  });
  batch.set(profileRef, profilePayload);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `profiles/${uid}`);
  }

  await syncFirebaseAccountDoc(user, username);
  const created = await fetchProfileByIdFirestore(uid);
  if (!created) throw new Error("Profile creation did not persist");
  return created;
}

export async function updateMyProfileFirestore(patch: Partial<Profile>): Promise<Profile> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const uid = user.uid;
  const profileRef = doc(db, "profiles", uid);

  const current = await fetchProfileByIdFirestore(uid);
  if (!current) throw new Error("Profile not found");

  const sanitized: Record<string, unknown> = {};

  if (patch.bio !== undefined) {
    if (patch.bio !== null && patch.bio.length > 50) {
      throw new Error("Bio must be 50 characters or fewer");
    }
    sanitized["bio"] = optStr(patch.bio, 50);
  }
  if (patch.display_name !== undefined) {
    sanitized["display_name"] = optStr(patch.display_name, 80);
  }
  if (patch.avatar_path !== undefined) {
    sanitized["avatar_path"] = optStr(patch.avatar_path, 256);
  }
  if (patch.cover_photo_path !== undefined) {
    sanitized["cover_photo_path"] = optStr(patch.cover_photo_path, 256);
  }
  if (patch.cover_photo_x !== undefined) {
    sanitized["cover_photo_x"] = clamp(patch.cover_photo_x, 0, 100, 50);
  }
  if (patch.cover_photo_y !== undefined) {
    sanitized["cover_photo_y"] = clamp(patch.cover_photo_y, 0, 100, 50);
  }
  if (patch.show_qr_button !== undefined) {
    sanitized["show_qr_button"] = Boolean(patch.show_qr_button);
  }

  for (const platform of SOCIAL_PLATFORMS) {
    const val = patch[platform.field];
    if (val !== undefined) {
      if (val !== null && val !== "") {
        const err = validateSocialUrl(platform, val);
        if (err) throw new Error(`${platform.label}: ${err}`);
      }
      sanitized[platform.field] = optStr(val, 300);
    }
  }

  if (patch.card_background_type !== undefined) sanitized["card_background_type"] = patch.card_background_type;
  if (patch.card_background_color !== undefined) {
    sanitized["card_background_color"] = hexOrFallback(patch.card_background_color, current.card_background_color);
  }
  if (patch.card_gradient_color !== undefined) {
    sanitized["card_gradient_color"] = hexOrFallback(patch.card_gradient_color, current.card_gradient_color);
  }
  if (patch.card_gradient_angle !== undefined) {
    sanitized["card_gradient_angle"] = clamp(patch.card_gradient_angle, 0, 360, 135);
  }
  if (patch.social_icon_color !== undefined) {
    sanitized["social_icon_color"] = hexOrNull(patch.social_icon_color);
  }
  if (patch.social_icon_bg_color !== undefined) {
    sanitized["social_icon_bg_color"] = hexOrNull(patch.social_icon_bg_color);
  }
  if (patch.page_background_type !== undefined) sanitized["page_background_type"] = patch.page_background_type;
  if (patch.page_background_color !== undefined) {
    sanitized["page_background_color"] = hexOrFallback(patch.page_background_color, current.page_background_color);
  }
  if (patch.page_gradient_color !== undefined) {
    sanitized["page_gradient_color"] = hexOrFallback(patch.page_gradient_color, current.page_gradient_color);
  }
  if (patch.page_gradient_angle !== undefined) {
    sanitized["page_gradient_angle"] = clamp(patch.page_gradient_angle, 0, 360, 135);
  }
  if (patch.page_background_image_url !== undefined) {
    sanitized["page_background_image_url"] = optStr(patch.page_background_image_url, 500);
  }
  if (patch.page_background_image_mode !== undefined) {
    sanitized["page_background_image_mode"] = patch.page_background_image_mode === "repeat" ? "repeat" : "cover";
  }
  if (patch.page_background_use_image !== undefined) {
    sanitized["page_background_use_image"] = Boolean(patch.page_background_use_image);
  }
  if (patch.page_background_video_url !== undefined) {
    sanitized["page_background_video_url"] = optStr(patch.page_background_video_url, 500);
  }
  if (patch.page_background_media_type !== undefined) {
    sanitized["page_background_media_type"] = patch.page_background_media_type === "video" ? "video" : "image";
  }
  if (patch.name_font_family !== undefined) sanitized["name_font_family"] = patch.name_font_family;
  if (patch.name_font_weight !== undefined) sanitized["name_font_weight"] = clamp(patch.name_font_weight, 100, 900, 600);
  if (patch.name_font_style !== undefined) sanitized["name_font_style"] = patch.name_font_style;
  if (patch.bio_font_family !== undefined) sanitized["bio_font_family"] = patch.bio_font_family;
  if (patch.bio_font_weight !== undefined) sanitized["bio_font_weight"] = clamp(patch.bio_font_weight, 100, 900, 400);
  if (patch.bio_font_style !== undefined) sanitized["bio_font_style"] = patch.bio_font_style;
  if (patch.name_color !== undefined) sanitized["name_color"] = hexOrNull(patch.name_color);
  if (patch.bio_color !== undefined) sanitized["bio_color"] = hexOrNull(patch.bio_color);
  if (patch.qr_foreground_color !== undefined) {
    sanitized["qr_foreground_color"] = hexOrFallback(patch.qr_foreground_color, current.qr_foreground_color);
  }
  if (patch.qr_background_color !== undefined) {
    sanitized["qr_background_color"] = hexOrFallback(patch.qr_background_color, current.qr_background_color);
  }
  if (patch.qr_margin !== undefined) {
    sanitized["qr_margin"] = Math.round(clamp(patch.qr_margin, 0, 10, 4));
  }
  if (patch.qr_error_correction !== undefined) sanitized["qr_error_correction"] = patch.qr_error_correction;
  if (patch.qr_module_shape !== undefined) sanitized["qr_module_shape"] = patch.qr_module_shape;
  if (patch.qr_eye_shape !== undefined) sanitized["qr_eye_shape"] = patch.qr_eye_shape;

  const requestedUsername =
    patch.username !== undefined ? patch.username.trim().toLowerCase() : current.username;

  if (requestedUsername !== current.username) {
    const parsed = usernameSchema.safeParse(requestedUsername);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Invalid username");
    }
    const nextUsername = parsed.data;
    if (!(await checkUsernameAvailableFirestore(nextUsername))) {
      const err = new Error('duplicate key value violates unique constraint "profiles_username_key"') as Error & {
        code?: string;
      };
      err.code = "23505";
      throw err;
    }

    const batch = writeBatch(db);
    batch.set(doc(db, "usernames", nextUsername), {
      username: nextUsername,
      owner_id: uid,
      created_at: serverTimestamp(),
    });
    batch.update(profileRef, {
      ...sanitized,
      username: nextUsername,
      verified: nextUsername === "abdessamed",
      updated_at: serverTimestamp(),
    });
    if (current.username) {
      batch.delete(doc(db, "usernames", current.username));
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `profiles/${uid}`);
    }
    await syncFirebaseAccountDoc(user, nextUsername);
  } else {
    try {
      await updateDoc(profileRef, {
        ...sanitized,
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `profiles/${uid}`);
    }
  }

  const updated = await fetchProfileByIdFirestore(uid);
  if (!updated) throw new Error("Profile not found after update");
  return updated;
}

// --- Custom Links ---
export async function fetchCustomLinksFirestore(
  profileId: string,
  enabledOnly = false,
): Promise<CustomLink[]> {
  if (!profileId) return [];
  try {
    const q = query(collection(db, "custom_links"), where("profile_id", "==", profileId));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => docToCustomLink(d.id, d.data()))
      .filter((l) => !enabledOnly || l.enabled)
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "custom_links");
  }
}

export async function createCustomLinkFirestore(input: {
  name: string;
  url: string;
  icon: string;
  link_type: CustomLinkType;
  position?: number;
  enabled?: boolean;
}): Promise<CustomLink> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const existing = await fetchCustomLinksFirestore(user.uid, false);
  const nextPos =
    typeof input.position === "number"
      ? input.position
      : existing.length > 0
        ? Math.max(...existing.map((l) => l.position)) + 1
        : 0;
  const linkId = crypto.randomUUID();
  const cleanName = input.name.trim().slice(0, 80);
  if (!cleanName) throw new Error("Link name must be 1-80 characters");
  const cleanUrl = input.url.trim().slice(0, 500);
  if (!cleanUrl) throw new Error("Link URL is required");
  const cleanIcon = (input.icon || "globe").trim().slice(0, 40);

  const path = `custom_links/${linkId}`;
  try {
    await setDoc(doc(db, "custom_links", linkId), {
      id: linkId,
      profile_id: user.uid,
      name: cleanName,
      url: cleanUrl,
      icon: cleanIcon,
      enabled: input.enabled ?? true,
      position: Math.min(1000, Math.max(0, Math.round(nextPos))),
      link_type: input.link_type,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    const saved = await getDoc(doc(db, "custom_links", linkId));
    return docToCustomLink(linkId, saved.data() ?? {});
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCustomLinkFirestore(
  id: string,
  patch: Partial<Pick<CustomLink, "name" | "url" | "icon" | "link_type" | "enabled">>,
): Promise<CustomLink> {
  const updateData: Record<string, unknown> = { updated_at: serverTimestamp() };
  if (patch.name !== undefined) updateData["name"] = patch.name.trim().slice(0, 80);
  if (patch.url !== undefined) updateData["url"] = patch.url.trim().slice(0, 500);
  if (patch.icon !== undefined) updateData["icon"] = patch.icon.trim().slice(0, 40);
  if (patch.link_type !== undefined) updateData["link_type"] = patch.link_type;
  if (patch.enabled !== undefined) updateData["enabled"] = Boolean(patch.enabled);

  const path = `custom_links/${id}`;
  try {
    await updateDoc(doc(db, "custom_links", id), updateData);
    const saved = await getDoc(doc(db, "custom_links", id));
    return docToCustomLink(id, saved.data() ?? {});
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCustomLinkFirestore(id: string): Promise<void> {
  const path = `custom_links/${id}`;
  try {
    await deleteDoc(doc(db, "custom_links", id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function reorderCustomLinksFirestore(
  targetProfileId: string,
  orderedIds: string[],
): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.uid !== targetProfileId) {
    throw new Error("Not authorized to reorder links for this profile");
  }
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, "custom_links", id), {
      position: Math.min(1000, Math.max(0, index)),
      updated_at: serverTimestamp(),
    });
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, "custom_links");
  }
}

// --- Social Link Settings ---
export async function fetchSocialLinkSettingsFirestore(profileId: string): Promise<SocialLinkSetting[]> {
  if (!profileId) return [];
  try {
    const q = query(collection(db, "social_link_settings"), where("profile_id", "==", profileId));
    const snap = await getDocs(q);
    const saved = new Map(
      snap.docs.map((d) => {
        const row = docToSocialSetting(d.id, d.data());
        return [row.platform, row];
      }),
    );
    return SOCIAL_PLATFORMS.map((platform, position) => {
      const setting = saved.get(platform.key);
      return {
        id: setting?.id,
        profile_id: profileId,
        platform: platform.key as SocialKey,
        enabled: setting?.enabled ?? true,
        position: setting?.position ?? position,
      } satisfies SocialLinkSetting;
    }).sort((a, b) => a.position - b.position);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "social_link_settings");
  }
}

export async function saveSocialLinkSettingsFirestore(settings: SocialLinkSetting[]): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const existingSnap = await getDocs(
    query(collection(db, "social_link_settings"), where("profile_id", "==", user.uid)),
  ).catch((error) => handleFirestoreError(error, OperationType.LIST, "social_link_settings"));

  const existingPlatforms = new Set(existingSnap.docs.map((d) => String(d.data()["platform"] ?? "")));
  const batch = writeBatch(db);

  settings.forEach((setting, position) => {
    const docId = `${user.uid}_${setting.platform}`;
    const ref = doc(db, "social_link_settings", docId);
    const pos = Math.min(50, Math.max(0, position));
    if (existingPlatforms.has(setting.platform)) {
      batch.update(ref, {
        enabled: Boolean(setting.enabled),
        position: pos,
        updated_at: serverTimestamp(),
      });
    } else {
      batch.set(ref, {
        id: docId,
        profile_id: user.uid,
        platform: setting.platform,
        enabled: Boolean(setting.enabled),
        position: pos,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    }
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, "social_link_settings");
  }
}

// --- Analytics Events ---
export async function recordProfileEventFirestore(input: {
  profile_id: string;
  event_type: "profile_view" | "social_click" | "custom_link_click";
  platform?: string | null;
  custom_link_id?: string | null;
  visitor_id?: string | null;
  country?: string | null;
}): Promise<void> {
  const user = auth.currentUser;
  if (user && user.uid === input.profile_id) return;
  const eventId = crypto.randomUUID();
  const payload: Record<string, unknown> = {
    id: eventId,
    profile_id: input.profile_id,
    event_type: input.event_type,
    platform: input.platform ? input.platform.slice(0, 30) : null,
    custom_link_id: input.custom_link_id ? input.custom_link_id.slice(0, 128) : null,
    visitor_id: input.visitor_id ? input.visitor_id.slice(0, 128) : null,
    country: input.country ? input.country.slice(0, 8) : null,
    created_at: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, "profile_events", eventId), payload);
  } catch {
    /* visitor analytics failure should never disrupt public profile UX */
  }
}

export async function fetchAnalyticsFirestore(profileId: string): Promise<ProfileAnalytics> {
  const user = auth.currentUser;
  if (!user || user.uid !== profileId) {
    throw new Error("Forbidden");
  }
  try {
    const q = query(
      collection(db, "profile_events"),
      where("profile_id", "==", profileId),
      orderBy("created_at", "desc"),
    );
    let snap;
    try {
      snap = await getDocs(q);
    } catch {
      snap = await getDocs(
        query(collection(db, "profile_events"), where("profile_id", "==", profileId)),
      );
    }

    const seenVisitors = new Set<string>();
    let anonymousViews = 0;
    let clicks = 0;
    let customLinkClicks = 0;
    const byPlatform: Record<string, number> = {};
    const byCustomLink: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    const seenCountryVisitors = new Set<string>();

    for (const d of snap.docs) {
      const ev = d.data();
      const eventType = String(ev["event_type"] ?? "");
      const visitorId = typeof ev["visitor_id"] === "string" ? ev["visitor_id"] : null;
      const country = typeof ev["country"] === "string" ? ev["country"] : null;
      const platform = typeof ev["platform"] === "string" ? ev["platform"] : null;
      const customLinkId = typeof ev["custom_link_id"] === "string" ? ev["custom_link_id"] : null;

      if (eventType === "profile_view") {
        if (visitorId) {
          if (!seenVisitors.has(visitorId)) {
            seenVisitors.add(visitorId);
            if (country && !seenCountryVisitors.has(visitorId)) {
              seenCountryVisitors.add(visitorId);
              byCountry[country] = (byCountry[country] ?? 0) + 1;
            }
          }
        } else {
          anonymousViews += 1;
          if (country) byCountry[country] = (byCountry[country] ?? 0) + 1;
        }
      } else if (eventType === "social_click") {
        clicks += 1;
        if (platform) byPlatform[platform] = (byPlatform[platform] ?? 0) + 1;
      } else if (eventType === "custom_link_click") {
        customLinkClicks += 1;
        if (customLinkId) byCustomLink[customLinkId] = (byCustomLink[customLinkId] ?? 0) + 1;
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
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "profile_events");
  }
}

// --- Chunked Persistent Media Storage ---
const MEDIA_CHUNK_BYTES = 450_000;

export function buildMediaDocId(
  bucket: "avatars" | "covers" | "backgrounds",
  objectPath: string,
): string {
  const parts = objectPath.split("/");
  const ownerId = parts[0] ?? "";
  const filename = parts[1] ?? "";
  const safeFile = filename.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${bucket}__${ownerId}__${safeFile}`;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export async function uploadMediaFirestore(
  bucket: "avatars" | "covers" | "backgrounds",
  objectPath: string,
  body: Blob,
  contentType: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const parts = objectPath.split("/");
  if (parts.length !== 2 || parts[0] !== user.uid || !parts[1]) {
    throw new Error("Unauthorized media upload path");
  }

  const bytes = new Uint8Array(await body.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 6 * 1024 * 1024) {
    throw new Error("File size must be between 1 byte and 6 MB");
  }

  const chunkCount = Math.ceil(bytes.byteLength / MEDIA_CHUNK_BYTES);
  const mediaId = buildMediaDocId(bucket, objectPath);
  const mediaRef = doc(db, "media_objects", mediaId);

  const batch = writeBatch(db);
  batch.set(mediaRef, {
    id: mediaId,
    owner_id: user.uid,
    bucket,
    object_path: objectPath,
    name: parts[1].slice(0, 128),
    content_type: (contentType || body.type || "application/octet-stream").slice(0, 120),
    byte_length: bytes.byteLength,
    chunk_count: chunkCount,
    created_at: serverTimestamp(),
  });

  for (let i = 0; i < chunkCount; i++) {
    const start = i * MEDIA_CHUNK_BYTES;
    const end = Math.min(bytes.byteLength, start + MEDIA_CHUNK_BYTES);
    const b64 = uint8ToBase64(bytes.subarray(start, end));
    batch.set(doc(db, "media_objects", mediaId, "chunks", String(i)), {
      index: i,
      data: b64,
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `media_objects/${mediaId}`);
  }
}

export async function listMediaFirestore(
  bucket: "avatars" | "covers" | "backgrounds",
): Promise<Array<{ id: string; name: string }>> {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const q = query(
      collection(db, "media_objects"),
      where("owner_id", "==", user.uid),
      where("bucket", "==", bucket),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: String(d.data()["object_path"] ?? d.id),
      name: String(d.data()["name"] ?? ""),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "media_objects");
  }
}

export async function removeMediaFirestore(
  bucket: "avatars" | "covers" | "backgrounds",
  paths: string[],
): Promise<void> {
  const user = auth.currentUser;
  if (!user || paths.length === 0) return;

  for (const objectPath of paths) {
    const mediaId = buildMediaDocId(bucket, objectPath);
    const mediaRef = doc(db, "media_objects", mediaId);
    try {
      const metaSnap = await getDoc(mediaRef);
      if (!metaSnap.exists()) continue;
      const data = metaSnap.data();
      if (data["owner_id"] !== user.uid) continue;
      const chunkCount = Number(data["chunk_count"] ?? 0);
      const batch = writeBatch(db);
      for (let i = 0; i < chunkCount; i++) {
        batch.delete(doc(db, "media_objects", mediaId, "chunks", String(i)));
      }
      batch.delete(mediaRef);
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `media_objects/${mediaId}`);
    }
  }
}

async function deleteDocRefsInBatches(
  refs: Array<ReturnType<typeof doc>>,
): Promise<void> {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + 400)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

// --- Full Account Deletion from Firestore ---
export async function deleteAccountFirestore(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const uid = user.uid;

  try {
    const [profile, accountSnap] = await Promise.all([
      fetchProfileByIdFirestore(uid),
      getDoc(doc(db, "accounts", uid)),
    ]);

    const mediaSnap = await getDocs(
      query(collection(db, "media_objects"), where("owner_id", "==", uid)),
    );
    for (const mediaDoc of mediaSnap.docs) {
      const chunkCount = Math.min(20, Math.max(0, Number(mediaDoc.data()["chunk_count"] ?? 0)));
      const batch = writeBatch(db);
      for (let i = 0; i < chunkCount; i++) {
        batch.delete(doc(db, "media_objects", mediaDoc.id, "chunks", String(i)));
      }
      batch.delete(mediaDoc.ref);
      await batch.commit();
    }

    const [eventsSnap, linksSnap, settingsSnap] = await Promise.all([
      getDocs(query(collection(db, "profile_events"), where("profile_id", "==", uid))),
      getDocs(query(collection(db, "custom_links"), where("profile_id", "==", uid))),
      getDocs(query(collection(db, "social_link_settings"), where("profile_id", "==", uid))),
    ]);

    const accountData = accountSnap.exists() ? accountSnap.data() : undefined;
    const claimedUsernames = new Set<string>();
    if (profile?.username) claimedUsernames.add(profile.username.toLowerCase());
    if (typeof accountData?.["username"] === "string" && accountData["username"]) {
      claimedUsernames.add(accountData["username"].toLowerCase());
    }

    const refsToDelete: Array<ReturnType<typeof doc>> = [
      ...eventsSnap.docs.map((d) => d.ref),
      ...linksSnap.docs.map((d) => d.ref),
      ...settingsSnap.docs.map((d) => d.ref),
      ...[...claimedUsernames].map((uname) => doc(db, "usernames", uname)),
      doc(db, "profiles", uid),
      doc(db, "accounts", uid),
    ];

    await deleteDocRefsInBatches(refsToDelete);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `accounts/${uid}`);
  }
}
