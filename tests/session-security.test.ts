import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { apiFetch, authApi } from "../src/lib/api-client";
import { SESSION_TTL_SECONDS, TinkiStore } from "../src/server/local-fallback-store.server";

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payloadSeg = token.split(".")[1] ?? "";
  const padded = payloadSeg.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return JSON.parse(Buffer.from(padded + "=".repeat(padLen), "base64").toString("utf8")) as Record<
    string,
    unknown
  >;
}

function signCustomJwt(secret: string, payload: Record<string, unknown>): string {
  const headerSeg = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadSeg = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(`${headerSeg}.${payloadSeg}`).digest();
  return `${headerSeg}.${payloadSeg}.${base64UrlEncode(sig)}`;
}

function extractSessionCookieValue(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/tinki_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

describe("Client cookie-only auth (no localStorage/IndexedDB or Authorization headers)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("removes all client-side token storage and Authorization header plumbing", () => {
    const apiClientSrc = fs.readFileSync(path.resolve(process.cwd(), "src/lib/api-client.ts"), "utf8");
    const analyticsSrc = fs.readFileSync(path.resolve(process.cwd(), "src/lib/analytics.ts"), "utf8");
    const fbAuthSrc = fs.readFileSync(path.resolve(process.cwd(), "src/lib/firebase-auth.ts"), "utf8");

    for (const forbidden of [
      "TOKEN_KEY",
      "tinki_access_token",
      "setStoredToken",
      "getStoredToken",
      "hydrateStoredToken",
      "openAuthIdb",
      "tinki_auth_db",
      "Authorization",
    ]) {
      expect(apiClientSrc).not.toContain(forbidden);
      expect(analyticsSrc).not.toContain(forbidden);
      expect(fbAuthSrc).not.toContain(forbidden);
    }

    expect(apiClientSrc).toContain('credentials: "include"');
  });

  it("sends credentials: include without Authorization headers or touching localStorage", async () => {
    const lsSet = vi.fn();
    const lsGet = vi.fn().mockReturnValue(null);
    const lsRemove = vi.fn();
    vi.stubGlobal("window", {
      localStorage: { setItem: lsSet, getItem: lsGet, removeItem: lsRemove },
      location: { origin: "http://localhost:3000" },
    });

    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          session: {
            expires_at: 1_900_000_000,
            user: {
              id: "user-1",
              email: "user@example.com",
              user_metadata: { username: "userone" },
              identities: [{ provider: "email" }],
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const session = await authApi.signInWithPassword({
      email: "user@example.com",
      password: "Password123!",
    });
    await apiFetch("/api/profiles/me");

    expect(session.user.id).toBe("user-1");
    expect(lsSet).not.toHaveBeenCalled();
    expect(lsGet).not.toHaveBeenCalled();
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.init?.credentials).toBe("include");
      const headers = new Headers(call.init?.headers);
      expect(headers.get("Authorization")).toBeNull();
      expect(headers.get("authorization")).toBeNull();
    }
  });
});

