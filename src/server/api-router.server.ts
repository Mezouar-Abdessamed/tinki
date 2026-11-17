import {
  signInFirebaseEmailPasswordServer,
  verifyFirebaseIdToken,
} from "./firebase-token-verifier.server";
import { handleFirebaseProxyRequest } from "./firebase-proxy.server";
import {
  getProfileByIdRest,
  getProfileByUsernameRest,
  getUsernameClaimRest,
  listCustomLinksRest,
  listSocialLinkSettingsRest,
  readMediaFromFirestoreRest,
} from "./firestore-public-rest.server";
import { getStore, StoreError, type PublicAuthUser } from "./local-fallback-store.server";

const SESSION_COOKIE = "tinki_session";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const MAX_MEDIA_BYTES = 6 * 1024 * 1024;

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
  const auth = request.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(request.headers.get("cookie"));
  return cookies[SESSION_COOKIE] ?? null;
}

function isHttpsRequest(request: Request, url: URL): boolean {
  if (url.protocol === "https:") return true;
  const xfp = (request.headers.get("x-forwarded-proto") ?? "").toLowerCase();
  if (xfp.split(",").some((p) => p.trim() === "https")) return true;
  const forwarded = (request.headers.get("forwarded") ?? "").toLowerCase();
  if (forwarded.includes("proto=https")) return true;
  const origin = (request.headers.get("origin") ?? "").toLowerCase();
  if (origin.startsWith("https://")) return true;
  const referer = (request.headers.get("referer") ?? "").toLowerCase();
  if (referer.startsWith("https://")) return true;
  return false;
}

