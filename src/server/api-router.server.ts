import crypto from "node:crypto";

import {
  firstError,
  profileEventBodySchema,
  saveSocialLinkSettingsBodySchema,
  usernameSchema,
} from "@/lib/profile-validation";
import {
  assertRecentGoogleAuth,
  deleteFirebaseAuthUserServer,
  sendFirebasePasswordResetEmailServer,
  signInFirebaseEmailPasswordServer,
  verifyFirebaseIdToken,
  type GoogleTokenClaims,
} from "./firebase-token-verifier.server";
import { handleFirebaseProxyRequest } from "./firebase-proxy.server";
import {
  createProfileEventRest,
  deleteUserDataFromFirestoreRest,
  fetchCustomLinkByIdRest,
  getProfileByIdRest,
  getProfileByUsernameRest,
  getUsernameClaimRest,
  listCustomLinksRest,
  listSocialLinkSettingsRest,
  readMediaFromFirestoreRest,
} from "./firestore-public-rest.server";
import {
  detectMediaContentType,
  getStore,
  isLocalStoreEnabled,
  isMediaTypeAllowedForBucket,
  MAX_MEDIA_FILE_BYTES,
  normalizeDeclaredMediaType,
  SESSION_TTL_SECONDS,
  StoreError,
  type AuthSessionPayload,
  type PublicAuthUser,
} from "./local-fallback-store.server";

const SESSION_COOKIE = "tinki_session";
export const SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS;
const MAX_MEDIA_BYTES = MAX_MEDIA_FILE_BYTES;

function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

function extractToken(request: Request): string | null {
  const cookies = parseCookies(request.headers.get("cookie"));
  if (cookies[SESSION_COOKIE]) {
    return cookies[SESSION_COOKIE];
  }
  const auth = request.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  return null;
}

function toClientSession(session: AuthSessionPayload): {
  expires_at: number;
  user: PublicAuthUser;
} {
  return {
    expires_at: session.expires_at,
    user: session.user,
  };
}

