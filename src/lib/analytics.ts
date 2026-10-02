import { supabase } from "@/lib/app-supabase";
import type { SocialKey } from "@/lib/socials";

/**
 * Analytics counting behaviour
 * ---------------------------
 * - Every visitor gets a random UUID stored in localStorage ("onelink_visitor").
 *   It is not a fingerprint: it is cleared whenever the visitor clears their
 *   browser data, and it holds no personal information.
 * - A profile view is only recorded once per visitor, per profile. Refreshing
 *   the page therefore does not inflate the "Profile Views" number.
 * - Views without a persistent visitor ID are skipped, since those would be
 *   treated as separate visitors on every visit.
 * - Social clicks and custom link clicks are always recorded (a real intent
 *   each time).
 * - The profile owner never counts: the client skips tracking when the signed-in
 *   user owns the profile, and the database RLS policy independently rejects any
 *   event inserted by a signed-in user for their own profile.
 */

const VISITOR_KEY = "onelink_visitor";
const VIEW_PREFIX = "onelink_viewed:";
const COUNTRY_KEY = "onelink_country";

let countryPromise: Promise<string | null> | null = null;

/**
 * Best-effort country detection for profile views. Reads the two-letter ISO
 * code from Cloudflare's trace endpoint and caches it in localStorage so the
 * lookup happens at most once per browser. Any failure resolves to null and
 * the view is simply recorded without a country.
 */
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

// Each device counts at most once per profile view and once per link.
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

/**
 * `keepalive` keeps the request alive even if the browser leaves this page for
 * the link target in the same tab, so the click is never lost.
 *
 * When the visitor has a Supabase session, the request carries their access
 * token (`Authorization: Bearer <access_token>`), so PostgREST evaluates the
 * insert as the `authenticated` role and the policy "Signed-in visitors can
 * record events for other profiles" applies — the database rejects any event a
 * signed-in user records for their own profile. Without a session the request
 * goes out with only the `apikey` header and is evaluated as `anon` under the
 * anonymous insert policy.
 */
async function sendClick(event: ClickEvent) {
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

  if (url && key && typeof fetch !== "undefined") {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: key,
      Prefer: "return=minimal",
    };

    // Signed-in visitors send their access token so their clicks are evaluated
    // under the `authenticated` RLS policy; without a session the insert falls
    // through to `anon` as before.
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      /* a session lookup failure still records the click, as anon */
    }

    void fetch(`${url}/rest/v1/profile_events`, {
      method: "POST",
      keepalive: true,
      headers,
      body: JSON.stringify(event),
    }).catch(() => {
      /* a lost click is never worth interrupting the visitor */
    });
    return;
  }

  void supabase.from("profile_events").insert(event);
}

export async function trackProfileView(profileId: string, isOwner: boolean) {
  if (isOwner) return;
  const visitorId = getVisitorId();
  if (!visitorId || seenRecently(profileId)) return;
  markSeen(profileId);
  const country = await getCountryCode();
  await supabase.from("profile_events").insert({
    profile_id: profileId,
    event_type: "profile_view",
    visitor_id: visitorId,
    country,
  });
}

// The database requires a visitor_id on every event, so clicks without one are skipped.
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

/**
 * Owner-only read. The counts are aggregated inside the database by the
 * `get_profile_analytics` function, so no raw event rows travel to the client
 * and the 1000-row Data API cap can never silently truncate the totals.
 * The function runs with the caller's own privileges (RLS on `profile_events`
 * still applies) and additionally returns nothing unless the requested profile
 * belongs to the signed-in user.
 */
export async function fetchMyAnalytics(profileId: string): Promise<ProfileAnalytics> {
  const { data, error } = await supabase.rpc("get_profile_analytics", {
    target_profile_id: profileId,
  });

  if (error) throw error;

  const result = (data ?? {}) as Partial<ProfileAnalytics>;

  return {
    views: Number(result.views ?? 0),
    clicks: Number(result.clicks ?? 0),
    byPlatform: result.byPlatform ?? {},
    customLinkClicks: Number(result.customLinkClicks ?? 0),
    byCustomLink: result.byCustomLink ?? {},
    byCountry: result.byCountry ?? {},
  };
}
