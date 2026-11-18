import { apiFetch } from "@/lib/api-client";
import type { SocialKey } from "@/lib/profile-validation";

export const VISITOR_KEY = "tinki_visitor";
export const VIEW_PREFIX = "tinki_viewed:";
const LEGACY_VISITOR_KEY = "onelink_visitor";
const LEGACY_VIEW_PREFIX = "onelink_viewed:";
const STORAGE_MIGRATED_KEY = "tinki_storage_migrated_v1";
const VIEW_TTL_MS = 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function migrateLegacyAnalyticsStorage(storage?: Storage | null): void {
  const target = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!target) return;

  try {
    if (target.getItem(STORAGE_MIGRATED_KEY) === "1") {
      return;
    }

    const legacyVisitor = target.getItem(LEGACY_VISITOR_KEY);
    if (legacyVisitor !== null) {
      const currentVisitor = target.getItem(VISITOR_KEY);
      if ((!currentVisitor || !UUID_RE.test(currentVisitor)) && UUID_RE.test(legacyVisitor)) {
        target.setItem(VISITOR_KEY, legacyVisitor);
      }
      target.removeItem(LEGACY_VISITOR_KEY);
    }

    const legacyViewKeys: string[] = [];
    for (let i = 0; i < target.length; i++) {
      const key = target.key(i);
      if (key && key.startsWith(LEGACY_VIEW_PREFIX)) {
        legacyViewKeys.push(key);
      }
    }

    for (const oldKey of legacyViewKeys) {
      const suffix = oldKey.slice(LEGACY_VIEW_PREFIX.length);
      const newKey = `${VIEW_PREFIX}${suffix}`;
      const oldVal = target.getItem(oldKey);
      if (oldVal !== null) {
        const existingVal = target.getItem(newKey);
        const oldTs = Number(oldVal);
        const existingTs = existingVal !== null ? Number(existingVal) : Number.NaN;
        if (
          existingVal === null ||
          !Number.isFinite(existingTs) ||
          (Number.isFinite(oldTs) && oldTs > existingTs)
        ) {
          target.setItem(newKey, oldVal);
        }
      }
      target.removeItem(oldKey);
    }

    target.setItem(STORAGE_MIGRATED_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

export function getVisitorId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    migrateLegacyAnalyticsStorage(window.localStorage);
    let id = window.localStorage.getItem(VISITOR_KEY);
    if (!id || !UUID_RE.test(id)) {
      id = crypto.randomUUID();
      window.localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function seenRecently(key: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    migrateLegacyAnalyticsStorage(window.localStorage);
    const raw = window.localStorage.getItem(`${VIEW_PREFIX}${key}`);
    if (raw === null) return false;
    const recordedAt = Number(raw);
    if (!Number.isFinite(recordedAt)) return false;
    return Date.now() - recordedAt < VIEW_TTL_MS;
  } catch {
    return false;
  }
}

function markSeen(key: string) {
  try {
    migrateLegacyAnalyticsStorage(window.localStorage);
    window.localStorage.setItem(`${VIEW_PREFIX}${key}`, String(Date.now()));
  } catch {
    /* storage unavailable */
  }
}

type ClickEvent = {
  profile_id: string;
  event_type: "social_click" | "custom_link_click";
  platform?: SocialKey | null;
  custom_link_id?: string | null;
  visitor_id: string | null;
};

function sendClick(event: ClickEvent) {
  if (typeof fetch === "undefined") return;

  void fetch("/api/events", {
    method: "POST",
    keepalive: true,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  }).catch(() => {
    /* a lost click is never worth interrupting the visitor */
  });
}

export async function trackProfileView(profileId: string, isOwner: boolean) {
  if (isOwner) return;
  const visitorId = getVisitorId();
  if (!visitorId || seenRecently(profileId)) return;
  try {
    await apiFetch("/api/events", {
      method: "POST",
      body: JSON.stringify({
        profile_id: profileId,
        event_type: "profile_view",
        visitor_id: visitorId,
      }),
    });
    markSeen(profileId);
  } catch {
    /* ignore transient tracking errors */
  }
}

export function trackSocialClick(profileId: string, platform: SocialKey, isOwner: boolean) {
  const key = `${profileId}:social:${platform}`;
  const visitorId = getVisitorId();
  if (isOwner || !visitorId || seenRecently(key)) return;
  markSeen(key);
  sendClick({
    profile_id: profileId,
    event_type: "social_click",
    platform,
    visitor_id: visitorId,
  });
}

export function trackCustomLinkClick(profileId: string, customLinkId: string, isOwner: boolean) {
  const key = `${profileId}:link:${customLinkId}`;
  const visitorId = getVisitorId();
  if (isOwner || !visitorId || seenRecently(key)) return;
  markSeen(key);
  sendClick({
    profile_id: profileId,
    event_type: "custom_link_click",
    custom_link_id: customLinkId,
    visitor_id: visitorId,
  });
}

export type ProfileAnalytics = {
  views: number;
  clicks: number;
  byPlatform: Record<string, number>;
  customLinkClicks: number;
  byCustomLink: Record<string, number>;
  byCountry: Record<string, number>;
};

export async function fetchMyAnalytics(profileId: string): Promise<ProfileAnalytics> {
  try {
    if (typeof window !== "undefined" && profileId) {
      const { auth: fbAuth, fetchAnalyticsFirestore } = await import("@/lib/firestore-repository");
      if (fbAuth.currentUser?.uid === profileId) {
        return await fetchAnalyticsFirestore(profileId);
      }
    }
    const result = await apiFetch<Partial<ProfileAnalytics>>(
      `/api/analytics?profileId=${encodeURIComponent(profileId)}`,
    );
    return {
      views: Number(result.views ?? 0),
      clicks: Number(result.clicks ?? 0),
      byPlatform: result.byPlatform ?? {},
      customLinkClicks: Number(result.customLinkClicks ?? 0),
      byCustomLink: result.byCustomLink ?? {},
      byCountry: result.byCountry ?? {},
    };
  } catch (error) {
    console.warn("Analytics unavailable:", error instanceof Error ? error.message : String(error));
    return {
      views: 0,
      clicks: 0,
      byPlatform: {},
      customLinkClicks: 0,
      byCustomLink: {},
      byCountry: {},
    };
  }
}