function isHttpsRequest(request: Request, url: URL): boolean {
  if (url.protocol === "https:") return true;
  const xfp = (request.headers.get("x-forwarded-proto") ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  return xfp === "https";
}

function getExpectedOrigin(request: Request, url: URL): string {
  const forwardedHost = (request.headers.get("x-forwarded-host") ?? "")
    .split(",")[0]
    ?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim() || url.host;
  const protocol = isHttpsRequest(request, url) ? "https" : url.protocol.replace(/:$/, "");
  return `${protocol}://${host}`.toLowerCase();
}

function sessionCookieHeader(request: Request, token: string, maxAgeSeconds: number): string {
  const url = new URL(request.url);
  const isSecure = process.env["NODE_ENV"] === "production" || isHttpsRequest(request, url);
  const expiresAt =
    maxAgeSeconds > 0
      ? new Date(Date.now() + maxAgeSeconds * 1000).toUTCString()
      : "Thu, 01 Jan 1970 00:00:00 GMT";
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${expiresAt}`,
    "SameSite=Lax",
    ...(isSecure ? ["Secure"] : []),
  ];
  return parts.join("; ");
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new StoreError("Invalid JSON request body", 400);
  }
}

const RATE_LIMIT_SECOND_MS = 1000;
const MINUTE_MS = 60 * RATE_LIMIT_SECOND_MS;
const FIFTEEN_MINUTES_MS = 15 * MINUTE_MS;
const HOUR_MS = 60 * MINUTE_MS;

type RateBucket = {
  timestamps: number[];
  windowMs: number;
};

export class SlidingWindowRateLimiter {
  private buckets = new Map<string, RateBucket>();

  consume(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const cutoff = now - windowMs;
    const existing = this.buckets.get(key);
    const active = existing ? existing.timestamps.filter((ts) => ts > cutoff) : [];

    if (active.length >= limit) {
      this.buckets.set(key, { timestamps: active, windowMs });
      const oldest = active[0] ?? now;
      const retryAfterMs = Math.max(1, oldest + windowMs - now);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    active.push(now);
    this.buckets.set(key, { timestamps: active, windowMs });

    if (this.buckets.size > 1000) {
      this.sweep(now);
    }

    return { allowed: true };
  }

  clear(): void {
    this.buckets.clear();
  }

  private sweep(now: number): void {
    for (const [key, bucket] of this.buckets) {
      const latest = bucket.timestamps[bucket.timestamps.length - 1];
      if (latest === undefined || latest <= now - bucket.windowMs) {
        this.buckets.delete(key);
      }
    }
  }
}

const defaultRateLimiter = new SlidingWindowRateLimiter();

const IGNORED_GEO_COUNTRY_CODES = new Set(["XX", "T1", "ZZ", "--"]);
const GEO_COUNTRY_HEADERS = [
  "cf-ipcountry",
  "x-vercel-ip-country",
  "x-appengine-country",
  "cloudfront-viewer-country",
  "x-country-code",
];

export function extractCountryFromHeaders(headers: Headers): string | null {
  for (const headerName of GEO_COUNTRY_HEADERS) {
    const raw = headers.get(headerName);
    if (!raw) continue;
    const candidate = raw.split(",")[0]?.trim().toUpperCase() ?? "";
    if (!candidate || IGNORED_GEO_COUNTRY_CODES.has(candidate)) continue;
    if (/^[A-Z]{2}$/.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

export class HourlyViewDeduplicator {
  private lastViewedAt = new Map<string, number>();

  hasRecentView(profileId: string, visitorId: string, nowMs: number): boolean {
    const key = `${profileId}:${visitorId}`;
    const prev = this.lastViewedAt.get(key);
    if (prev === undefined) return false;
    if (nowMs - prev >= 0 && nowMs - prev < HOUR_MS) {
      return true;
    }
    if (nowMs - prev >= HOUR_MS) {
      this.lastViewedAt.delete(key);
    }
    return false;
  }

  recordView(profileId: string, visitorId: string, nowMs: number): void {
    const key = `${profileId}:${visitorId}`;
    this.lastViewedAt.set(key, nowMs);
    if (this.lastViewedAt.size > 5000) {
      this.sweep(nowMs);
    }
  }

  clear(): void {
    this.lastViewedAt.clear();
  }

  private sweep(nowMs: number): void {
    for (const [key, ts] of this.lastViewedAt) {
      if (nowMs - ts >= HOUR_MS) {
        this.lastViewedAt.delete(key);
      }
    }
  }
}

const defaultViewDeduplicator = new HourlyViewDeduplicator();

export function resetApiRateLimits(): void {
  defaultRateLimiter.clear();
  defaultViewDeduplicator.clear();
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;
  return "127.0.0.1";
}

function rateLimitedResponse(retryAfterSeconds: number): Response {
  const retryAfter = String(Math.max(1, Math.ceil(retryAfterSeconds)));
  return json(
    {
      error: "Too many requests. Please wait and try again.",
      code: "rate_limited",
    },
    429,
    {
      "retry-after": retryAfter,
    },
  );
}

export type ApiHandlerOptions = {
  sendPasswordResetEmail?: (email: string, continueUrl?: string) => Promise<void>;
  rateLimiter?: SlidingWindowRateLimiter | undefined;
  viewDeduplicator?: HourlyViewDeduplicator | undefined;
  nowMs?: (() => number) | undefined;
  useLocalStore?: boolean | undefined;
  firestoreFetch?: typeof fetch | undefined;
  verifyFirebaseToken?: ((idToken: string) => Promise<GoogleTokenClaims>) | undefined;
  deleteFirebaseAuthUser?: ((idToken: string) => Promise<boolean>) | undefined;
};

export async function handleApiOrMediaRequest(
  request: Request,
  options: ApiHandlerOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const limiter = options.rateLimiter ?? defaultRateLimiter;
  const viewDeduplicator = options.viewDeduplicator ?? defaultViewDeduplicator;
  const now = options.nowMs ? options.nowMs() : Date.now();
  const clientIp = getClientIp(request);
  const localStoreEnabled =
    process.env["NODE_ENV"] !== "production" &&
    (options.useLocalStore ?? isLocalStoreEnabled());
  const verifyToken = options.verifyFirebaseToken ?? verifyFirebaseIdToken;
  const deleteAuthUser = options.deleteFirebaseAuthUser ?? deleteFirebaseAuthUserServer;

  if (pathname.startsWith("/media/")) {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return json({ error: "Method not allowed" }, 405);
      }
      const rest = pathname.slice("/media/".length);
      const segments = rest.split("/");
      if (segments.length !== 3 || !segments[0] || !segments[1] || !segments[2]) {
        return new Response("Not found", { status: 404 });
      }
      const [rawBucket, rawUserId, rawFilename] = segments;
      const bucket = decodeURIComponent(rawBucket);
      const userId = decodeURIComponent(rawUserId);
      const decodedFilename = decodeURIComponent(rawFilename);

      if (
        !bucket ||
        !userId ||
        !decodedFilename ||
        bucket.includes("/") ||
        bucket.includes("\\") ||
        userId.includes("/") ||
        userId.includes("\\") ||
        decodedFilename.includes("/") ||
        decodedFilename.includes("\\") ||
        decodedFilename.includes("\0") ||
        decodedFilename.startsWith(".") ||
        decodedFilename.toLowerCase().endsWith(".meta.json")
      ) {
        return new Response("Not found", { status: 404 });
      }

      const objectPath = `${userId}/${decodedFilename}`;
      let file: { bytes: Buffer; contentType: string } | null = null;
      if (localStoreEnabled) {
        file = getStore().readMediaFile(bucket, objectPath);
      } else {
        const fromFirestore = await readMediaFromFirestoreRest(
          bucket,
          objectPath,
          options.firestoreFetch,
        );
        if (fromFirestore) {
          const detected = detectMediaContentType(fromFirestore.bytes);
          const declared = normalizeDeclaredMediaType(fromFirestore.contentType);
          if (
            detected &&
            isMediaTypeAllowedForBucket(bucket, detected) &&
            (declared === "" || declared === "application/octet-stream" || declared === detected)
          ) {
            file = { bytes: fromFirestore.bytes, contentType: detected };
          }
        }
      }
      if (!file) return new Response("Not found", { status: 404 });
      return new Response(request.method === "HEAD" ? null : new Uint8Array(file.bytes), {
        status: 200,
        headers: {
          "content-type": file.contentType,
          "cache-control": "public, max-age=3600",
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; sandbox",
          ...(file.contentType.startsWith("image/") ? { "content-disposition": "inline" } : {}),
        },
      });
    } catch (error) {
      if (error instanceof URIError) {
        return json({ error: "Invalid media path encoding", code: "bad_request" }, 400);
      }
      if (error instanceof StoreError) {
        return json({ error: error.message, code: error.code }, error.status);
      }
      console.error("[Media error]", error);
      return json({ error: "Internal server error" }, 500);
    }
  }

  if (!pathname.startsWith("/api/")) {
    return null;
  }

  try {
    if (pathname.startsWith("/api/firebase-proxy/")) {
      const proxyCheck = limiter.consume(`firebase-proxy:${clientIp}`, 30, MINUTE_MS, now);
      if (!proxyCheck.allowed) {
        return rateLimitedResponse(proxyCheck.retryAfterSeconds);
      }
      return await handleFirebaseProxyRequest(request);
    }

    const method = request.method.toUpperCase();

    if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
      const originHeader = request.headers.get("origin");
      if (originHeader !== null) {
        let normalizedOrigin: string | null = null;
        try {
          const parsedOrigin = new URL(originHeader);
          if (parsedOrigin.origin !== "null") {
            normalizedOrigin = parsedOrigin.origin.toLowerCase();
          }
        } catch {
          normalizedOrigin = null;
        }
        const expectedOrigin = getExpectedOrigin(request, url);
        if (!normalizedOrigin || normalizedOrigin !== expectedOrigin) {
          return json(
            { error: "Cross-origin request rejected", code: "csrf_origin_mismatch" },
            403,
          );
        }
      }

      const isMediaUpload =
        method === "POST" && /^\/api\/storage\/[^/]+\/upload$/.test(pathname);
      const contentType = normalizeDeclaredMediaType(request.headers.get("content-type") ?? "");
      if (isMediaUpload) {
        if (
          !contentType ||
          contentType === "text/plain" ||
          contentType === "application/x-www-form-urlencoded" ||
          contentType === "multipart/form-data"
        ) {
          return json(
            { error: "Unsupported Content-Type for media upload", code: "unsupported_media_type" },
            415,
          );
        }
      } else if (contentType !== "application/json") {
        return json(
          { error: "Content-Type must be application/json", code: "unsupported_media_type" },
          415,
        );
      }
    }

    if (pathname === "/api/events" && method === "POST") {
      const eventsLimit = limiter.consume(`events:${clientIp}`, 60, MINUTE_MS, now);
      if (!eventsLimit.allowed) {
        return rateLimitedResponse(eventsLimit.retryAfterSeconds);
      }

      const rawBody = await readJson<unknown>(request);
      const parsed = profileEventBodySchema.safeParse(rawBody);
      if (!parsed.success) {
        return json({ error: firstError(parsed.error), code: "invalid_event" }, 400);
      }

      const data = parsed.data;
      // Country is always derived server-side from platform geo headers; ignore client-supplied country.
      const derivedCountry = extractCountryFromHeaders(request.headers);

      if (localStoreEnabled) {
        const store = getStore();
        const token = extractToken(request);
        const actor = token ? store.verifySessionToken(token) : null;
        const result = store.recordEvent(
          actor?.id ?? null,
          {
            profile_id: data.profile_id,
            event_type: data.event_type,
            platform: data.platform ?? null,
            custom_link_id: data.custom_link_id ?? null,
            visitor_id: data.visitor_id ?? null,
            country: derivedCountry,
          },
          now,
        );
        const response = json(
          { ok: true, deduplicated: result.deduplicated },
          result.deduplicated ? 200 : 201,
        );
        if (actor) {
          const renewed = store.refreshSessionForUser(actor.id);
          if (renewed) {
            response.headers.set(
              "set-cookie",
              sessionCookieHeader(request, renewed.access_token, SESSION_COOKIE_MAX_AGE),
            );
          }
        }
        return response;
      }

      const profile = await getProfileByIdRest(data.profile_id, options.firestoreFetch);
      if (!profile) {
        return json({ error: "Target profile not found", code: "profile_not_found" }, 404);
      }

      if (data.event_type === "custom_link_click" && data.custom_link_id) {
        const link = await fetchCustomLinkByIdRest(data.custom_link_id, options.firestoreFetch);
        if (!link || link.profile_id !== data.profile_id) {
          return json(
            {
              error: "custom_link_id does not belong to the target profile",
              code: "invalid_custom_link",
            },
            400,
          );
        }
      }

      if (data.event_type === "profile_view" && data.visitor_id) {
        if (viewDeduplicator.hasRecentView(data.profile_id, data.visitor_id, now)) {
          return json({ ok: true, deduplicated: true }, 200);
        }
      }

      const hourBucket = Math.floor(now / HOUR_MS);
      const eventId =
        data.event_type === "profile_view" && data.visitor_id
          ? `pv_${crypto
              .createHash("sha256")
              .update(`${data.profile_id}:${data.visitor_id}:${hourBucket}`)
              .digest("hex")
              .slice(0, 40)}`
          : crypto.randomUUID();

      const writeRes = await createProfileEventRest(
        {
          eventId,
          profile_id: data.profile_id,
          event_type: data.event_type,
          platform: data.platform ?? null,
          custom_link_id: data.custom_link_id ?? null,
          visitor_id: data.visitor_id ?? null,
          country: derivedCountry,
        },
        options.firestoreFetch,
      );

      if (data.event_type === "profile_view" && data.visitor_id) {
        viewDeduplicator.recordView(data.profile_id, data.visitor_id, now);
      }

      if (!writeRes.created) {
        return json({ ok: true, deduplicated: true }, 200);
      }
      return json({ ok: true, deduplicated: false }, 201);
    }

    // --- Single-source-of-truth Firestore mode (default & production) ---
    if (!localStoreEnabled) {
      if (pathname === "/api/auth/session" && method === "GET") {
        return json({ session: null });
      }

      if (pathname === "/api/auth/logout" && method === "POST") {
        return json({ ok: true }, 200, { "set-cookie": sessionCookieHeader(request, "", 0) });
      }

      if (pathname === "/api/auth/account" && method === "DELETE") {
        const body = await readJson<{ username?: string; password?: string; idToken?: string }>(
          request,
        );
        if (!body.idToken) {
          return json(
            { error: "Authentication required to delete account", code: "unauthorized" },
            401,
          );
        }
        const claims = await verifyToken(body.idToken);
        if (claims.signInProvider !== "password") {
          assertRecentGoogleAuth(claims, Math.floor(now / 1000));
        }
        await deleteUserDataFromFirestoreRest(claims.uid, body.idToken, {
          expectedUsername: body.username ?? "",
          fetchImpl: options.firestoreFetch,
        });
        await deleteAuthUser(body.idToken).catch(() => false);
        return json({ success: true }, 200, { "set-cookie": sessionCookieHeader(request, "", 0) });
      }

      if (pathname === "/api/usernames/available" && method === "GET") {
        const username = url.searchParams.get("username") ?? "";
        const parsed = usernameSchema.safeParse(username);
        if (!parsed.success) return json({ available: false });
        const fsClaim = await getUsernameClaimRest(parsed.data, options.firestoreFetch);
        return json({ available: !fsClaim });
      }

      if (pathname.startsWith("/api/profiles/by-username/") && method === "GET") {
        const username = decodeURIComponent(pathname.slice("/api/profiles/by-username/".length));
        const fsProfile = await getProfileByUsernameRest(username, options.firestoreFetch);
        return json({ profile: fsProfile });
      }

      const firestoreCustomLinksMatch = pathname.match(/^\/api\/profiles\/([^/]+)\/custom-links$/);
      if (firestoreCustomLinksMatch && method === "GET") {
        const profileId = decodeURIComponent(firestoreCustomLinksMatch[1] ?? "");
        const enabledOnly = url.searchParams.get("enabledOnly") === "true";
        const fsLinks = await listCustomLinksRest(profileId, enabledOnly, options.firestoreFetch);
        return json({ links: fsLinks });
      }

      const firestoreSocialSettingsMatch = pathname.match(
        /^\/api\/profiles\/([^/]+)\/social-settings$/,
      );
      if (firestoreSocialSettingsMatch && method === "GET") {
        const profileId = decodeURIComponent(firestoreSocialSettingsMatch[1] ?? "");
        const fsSettings = await listSocialLinkSettingsRest(profileId, options.firestoreFetch);
        return json({ settings: fsSettings });
      }

      return json(
        {
          error: "Local fallback store is disabled. Set ENABLE_LOCAL_STORE=true in development or tests.",
          code: "local_store_disabled",
        },
        503,
      );
    }

    const store = getStore();
    let authenticatedUser: PublicAuthUser | null = null;

    const getAuthenticatedUser = (req: Request): PublicAuthUser | null => {
      if (authenticatedUser) return authenticatedUser;
      const token = extractToken(req);
      if (!token) return null;
      const verified = store.verifySessionToken(token);
      if (verified) authenticatedUser = verified;
      return verified;
    };

    const requireUser = (req: Request): PublicAuthUser => {
      const user = getAuthenticatedUser(req);
      if (!user) throw new StoreError("Unauthorized", 401, "unauthorized");
      return user;
    };

    const withSlidingSession = (res: Response): Response => {
      if (
        authenticatedUser &&
        res.status >= 200 &&
        res.status < 400 &&
        !res.headers.has("set-cookie")
      ) {
        const renewed = store.refreshSessionForUser(authenticatedUser.id);
        if (renewed) {
          res.headers.set(
            "set-cookie",
            sessionCookieHeader(request, renewed.access_token, SESSION_COOKIE_MAX_AGE),
          );
        }
      }
      return res;
    };

    // --- Auth routes ---
    if (pathname === "/api/auth/session" && method === "GET") {
      const user = getAuthenticatedUser(request);
      if (!user) return json({ session: null });
      const renewed = store.refreshSessionForUser(user.id);
      if (!renewed) return json({ session: null });
      return json({ session: toClientSession(renewed) }, 200, {
        "set-cookie": sessionCookieHeader(request, renewed.access_token, SESSION_COOKIE_MAX_AGE),
      });
    }

    if (pathname === "/api/auth/check-signup" && method === "POST") {
      const limitCheck = limiter.consume(`auth:${pathname}:${clientIp}`, 5, HOUR_MS, now);
      if (!limitCheck.allowed) {
        return rateLimitedResponse(limitCheck.retryAfterSeconds);
      }
      const body = await readJson<{ email?: string; username?: string }>(request);
      store.validatePendingSignupCandidate({
        email: body.email ?? "",
        username: body.username ?? "",
      });
      return json({ ok: true });
    }

    if (pathname === "/api/auth/register-pending" && method === "POST") {
      const limitCheck = limiter.consume(`auth:${pathname}:${clientIp}`, 5, HOUR_MS, now);
      if (!limitCheck.allowed) {
        return rateLimitedResponse(limitCheck.retryAfterSeconds);
      }
      const body = await readJson<{ email?: string; password?: string; username?: string }>(
        request,
      );
      const pending = await store.createPendingSignup({
        email: body.email ?? "",
        password: body.password ?? "",
        username: body.username ?? "",
      });
      return json({ pending }, 201);
    }

    if (pathname === "/api/auth/confirm-email" && method === "POST") {
      const body = await readJson<{ idToken?: string; username?: string }>(request);
      const claims = await verifyFirebaseIdToken(body.idToken ?? "");
      const session = store.completeVerifiedEmailSignup(claims, body.username);
      return json({ session: toClientSession(session), user: session.user }, 200, {
        "set-cookie": sessionCookieHeader(request, session.access_token, SESSION_COOKIE_MAX_AGE),
      });
    }

    if (pathname === "/api/auth/login" && method === "POST") {
      const body = await readJson<{ email?: string; password?: string }>(request);
      const email = body.email ?? "";
      const password = body.password ?? "";
      const cleanLoginEmail = email.trim().toLowerCase();
      const loginLimit = limiter.consume(
        `login:${clientIp}:${cleanLoginEmail}`,
        5,
        FIFTEEN_MINUTES_MS,
        now,
      );
      if (!loginLimit.allowed) {
        return rateLimitedResponse(loginLimit.retryAfterSeconds);
      }
      try {
        const session = await store.login({ email, password });
        return json({ session: toClientSession(session), user: session.user }, 200, {
          "set-cookie": sessionCookieHeader(request, session.access_token, SESSION_COOKIE_MAX_AGE),
        });
      } catch (err) {
        const pending = await store.getPendingSignupCredentialsMatch(email, password);
        if (password && (pending || process.env["NODE_ENV"] !== "test")) {
          const fbAuth = await signInFirebaseEmailPasswordServer(email, password);
          if (fbAuth?.idToken) {
            try {
              const claims = await verifyFirebaseIdToken(fbAuth.idToken);
              const session = pending
                ? store.completeVerifiedEmailSignup(claims)
                : await store.syncFirebasePasswordLogin(claims, password);
              return json({ session: toClientSession(session), user: session.user }, 200, {
                "set-cookie": sessionCookieHeader(request, session.access_token, SESSION_COOKIE_MAX_AGE),
              });
            } catch (verifyErr) {
              if (verifyErr instanceof StoreError && verifyErr.code === "unverified_email") {
                throw new StoreError(
                  "Please confirm your email address first. Check your inbox for the confirmation link",
                  403,
                  "email_not_verified",
                );
              }
              throw verifyErr;
            }
          }
          if (pending) {
            throw new StoreError(
              "Please confirm your email address first. Check your inbox for the confirmation link",
              403,
              "email_not_verified",
            );
          }
        }
        throw err;
      }
    }

    if (pathname === "/api/auth/google" && method === "POST") {
      const body = await readJson<{ idToken?: string }>(request);
      const claims = await verifyToken(body.idToken ?? "");
      const session = store.loginWithGoogle(claims);
      return json({ session: toClientSession(session), user: session.user }, 200, {
        "set-cookie": sessionCookieHeader(request, session.access_token, SESSION_COOKIE_MAX_AGE),
      });
    }

    if (pathname === "/api/auth/reauth-google" && method === "POST") {
      const user = requireUser(request);
      const body = await readJson<{ idToken?: string }>(request);
      const claims = await verifyToken(body.idToken ?? "");
      assertRecentGoogleAuth(claims, Math.floor(now / 1000));
      store.reauthWithGoogle(user.id, claims, { nowMs: now });
      return withSlidingSession(json({ ok: true }));
    }

    if (pathname === "/api/auth/logout" && method === "POST") {
      const user = getAuthenticatedUser(request);
      if (user) {
        store.revokeUserTokens(user.id);
      }
      return json({ ok: true }, 200, { "set-cookie": sessionCookieHeader(request, "", 0) });
    }

    if (pathname === "/api/auth/update-password" && method === "POST") {
      const user = requireUser(request);
      const body = await readJson<{ password?: string; currentPassword?: string }>(request);
      const session = await store.updatePassword(user.id, body.password ?? "", body.currentPassword);
      return json({ ok: true, session: toClientSession(session), user: session.user }, 200, {
        "set-cookie": sessionCookieHeader(request, session.access_token, SESSION_COOKIE_MAX_AGE),
      });
    }

    if (pathname === "/api/auth/forgot-password" && method === "POST") {
      const limitCheck = limiter.consume(`auth:${pathname}:${clientIp}`, 5, HOUR_MS, now);
      if (!limitCheck.allowed) {
        return rateLimitedResponse(limitCheck.retryAfterSeconds);
      }
      const startedAt = Date.now();
      const body = await readJson<{ email?: string }>(request);
      const cleanEmail = (body.email ?? "").trim().toLowerCase();
      store.createPasswordReset(cleanEmail);

      const clientDispatched = request.headers.get("x-reset-email-dispatched") === "client";
      const sendResetEmail =
        options.sendPasswordResetEmail ??
        (!clientDispatched && process.env["NODE_ENV"] !== "test"
          ? sendFirebasePasswordResetEmailServer
          : undefined);

      if (sendResetEmail && cleanEmail) {
        const origin = url.origin && url.origin !== "null" ? url.origin : undefined;
        const continueUrl = origin ? `${origin}/reset-password` : undefined;
        try {
          await sendResetEmail(cleanEmail, continueUrl);
        } catch {
          /* ignore email delivery failures so existence/timing stay uniform */
        }
      }

      const elapsedMs = Date.now() - startedAt;
      const minResponseMs = 120;
      if (elapsedMs < minResponseMs) {
        await new Promise((resolve) => setTimeout(resolve, minResponseMs - elapsedMs));
      }

      return json({ ok: true });
    }

    if (pathname === "/api/auth/reset-password" && method === "POST") {
      const limitCheck = limiter.consume(`auth:${pathname}:${clientIp}`, 5, HOUR_MS, now);
      if (!limitCheck.allowed) {
        return rateLimitedResponse(limitCheck.retryAfterSeconds);
      }
      const body = await readJson<{ token?: string; password?: string }>(request);
      const session = await store.consumePasswordReset(body.token ?? "", body.password ?? "");
      return json({ session: toClientSession(session), user: session.user }, 200, {
        "set-cookie": sessionCookieHeader(request, session.access_token, SESSION_COOKIE_MAX_AGE),
      });
    }

    if (pathname === "/api/auth/account" && method === "DELETE") {
      const user = requireUser(request);
      const body = await readJson<{ username?: string; password?: string; idToken?: string }>(
        request,
      );
      const googleClaims = body.idToken ? await verifyToken(body.idToken) : undefined;
      await store.deleteAccount(user.id, body.username ?? "", body.password, {
        ...(googleClaims ? { googleClaims } : {}),
        nowMs: now,
      });
      if (body.idToken && googleClaims) {
        await deleteUserDataFromFirestoreRest(googleClaims.uid, body.idToken, {
          fetchImpl: options.firestoreFetch,
        });
        await deleteAuthUser(body.idToken).catch(() => false);
      }
      return json({ success: true }, 200, { "set-cookie": sessionCookieHeader(request, "", 0) });
    }

    // --- Username availability (local dev/test store) ---
    if (pathname === "/api/usernames/available" && method === "GET") {
      const username = url.searchParams.get("username") ?? "";
      const viewer = getAuthenticatedUser(request);
      const localAvailable = store.isUsernameAvailable(username, undefined, {
        forUserId: viewer?.id,
      });
      return json({ available: localAvailable });
    }

    // --- Profiles (local dev/test store) ---
    if (pathname === "/api/profiles/me" && method === "GET") {
      const user = requireUser(request);
      const localProfile = store.getProfileById(user.id);
      return withSlidingSession(json({ profile: localProfile }));
    }

    if (pathname === "/api/profiles/me" && method === "PATCH") {
      const user = requireUser(request);
      const patch = await readJson<Record<string, unknown>>(request);
      const profile = store.updateProfile(user.id, patch);
      return withSlidingSession(json({ profile }));
    }

    if (pathname === "/api/profiles" && method === "POST") {
      const user = requireUser(request);
      const body = await readJson<{ username?: string }>(request);
      const profile = store.createProfile(user.id, body.username ?? "");
      return withSlidingSession(json({ profile }, 201));
    }

    if (pathname.startsWith("/api/profiles/by-username/") && method === "GET") {
      const username = decodeURIComponent(pathname.slice("/api/profiles/by-username/".length));
      return json({ profile: store.getProfileByUsername(username) });
    }

    // --- Custom links (local dev/test store) ---
    const customLinksMatch = pathname.match(/^\/api\/profiles\/([^/]+)\/custom-links$/);
    if (customLinksMatch && method === "GET") {
      const profileId = decodeURIComponent(customLinksMatch[1] ?? "");
      const enabledOnly = url.searchParams.get("enabledOnly") === "true";
      return json({ links: store.listCustomLinks(profileId, enabledOnly) });
    }

    if (pathname === "/api/custom-links" && method === "POST") {
      const user = requireUser(request);
      const body = await readJson<{
        name?: string;
        url?: string;
        icon?: string;
        link_type?: string;
      }>(request);
      const link = store.createCustomLink(user.id, {
        name: body.name ?? "",
        url: body.url ?? "",
        ...(body.icon !== undefined ? { icon: body.icon } : {}),
        ...(body.link_type !== undefined ? { link_type: body.link_type } : {}),
      });
      return withSlidingSession(json({ link }, 201));
    }

    if (pathname === "/api/custom-links/reorder" && method === "POST") {
      const user = requireUser(request);
      const body = await readJson<{ target_profile_id?: string; ordered_ids?: string[] }>(request);
      store.reorderCustomLinks(
        user.id,
        body.target_profile_id ?? user.id,
        Array.isArray(body.ordered_ids) ? body.ordered_ids : [],
      );
      return withSlidingSession(json({ ok: true }));
    }

    const customLinkIdMatch = pathname.match(/^\/api\/custom-links\/([^/]+)$/);
    if (customLinkIdMatch) {
      const user = requireUser(request);
      const linkId = decodeURIComponent(customLinkIdMatch[1] ?? "");
      if (method === "PATCH") {
        const patch = await readJson<Record<string, unknown>>(request);
        const link = store.updateCustomLink(user.id, linkId, patch);
        return withSlidingSession(json({ link }));
      }
      if (method === "DELETE") {
        store.deleteCustomLink(user.id, linkId);
        return withSlidingSession(json({ ok: true }));
      }
    }

    // --- Social link settings (local dev/test store) ---
    const socialSettingsMatch = pathname.match(/^\/api\/profiles\/([^/]+)\/social-settings$/);
    if (socialSettingsMatch && method === "GET") {
      const profileId = decodeURIComponent(socialSettingsMatch[1] ?? "");
      return json({ settings: store.listSocialLinkSettings(profileId) });
    }

    if (pathname === "/api/social-settings" && method === "PUT") {
      const user = requireUser(request);
      const rawBody = await readJson<unknown>(request);
      if (
        !rawBody ||
        typeof rawBody !== "object" ||
        Array.isArray(rawBody) ||
        !Array.isArray((rawBody as { settings?: unknown }).settings)
      ) {
        return json({ error: "settings must be an array", code: "invalid_social_settings" }, 400);
      }
      const parsed = saveSocialLinkSettingsBodySchema.safeParse(rawBody);
      if (!parsed.success) {
        return json(
          { error: firstError(parsed.error), code: "invalid_social_settings" },
          400,
        );
      }
      store.saveSocialLinkSettings(user.id, parsed.data.settings);
      return withSlidingSession(json({ ok: true }));
    }

    // --- Analytics ---

    if (pathname === "/api/analytics" && method === "GET") {
      const user = requireUser(request);
      const profileId = url.searchParams.get("profileId") ?? user.id;
      return withSlidingSession(json(store.getAnalytics(user.id, profileId)));
    }

    // --- Media Storage ---
    const storageUploadMatch = pathname.match(/^\/api\/storage\/([^/]+)\/upload$/);
    if (storageUploadMatch && method === "POST") {
      const user = requireUser(request);
      const uploadLimit = limiter.consume(`storage-upload:${user.id}`, 20, HOUR_MS, now);
      if (!uploadLimit.allowed) {
        return rateLimitedResponse(uploadLimit.retryAfterSeconds);
      }
      const bucket = decodeURIComponent(storageUploadMatch[1] ?? "");
      const objectPath = url.searchParams.get("path") ?? "";
      const contentType = request.headers.get("content-type") ?? "";
      const buf = Buffer.from(await request.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > MAX_MEDIA_BYTES) {
        throw new StoreError("File size must be between 1 byte and 6 MB", 400);
      }
      const savedPath = store.saveMediaFile(user.id, bucket, objectPath, buf, contentType);
      return withSlidingSession(json({ path: savedPath }, 201));
    }

    const storageListMatch = pathname.match(/^\/api\/storage\/([^/]+)\/list$/);
    if (storageListMatch && method === "GET") {
      const user = requireUser(request);
      const bucket = decodeURIComponent(storageListMatch[1] ?? "");
      return withSlidingSession(json({ files: store.listMediaFiles(user.id, bucket) }));
    }

    const storageRemoveMatch = pathname.match(/^\/api\/storage\/([^/]+)\/remove$/);
    if (storageRemoveMatch && method === "POST") {
      const user = requireUser(request);
      const bucket = decodeURIComponent(storageRemoveMatch[1] ?? "");
      const body = await readJson<{ paths?: string[] }>(request);
      store.removeMediaFiles(user.id, bucket, Array.isArray(body.paths) ? body.paths : []);
      return withSlidingSession(json({ ok: true }));
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof StoreError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    console.error("[API error]", error);
    return json({ error: "Internal server error" }, 500);
  }
}
