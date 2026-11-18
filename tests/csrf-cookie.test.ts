import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

function extractCookie(setCookie: string | null): string {
  const match = setCookie?.match(/tinki_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

describe("Cookie security flags & CSRF protection (Origin + Content-Type)", () => {
  const dirs: string[] = [];
  const prevDataDir = process.env["TINKI_DATA_DIR"];
  const prevSecret = process.env["AUTH_SECRET"];
  const prevNodeEnv = process.env["NODE_ENV"];
  const prevLocalStore = process.env["ENABLE_LOCAL_STORE"];
  let apiDir: string;
  let handleApiOrMediaRequest: typeof import("../src/server/api-router.server").handleApiOrMediaRequest;
  let sessionCookieToken: string;

  beforeAll(async () => {
    apiDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-csrf-api-"));
    dirs.push(apiDir);
    process.env["TINKI_DATA_DIR"] = apiDir;
    process.env["AUTH_SECRET"] = "test-csrf-cookie-secret-at-least-32!";
    process.env["NODE_ENV"] = "test";
    process.env["ENABLE_LOCAL_STORE"] = "true";
    vi.resetModules();
    ({ handleApiOrMediaRequest } = await import("../src/server/api-router.server"));
    const { getStore } = await import("../src/server/local-fallback-store.server");

    await getStore().createPendingSignup({
      email: "csrfuser@example.com",
      password: "Password123!",
      username: "csrfuser",
    });
    const session = getStore().completeVerifiedEmailSignup({ email: "csrfuser@example.com" });
    sessionCookieToken = session.access_token;
  });

  afterEach(() => {
    process.env["NODE_ENV"] = "test";
  });

  afterAll(() => {
    if (prevDataDir === undefined) delete process.env["TINKI_DATA_DIR"];
    else process.env["TINKI_DATA_DIR"] = prevDataDir;
    if (prevSecret === undefined) delete process.env["AUTH_SECRET"];
    else process.env["AUTH_SECRET"] = prevSecret;
    if (prevNodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = prevNodeEnv;
    if (prevLocalStore === undefined) delete process.env["ENABLE_LOCAL_STORE"];
    else process.env["ENABLE_LOCAL_STORE"] = prevLocalStore;

    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses SameSite=Lax and Secure only from url.protocol, x-forwarded-proto, or NODE_ENV=production (never Origin/Referer)", async () => {
    // 1. Plain HTTP GET with spoofed Referer: https://... must NOT set Secure, SameSite=None, or Partitioned
    const httpSpoofedRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/session", {
        method: "GET",
        headers: {
          cookie: `tinki_session=${encodeURIComponent(sessionCookieToken)}`,
          origin: "https://localhost:3000",
          referer: "https://evil.example/steal",
          forwarded: "proto=https",
        },
      }),
    ))!;
    expect(httpSpoofedRes.status).toBe(200);
    const devCookie = httpSpoofedRes.headers.get("set-cookie") ?? "";
    expect(devCookie).toMatch(/HttpOnly/i);
    expect(devCookie).toMatch(/SameSite=Lax/i);
    expect(devCookie).not.toMatch(/;\s*Secure\b/i);
    expect(devCookie).not.toMatch(/SameSite=None|Partitioned/i);

    // 2. Direct HTTPS URL sets SameSite=Lax; Secure without SameSite=None; Partitioned
    const directHttpsRes = (await handleApiOrMediaRequest(
      new Request("https://tinki.app/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://tinki.app",
        },
        body: JSON.stringify({ email: "csrfuser@example.com", password: "Password123!" }),
      }),
    ))!;
    expect(directHttpsRes.status).toBe(200);
    const httpsCookie = directHttpsRes.headers.get("set-cookie") ?? "";
    expect(httpsCookie).toMatch(/SameSite=Lax;\s*Secure/i);
    expect(httpsCookie).not.toMatch(/SameSite=None|Partitioned/i);

    // 3. Trusted x-forwarded-proto: https sets SameSite=Lax; Secure
    const xfpRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/session", {
        method: "GET",
        headers: {
          cookie: `tinki_session=${encodeURIComponent(extractCookie(httpsCookie))}`,
          "x-forwarded-proto": "https",
        },
      }),
    ))!;
    expect(xfpRes.status).toBe(200);
    expect(xfpRes.headers.get("set-cookie") ?? "").toMatch(/SameSite=Lax;\s*Secure/i);

    // 4. NODE_ENV=production enforces SameSite=Lax; Secure even over plain http URL
    process.env["NODE_ENV"] = "production";
    const prodRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: "{}",
      }),
    ))!;
    expect(prodRes.status).toBe(200);
    const prodCookie = prodRes.headers.get("set-cookie") ?? "";
    expect(prodCookie).toMatch(/SameSite=Lax;\s*Secure/i);
    expect(prodCookie).not.toMatch(/SameSite=None|Partitioned/i);
  });

  it("rejects cross-origin POST/PATCH/PUT/DELETE requests under /api/ with 403", async () => {
    const crossOriginCases: Array<{
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: string;
    }> = [
      {
        method: "POST",
        url: "http://localhost:3000/api/auth/login",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({ email: "csrfuser@example.com", password: "Password123!" }),
      },
      {
        method: "POST",
        url: "http://localhost:3000/api/auth/logout",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3001",
          cookie: `tinki_session=${encodeURIComponent(sessionCookieToken)}`,
        },
        body: "{}",
      },
      {
        // Scheme mismatch: Origin https://localhost:3000 on http://localhost:3000 (Origin must not upgrade protocol)
        method: "PATCH",
        url: "http://localhost:3000/api/profiles/me",
        headers: {
          "content-type": "application/json",
          origin: "https://localhost:3000",
          cookie: `tinki_session=${encodeURIComponent(sessionCookieToken)}`,
        },
        body: JSON.stringify({ display_name: "Hijacked" }),
      },
      {
        method: "PUT",
        url: "http://localhost:3000/api/social-settings",
        headers: {
          "content-type": "application/json",
          origin: "null",
          cookie: `tinki_session=${encodeURIComponent(sessionCookieToken)}`,
        },
        body: JSON.stringify({ settings: [] }),
      },
      {
        method: "DELETE",
        url: "http://localhost:3000/api/auth/account",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.test",
          cookie: `tinki_session=${encodeURIComponent(sessionCookieToken)}`,
        },
        body: JSON.stringify({ username: "csrfuser", password: "Password123!" }),
      },
      {
        method: "POST",
        url: "http://localhost:3000/api/storage/avatars/upload?path=u/a.png",
        headers: {
          "content-type": "image/png",
          origin: "https://attacker.test",
          cookie: `tinki_session=${encodeURIComponent(sessionCookieToken)}`,
        },
        body: "pngbytes",
      },
      {
        // Reverse-proxied host mismatch
        method: "POST",
        url: "http://127.0.0.1:3000/api/custom-links",
        headers: {
          host: "tinki.app",
          "x-forwarded-proto": "https",
          "content-type": "application/json",
          origin: "https://evil.tinki.app",
          cookie: `tinki_session=${encodeURIComponent(sessionCookieToken)}`,
        },
        body: JSON.stringify({ name: "Evil", url: "https://evil.test" }),
      },
    ];

    for (const c of crossOriginCases) {
      const res = (await handleApiOrMediaRequest(
        new Request(c.url, {
          method: c.method,
          headers: c.headers,
          body: c.body,
        }),
      ))!;
      expect(res.status, `${c.method} ${c.url} origin=${c.headers["origin"]}`).toBe(403);
      expect(res.headers.get("set-cookie")).toBeNull();
    }

    // Same-origin behind proxy succeeds
    const validProxied = (await handleApiOrMediaRequest(
      new Request("http://127.0.0.1:3000/api/profiles/me", {
        method: "PATCH",
        headers: {
          host: "tinki.app",
          "x-forwarded-proto": "https",
          "content-type": "application/json",
          origin: "https://tinki.app",
          cookie: `tinki_session=${encodeURIComponent(sessionCookieToken)}`,
        },
        body: JSON.stringify({ display_name: "Legit Update" }),
      }),
    ))!;
    expect(validProxied.status).toBe(200);
    expect((await validProxied.json()).profile.display_name).toBe("Legit Update");

    // Token was NOT revoked by the rejected cross-origin logout
    const verifyStillActive = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/session", {
        method: "GET",
        headers: { cookie: `tinki_session=${encodeURIComponent(sessionCookieToken)}` },
      }),
    ))!;
    expect((await verifyStillActive.json()).session.user.email).toBe("csrfuser@example.com");
  });

  it("rejects text/plain and non-JSON Content-Type on mutating /api/ requests with 415", async () => {
    const nonJsonCases: Array<{
      method: string;
      url: string;
      contentType?: string;
      body: string;
    }> = [
      {
        method: "POST",
        url: "http://localhost:3000/api/auth/login",
        contentType: "text/plain",
        body: JSON.stringify({ email: "csrfuser@example.com", password: "Password123!" }),
      },
      {
        method: "POST",
        url: "http://localhost:3000/api/auth/logout",
        contentType: "text/plain; charset=utf-8",
        body: "{}",
      },
      {
        method: "PATCH",
        url: "http://localhost:3000/api/profiles/me",
        contentType: "application/x-www-form-urlencoded",
        body: "display_name=Pwned",
      },
      {
        method: "PUT",
        url: "http://localhost:3000/api/social-settings",
        contentType: "text/plain",
        body: JSON.stringify({ settings: [] }),
      },
      {
        method: "DELETE",
        url: "http://localhost:3000/api/auth/account",
        contentType: "text/plain",
        body: JSON.stringify({ username: "csrfuser", password: "Password123!" }),
      },
      {
        method: "POST",
        url: "http://localhost:3000/api/custom-links",
        body: JSON.stringify({ name: "NoHeader", url: "https://example.com" }),
      },
      {
        method: "POST",
        url: "http://localhost:3000/api/storage/avatars/upload?path=u/a.txt",
        contentType: "text/plain",
        body: "plain text",
      },
    ];

    for (const c of nonJsonCases) {
      const headers: Record<string, string> = {
        origin: "http://localhost:3000",
        cookie: `tinki_session=${encodeURIComponent(sessionCookieToken)}`,
      };
      if (c.contentType) {
        headers["content-type"] = c.contentType;
      }
      const res = (await handleApiOrMediaRequest(
        new Request(c.url, {
          method: c.method,
          headers,
          body: c.body,
        }),
      ))!;
      expect(res.status, `${c.method} ${c.url} ct=${c.contentType ?? "<none>"}`).toBe(415);
      expect(res.headers.get("set-cookie")).toBeNull();
    }

    // Valid application/json; charset=utf-8 with same-origin succeeds
    const validRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/custom-links", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json; charset=utf-8",
          cookie: `tinki_session=${encodeURIComponent(sessionCookieToken)}`,
        },
        body: JSON.stringify({ name: "Site", url: "https://example.com" }),
      }),
    ))!;
    expect(validRes.status).toBe(201);
  });

  it("exempts /api/firebase-proxy/ from the /api/ CSRF Origin and Content-Type checks", async () => {
    const proxyRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/firebase-proxy/identitytoolkit/v1/projects", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "text/plain",
        },
        body: "{}",
      }),
    ))!;
    // Rejected by Firebase proxy API key check (not by CSRF 403/415)
    expect(proxyRes.status).toBe(403);
    expect(await proxyRes.json()).toEqual({ error: "Invalid Firebase API key", code: "bad_request" });
  });
});