describe("TinkiStore tokenVersion revocation & unknown/deleted user rejection", () => {
  const prevSecret = process.env["AUTH_SECRET"];
  const dirs: string[] = [];

  function makeDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    if (prevSecret === undefined) delete process.env["AUTH_SECRET"];
    else process.env["AUTH_SECRET"] = prevSecret;

    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unknown-user tokens even when validly HMAC-signed with email/provider claims", () => {
    const secret = "test-secret-no-fallback-user-32ch!";
    process.env["AUTH_SECRET"] = secret;
    const store = new TinkiStore(makeDir("tinki-unknown-user-"));

    const forgedValidUnknown = signCustomJwt(secret, {
      sub: "non-existent-user-id",
      email: "ghost@example.com",
      username: "ghost",
      providers: ["google"],
      tv: 1,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(store.verifySessionToken(forgedValidUnknown)).toBeNull();
  });

  it("rejects tokens missing tv claim or having stale tv claim", async () => {
    const secret = "test-secret-tv-check-32-chars-ok";
    process.env["AUTH_SECRET"] = secret;
    const store = new TinkiStore(makeDir("tinki-tv-check-"));
    const session = await store.signUp({
      email: "tvuser@example.com",
      password: "Password123!",
      username: "tvuser",
    });

    const missingTv = signCustomJwt(secret, {
      sub: session.user.id,
      email: session.user.email,
      providers: ["email"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(store.verifySessionToken(missingTv)).toBeNull();

    const wrongTv = signCustomJwt(secret, {
      sub: session.user.id,
      email: session.user.email,
      providers: ["email"],
      tv: 99,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(store.verifySessionToken(wrongTv)).toBeNull();
    expect(store.verifySessionToken(session.access_token)?.id).toBe(session.user.id);
  });

  it("increments tokenVersion on logout, password change, password reset, and deletion (surviving restarts)", async () => {
    process.env["AUTH_SECRET"] = "test-secret-revocation-events-32ch";
    const dir = makeDir("tinki-revoke-all-");
    const store = new TinkiStore(dir);

    const s1 = await store.signUp({
      email: "revoke@example.com",
      password: "Password123!",
      username: "revokeuser",
    });
    expect(decodeJwtPayload(s1.access_token)["tv"]).toBe(1);
    expect(store.verifySessionToken(s1.access_token)?.id).toBe(s1.user.id);

    // 1. Logout increments tokenVersion
    expect(store.revokeUserTokens(s1.user.id)).toBe(true);
    expect(store.verifySessionToken(s1.access_token)).toBeNull();

    const s2 = await store.login({ email: "revoke@example.com", password: "Password123!" });
    expect(decodeJwtPayload(s2.access_token)["tv"]).toBe(2);
    expect(store.verifySessionToken(s2.access_token)?.id).toBe(s1.user.id);

    // 2. Password change increments tokenVersion
    const s3 = await store.updatePassword(s1.user.id, "NewPassword456!", "Password123!");
    expect(decodeJwtPayload(s3.access_token)["tv"]).toBe(3);
    expect(store.verifySessionToken(s2.access_token)).toBeNull();
    expect(store.verifySessionToken(s3.access_token)?.id).toBe(s1.user.id);

    // 3. Password reset increments tokenVersion
    const reset = store.createPasswordReset("revoke@example.com");
    expect(reset?.token).toBeTruthy();
    const s4 = await store.consumePasswordReset(reset!.token, "ResetPassword789!");
    expect(decodeJwtPayload(s4.access_token)["tv"]).toBe(4);
    expect(store.verifySessionToken(s3.access_token)).toBeNull();
    expect(store.verifySessionToken(s4.access_token)?.id).toBe(s1.user.id);

    // Survives store restart
    await store.flush();
    const restartedBeforeDelete = new TinkiStore(dir);
    expect(restartedBeforeDelete.verifySessionToken(s3.access_token)).toBeNull();
    expect(restartedBeforeDelete.verifySessionToken(s4.access_token)?.id).toBe(s1.user.id);

    // 4. Account deletion increments tokenVersion, persists deletedUserIds, and rejects after restart
    await restartedBeforeDelete.deleteAccount(s1.user.id, "revokeuser", "ResetPassword789!");
    expect(restartedBeforeDelete.verifySessionToken(s4.access_token)).toBeNull();

    await restartedBeforeDelete.flush();
    const rawDb = JSON.parse(fs.readFileSync(path.join(dir, "db.json"), "utf8")) as {
      deletedUserIds?: string[];
    };
    expect(rawDb.deletedUserIds).toContain(s1.user.id);

    const restartedAfterDelete = new TinkiStore(dir);
    expect(restartedAfterDelete.verifySessionToken(s4.access_token)).toBeNull();
  });
});

describe("API session cookies, 7-day TTL, sliding renewal & HTTP revocation", () => {
  const dirs: string[] = [];
  const prevDataDir = process.env["TINKI_DATA_DIR"];
  const prevSecret = process.env["AUTH_SECRET"];
  const prevLocalStore = process.env["ENABLE_LOCAL_STORE"];
  let apiDir: string;
  let handleApiOrMediaRequest: typeof import("../src/server/api-router.server").handleApiOrMediaRequest;

  beforeAll(async () => {
    apiDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-session-api-"));
    dirs.push(apiDir);
    process.env["TINKI_DATA_DIR"] = apiDir;
    process.env["AUTH_SECRET"] = "test-api-session-secret-at-least-32!";
    process.env["ENABLE_LOCAL_STORE"] = "true";
    vi.resetModules();
    ({ handleApiOrMediaRequest } = await import("../src/server/api-router.server"));
    const { getStore } = await import("../src/server/local-fallback-store.server");

    await getStore().createPendingSignup({
      email: "cookieuser@example.com",
      password: "Password123!",
      username: "cookieuser",
    });
    getStore().completeVerifiedEmailSignup({ email: "cookieuser@example.com" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    if (prevDataDir === undefined) delete process.env["TINKI_DATA_DIR"];
    else process.env["TINKI_DATA_DIR"] = prevDataDir;
    if (prevSecret === undefined) delete process.env["AUTH_SECRET"];
    else process.env["AUTH_SECRET"] = prevSecret;
    if (prevLocalStore === undefined) delete process.env["ENABLE_LOCAL_STORE"];
    else process.env["ENABLE_LOCAL_STORE"] = prevLocalStore;

    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("issues 7-day HttpOnly cookies without exposing access_token in JSON and supports sliding renewal + HTTP logout revocation", async () => {
    expect(SESSION_TTL_SECONDS).toBe(60 * 60 * 24 * 7);

    const t0 = new Date("2026-06-01T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(t0);

    const loginRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "cookieuser@example.com", password: "Password123!" }),
      }),
    ))!;
    expect(loginRes.status).toBe(200);

    const loginJson = (await loginRes.json()) as { session: Record<string, unknown> };
    expect(loginJson.session["access_token"]).toBeUndefined();

    const loginSetCookie = loginRes.headers.get("set-cookie") ?? "";
    expect(loginSetCookie).toMatch(/HttpOnly/i);
    expect(loginSetCookie).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);

    const initialCookieToken = extractSessionCookieValue(loginSetCookie);
    expect(initialCookieToken).toBeTruthy();
    const initialClaims = decodeJwtPayload(initialCookieToken!);
    expect(Number(initialClaims["exp"]) - Number(initialClaims["iat"])).toBe(604_800);

    // Advance 3 days -> GET /api/auth/session renews the cookie by another 7 days
    vi.setSystemTime(new Date(t0.getTime() + 3 * 24 * 60 * 60 * 1000));
    const sessionRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/session", {
        method: "GET",
        headers: { cookie: `tinki_session=${encodeURIComponent(initialCookieToken!)}` },
      }),
    ))!;
    expect(sessionRes.status).toBe(200);
    const sessionJson = (await sessionRes.json()) as { session: Record<string, unknown> };
    expect(sessionJson.session["access_token"]).toBeUndefined();

    const renewedCookieHeader = sessionRes.headers.get("set-cookie") ?? "";
    expect(renewedCookieHeader).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
    const slidCookieToken = extractSessionCookieValue(renewedCookieHeader);
    expect(slidCookieToken).toBeTruthy();
    expect(slidCookieToken).not.toBe(initialCookieToken);

    const slidClaims = decodeJwtPayload(slidCookieToken!);
    expect(Number(slidClaims["exp"])).toBeGreaterThan(Number(initialClaims["exp"]));
    expect(Number(slidClaims["exp"]) - Number(slidClaims["iat"])).toBe(604_800);

    // Advance to t0 + 8 days (past original 7-day expiry): initial token is expired, slid token succeeds & slides again
    vi.setSystemTime(new Date(t0.getTime() + 8 * 24 * 60 * 60 * 1000));

    const expiredProfileRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/profiles/me", {
        method: "GET",
        headers: { cookie: `tinki_session=${encodeURIComponent(initialCookieToken!)}` },
      }),
    ))!;
    expect(expiredProfileRes.status).toBe(401);

    const slidProfileRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/profiles/me", {
        method: "GET",
        headers: { cookie: `tinki_session=${encodeURIComponent(slidCookieToken!)}` },
      }),
    ))!;
    expect(slidProfileRes.status).toBe(200);
    const secondSlidToken = extractSessionCookieValue(slidProfileRes.headers.get("set-cookie"));
    expect(secondSlidToken).toBeTruthy();
    expect(Number(decodeJwtPayload(secondSlidToken!)["exp"])).toBeGreaterThan(
      Number(slidClaims["exp"]),
    );

    // HTTP logout revokes all tokens for the user
    const logoutRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `tinki_session=${encodeURIComponent(secondSlidToken!)}`,
        },
        body: "{}",
      }),
    ))!;
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get("set-cookie")).toContain("Max-Age=0");

    // Replaying previously issued valid cookie after logout fails with null session / 401
    const afterLogoutSession = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/session", {
        method: "GET",
        headers: { cookie: `tinki_session=${encodeURIComponent(secondSlidToken!)}` },
      }),
    ))!;
    expect(await afterLogoutSession.json()).toEqual({ session: null });

    const afterLogoutProfile = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/profiles/me", {
        method: "GET",
        headers: { cookie: `tinki_session=${encodeURIComponent(slidCookieToken!)}` },
      }),
    ))!;
    expect(afterLogoutProfile.status).toBe(401);
  });
});