function sessionCookieHeader(request: Request, token: string, maxAgeSeconds: number): string {
  const url = new URL(request.url);
  const isHttps = isHttpsRequest(request, url);
  const expiresAt =
    maxAgeSeconds > 0 ? new Date(Date.now() + maxAgeSeconds * 1000).toUTCString() : "Thu, 01 Jan 1970 00:00:00 GMT";
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${expiresAt}`,
    isHttps ? "SameSite=None; Secure; Partitioned" : "SameSite=Lax",
  ];
  return parts.join("; ");
}

function getAuthenticatedUser(request: Request): PublicAuthUser | null {
  const token = extractToken(request);
  if (!token) return null;
  return getStore().verifySessionToken(token);
}

function requireUser(request: Request): PublicAuthUser {
  const user = getAuthenticatedUser(request);
  if (!user) throw new StoreError("Unauthorized", 401, "unauthorized");
  return user;
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new StoreError("Invalid JSON request body", 400);
  }
}

export async function handleApiOrMediaRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname.startsWith("/media/")) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "Method not allowed" }, 405);
    }
    const rest = pathname.slice("/media/".length);
    const segments = rest.split("/");
    if (segments.length !== 3 || !segments[0] || !segments[1] || !segments[2]) {
      return new Response("Not found", { status: 404 });
    }
    const [bucket, userId, filename] = segments;
    const objectPath = `${userId}/${decodeURIComponent(filename)}`;
    const store = getStore();
    let file = store.readMediaFile(bucket, objectPath);
    if (!file) {
      const fromFirestore = await readMediaFromFirestoreRest(bucket, objectPath);
      if (fromFirestore) {
        try {
          store.saveMediaFile(userId, bucket, objectPath, fromFirestore.bytes, fromFirestore.contentType);
        } catch {
          /* ignore disk cache error */
        }
        file = fromFirestore;
      }
    }
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(request.method === "HEAD" ? null : new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        "content-type": file.contentType,
        "cache-control": "public, max-age=3600",
      },
    });
  }

  if (!pathname.startsWith("/api/")) {
    return null;
  }

  try {
    if (pathname.startsWith("/api/firebase-proxy/")) {
      return await handleFirebaseProxyRequest(request);
    }

    const store = getStore();
    const method = request.method.toUpperCase();

    // --- Auth routes ---
    if (pathname === "/api/auth/session" && method === "GET") {
      const token = extractToken(request);
      if (!token) return json({ session: null });
      const user = store.verifySessionToken(token);
      if (!user) return json({ session: null });
      return json({
        session: {
          access_token: token,
          token_type: "bearer",
          user,
        },
      });
    }

    if (pathname === "/api/auth/signup" && method === "POST") {
      const body = await readJson<{ email?: string; password?: string; username?: string }>(
        request,
      );
      const session = store.signUp({
        email: body.email ?? "",
        password: body.password ?? "",
        ...(body.username !== undefined ? { username: body.username } : {}),
      });
      return json({ session, user: session.user }, 201, {
        "set-cookie": sessionCookieHeader(request, session.access_token, SESSION_COOKIE_MAX_AGE),
      });
    }

    if (pathname === "/api/auth/check-signup" && method === "POST") {
      const body = await readJson<{ email?: string; username?: string }>(request);
      store.validatePendingSignupCandidate({
        email: body.email ?? "",
        username: body.username ?? "",
      });
      return json({ ok: true });
    }

    if (pathname === "/api/auth/register-pending" && method === "POST") {
      const body = await readJson<{ email?: string; password?: string; username?: string }>(
        request,
      );
      const pending = store.createPendingSignup({
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
      return json({ session, user: session.user }, 200, {
        "set-cookie": sessionCookieHeader(request, session.access_token, SESSION_COOKIE_MAX_AGE),
      });
    }

    if (pathname === "/api/auth/login" && method === "POST") {
      const body = await readJson<{ email?: string; password?: string }>(request);
      const email = body.email ?? "";
      const password = body.password ?? "";
      try {
        const session = store.login({ email, password });
        return json({ session, user: session.user }, 200, {
          "set-cookie": sessionCookieHeader(request, session.access_token, SESSION_COOKIE_MAX_AGE),
        });
      } catch (err) {
        const pending = store.getPendingSignupCredentialsMatch(email, password);
        if (pending) {
          const fbAuth = await signInFirebaseEmailPasswordServer(email, password);
          if (fbAuth?.idToken) {
            try {
              const claims = await verifyFirebaseIdToken(fbAuth.idToken);
              const session = store.completeVerifiedEmailSignup(claims);
              return json({ session, user: session.user }, 200, {
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
          throw new StoreError(
            "Please confirm your email address first. Check your inbox for the confirmation link",
            403,
            "email_not_verified",
          );
        }
        throw err;
      }
    }

    if (pathname === "/api/auth/google" && method === "POST") {
      const body = await readJson<{ idToken?: string }>(request);
      const claims = await verifyFirebaseIdToken(body.idToken ?? "");
      const session = store.loginWithGoogle(claims);
      return json({ session, user: session.user }, 200, {
        "set-cookie": sessionCookieHeader(request, session.access_token, SESSION_COOKIE_MAX_AGE),
      });
    }

    if (pathname === "/api/auth/logout" && method === "POST") {
      return json({ ok: true }, 200, { "set-cookie": sessionCookieHeader(request, "", 0) });
    }

    if (pathname === "/api/auth/update-password" && method === "POST") {
      const user = requireUser(request);
      const body = await readJson<{ password?: string; currentPassword?: string }>(request);
      const session = store.updatePassword(user.id, body.password ?? "", body.currentPassword, user);
      return json({ ok: true, session, user: session.user }, 200, {
        "set-cookie": sessionCookieHeader(request, session.access_token, SESSION_COOKIE_MAX_AGE),
      });
    }

    if (pathname === "/api/auth/forgot-password" && method === "POST") {
      const body = await readJson<{ email?: string }>(request);
      const result = store.createPasswordReset(body.email ?? "");
      return json({
        ok: true,
        ...(result ? { resetToken: result.token } : {}),
      });
    }

    if (pathname === "/api/auth/reset-password" && method === "POST") {
      const body = await readJson<{ token?: string; password?: string }>(request);
      const session = store.consumePasswordReset(body.token ?? "", body.password ?? "");
      return json({ session, user: session.user }, 200, {
        "set-cookie": sessionCookieHeader(request, session.access_token, SESSION_COOKIE_MAX_AGE),
      });
    }

    if (pathname === "/api/auth/account" && method === "DELETE") {
      const user = requireUser(request);
      const body = await readJson<{ username?: string; password?: string }>(request);
      store.deleteAccount(user.id, body.username ?? "", body.password);
      return json({ success: true }, 200, { "set-cookie": sessionCookieHeader(request, "", 0) });
    }

    // --- Username availability ---
    if (pathname === "/api/usernames/available" && method === "GET") {
      const username = url.searchParams.get("username") ?? "";
      const localAvailable = store.isUsernameAvailable(username);
      if (!localAvailable) return json({ available: false });
      const fsClaim = await getUsernameClaimRest(username);
      return json({ available: !fsClaim });
    }

    // --- Profiles ---
    if (pathname === "/api/profiles/me" && method === "GET") {
      const user = requireUser(request);
      const localProfile = store.getProfileById(user.id);
      if (localProfile) return json({ profile: localProfile });
      const fsProfile = await getProfileByIdRest(user.id);
      return json({ profile: fsProfile });
    }

    if (pathname === "/api/profiles/me" && method === "PATCH") {
      const user = requireUser(request);
      const patch = await readJson<Record<string, unknown>>(request);
      const profile = store.updateProfile(user.id, patch);
      return json({ profile });
    }

    if (pathname === "/api/profiles" && method === "POST") {
      const user = requireUser(request);
      const body = await readJson<{ username?: string }>(request);
      const profile = store.createProfile(user.id, body.username ?? "");
      return json({ profile }, 201);
    }

    if (pathname.startsWith("/api/profiles/by-username/") && method === "GET") {
      const username = decodeURIComponent(pathname.slice("/api/profiles/by-username/".length));
      const fsProfile = await getProfileByUsernameRest(username);
      if (fsProfile) return json({ profile: fsProfile });
      return json({ profile: store.getProfileByUsername(username) });
    }

    // --- Custom links ---
    const customLinksMatch = pathname.match(/^\/api\/profiles\/([^/]+)\/custom-links$/);
    if (customLinksMatch && method === "GET") {
      const profileId = decodeURIComponent(customLinksMatch[1] ?? "");
      const enabledOnly = url.searchParams.get("enabledOnly") === "true";
      const fsLinks = await listCustomLinksRest(profileId, enabledOnly);
      if (fsLinks.length > 0) return json({ links: fsLinks });
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
      return json({ link }, 201);
    }

    if (pathname === "/api/custom-links/reorder" && method === "POST") {
      const user = requireUser(request);
      const body = await readJson<{ target_profile_id?: string; ordered_ids?: string[] }>(request);
      store.reorderCustomLinks(
        user.id,
        body.target_profile_id ?? user.id,
        Array.isArray(body.ordered_ids) ? body.ordered_ids : [],
      );
      return json({ ok: true });
    }

    const customLinkIdMatch = pathname.match(/^\/api\/custom-links\/([^/]+)$/);
    if (customLinkIdMatch) {
      const user = requireUser(request);
      const linkId = decodeURIComponent(customLinkIdMatch[1] ?? "");
      if (method === "PATCH") {
        const patch = await readJson<Record<string, unknown>>(request);
        const link = store.updateCustomLink(user.id, linkId, patch);
        return json({ link });
      }
      if (method === "DELETE") {
        store.deleteCustomLink(user.id, linkId);
        return json({ ok: true });
      }
    }

    // --- Social link settings ---
    const socialSettingsMatch = pathname.match(/^\/api\/profiles\/([^/]+)\/social-settings$/);
    if (socialSettingsMatch && method === "GET") {
      const profileId = decodeURIComponent(socialSettingsMatch[1] ?? "");
      const fsSettings = await listSocialLinkSettingsRest(profileId);
      if (fsSettings.length > 0) return json({ settings: fsSettings });
      return json({ settings: store.listSocialLinkSettings(profileId) });
    }

    if (pathname === "/api/social-settings" && method === "PUT") {
      const user = requireUser(request);
      const body = await readJson<{
        settings?: Array<{
          profile_id: string;
          platform: string;
          enabled: boolean;
          position: number;
        }>;
      }>(request);
      store.saveSocialLinkSettings(user.id, body.settings ?? []);
      return json({ ok: true });
    }

    // --- Events & Analytics ---
    if (pathname === "/api/events" && method === "POST") {
      const actor = getAuthenticatedUser(request);
      const body = await readJson<{
        profile_id?: string;
        event_type?: "profile_view" | "social_click" | "custom_link_click";
        platform?: string | null;
        custom_link_id?: string | null;
        visitor_id?: string | null;
        country?: string | null;
      }>(request);
      if (body.profile_id && body.event_type) {
        store.recordEvent(actor?.id ?? null, {
          profile_id: body.profile_id,
          event_type: body.event_type,
          ...(body.platform !== undefined ? { platform: body.platform } : {}),
          ...(body.custom_link_id !== undefined ? { custom_link_id: body.custom_link_id } : {}),
          ...(body.visitor_id !== undefined ? { visitor_id: body.visitor_id } : {}),
          ...(body.country !== undefined ? { country: body.country } : {}),
        });
      }
      return json({ ok: true }, 201);
    }

    if (pathname === "/api/analytics" && method === "GET") {
      const user = requireUser(request);
      const profileId = url.searchParams.get("profileId") ?? user.id;
      return json(store.getAnalytics(user.id, profileId));
    }

    // --- Media Storage ---
    const storageUploadMatch = pathname.match(/^\/api\/storage\/([^/]+)\/upload$/);
    if (storageUploadMatch && method === "POST") {
      const user = requireUser(request);
      const bucket = decodeURIComponent(storageUploadMatch[1] ?? "");
      const objectPath = url.searchParams.get("path") ?? "";
      const contentType = request.headers.get("content-type") ?? "application/octet-stream";
      const buf = Buffer.from(await request.arrayBuffer());
      if (buf.byteLength === 0 || buf.byteLength > MAX_MEDIA_BYTES) {
        throw new StoreError("File size must be between 1 byte and 6 MB", 400);
      }
      const savedPath = store.saveMediaFile(user.id, bucket, objectPath, buf, contentType);
      return json({ path: savedPath }, 201);
    }

    const storageListMatch = pathname.match(/^\/api\/storage\/([^/]+)\/list$/);
    if (storageListMatch && method === "GET") {
      const user = requireUser(request);
      const bucket = decodeURIComponent(storageListMatch[1] ?? "");
      return json({ files: store.listMediaFiles(user.id, bucket) });
    }

    const storageRemoveMatch = pathname.match(/^\/api\/storage\/([^/]+)\/remove$/);
    if (storageRemoveMatch && method === "POST") {
      const user = requireUser(request);
      const bucket = decodeURIComponent(storageRemoveMatch[1] ?? "");
      const body = await readJson<{ paths?: string[] }>(request);
      store.removeMediaFiles(user.id, bucket, Array.isArray(body.paths) ? body.paths : []);
      return json({ ok: true });
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
