import { apiFetch, getStoredToken } from "@/lib/api";
import type { SocialKey } from "@/lib/socials";

const VISITOR_KEY = "onelink_visitor";
const VIEW_PREFIX = "onelink_viewed:";
const COUNTRY_KEY = "onelink_country";

let countryPromise: Promise<string | null> | null = null;

export function getCountryCode(): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  try {
    const cached = window.localStorage.getItem(COUNTRY_KEY);
    if (cached) return Promise.resolve(cached);
  } catch {
    /* storage unavailable */
  }
  if (!countryPromise) {
    countryPromise = fetch("https://www.cloudflare.com/cdn-cgi/trace")
      .then((res) => (res.ok ? res.text() : ""))
      .then((text) => {
        const match = text.match(/^loc=([A-Z]{2})$/m);
        const code = match?.[1] ?? null;
        if (code) {
          try {
            window.localStorage.setItem(COUNTRY_KEY, code);
          } catch {
            /* storage unavailable */
          }
        }
        return code;
      })
      .catch(() => null);
  }
  return countryPromise;
}

export function getVisitorId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(VISITOR_KEY);
    if (!id) {
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
    return window.localStorage.getItem(`${VIEW_PREFIX}${key}`) !== null;
  } catch {
    return false;
  }
}

function markSeen(key: string) {
  try {
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
  if (typeof window !== "undefined") {
    void import("@/lib/firestore")
      .then(({ recordProfileEventFirestore }) => recordProfileEventFirestore(event))
      .catch(() => undefined);
    return;
  }
  if (typeof fetch === "undefined") return;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getStoredToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  void fetch("/api/events", {
    method: "POST",
    keepalive: true,
    credentials: "include",
    headers,
    body: JSON.stringify(event),
  }).catch(() => {
    /* a lost click is never worth interrupting the visitor */
  });
}

export async function trackProfileView(profileId: string, isOwner: boolean) {
  if (isOwner) return;
  const visitorId = getVisitorId();
  if (!visitorId || seenRecently(profileId)) return;
  const country = await getCountryCode();
  try {
    if (typeof window !== "undefined") {
      const { recordProfileEventFirestore } = await import("@/lib/firestore");
      await recordProfileEventFirestore({
        profile_id: profileId,
        event_type: "profile_view",
        visitor_id: visitorId,
        country,
      });
    } else {
      await apiFetch("/api/events", {
        method: "POST",
        body: JSON.stringify({
          profile_id: profileId,
          event_type: "profile_view",
          visitor_id: visitorId,
          country,
        }),
      });
    }
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
      const { auth: fbAuth, fetchAnalyticsFirestore } = await import("@/lib/firestore");
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
