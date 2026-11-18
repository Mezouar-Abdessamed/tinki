import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { SlidingWindowRateLimiter, getClientIp } from "../src/server/api-router.server";
import { hashPassword, verifyPassword } from "../src/server/local-fallback-store.server";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe("API rate limiting & async scrypt password hashing", () => {
  const prevDataDir = process.env["TINKI_DATA_DIR"];
  const prevLocalStore = process.env["ENABLE_LOCAL_STORE"];
  let tmpDir: string;
  let handleApiOrMediaRequest: typeof import("../src/server/api-router.server").handleApiOrMediaRequest;
  let aliceId: string;
  let aliceCookie: string;
  let bobId: string;
  let bobCookie: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-rate-limit-"));
    process.env["TINKI_DATA_DIR"] = tmpDir;
    process.env["ENABLE_LOCAL_STORE"] = "true";
    vi.resetModules();

    ({ handleApiOrMediaRequest } = await import("../src/server/api-router.server"));
    const { getStore } = await import("../src/server/local-fallback-store.server");
    const store = getStore();

    const alice = await store.signUp({
      email: "alice.rl@example.com",
      password: "Password123!",
      username: "alicerl",
    });
    aliceId = alice.user.id;
    aliceCookie = `tinki_session=${encodeURIComponent(alice.access_token)}`;

    const bob = await store.signUp({
      email: "bob.rl@example.com",
      password: "Password123!",
      username: "bobrl",
    });
    bobId = bob.user.id;
    bobCookie = `tinki_session=${encodeURIComponent(bob.access_token)}`;
  });

  afterAll(() => {
    if (prevDataDir === undefined) delete process.env["TINKI_DATA_DIR"];
    else process.env["TINKI_DATA_DIR"] = prevDataDir;
    if (prevLocalStore === undefined) delete process.env["ENABLE_LOCAL_STORE"];
    else process.env["ENABLE_LOCAL_STORE"] = prevLocalStore;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("enforces /api/auth/login limit of 5 attempts / 15 min per IP+email with Retry-After and sliding recovery", async () => {
    const rateLimiter = new SlidingWindowRateLimiter();
    let clockMs = 1_800_000_000_000;

    const sendLogin = (ip: string, email: string, password = "WrongPassword") =>
      handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": ip,
          },
          body: JSON.stringify({ email, password }),
        }),
        { rateLimiter, nowMs: () => clockMs },
      );

    for (let i = 0; i < 5; i++) {
      const res = (await sendLogin("198.51.100.10", "Alice.RL@example.com"))!;
      expect(res.status).toBe(401);
      clockMs += 1000;
    }

    const blocked = (await sendLogin("198.51.100.10", "alice.rl@example.com"))!;
    expect(blocked.status).toBe(429);
    const retryAfter = Number(blocked.headers.get("retry-after"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(880);
    expect(retryAfter).toBeLessThanOrEqual(900);
    expect(await blocked.json()).toMatchObject({ code: "rate_limited" });

    // Different email from same IP or same email from different IP is still allowed
    const otherEmail = (await sendLogin("198.51.100.10", "bob.rl@example.com", "Password123!"))!;
    expect(otherEmail.status).toBe(200);

    const otherIp = (await sendLogin("198.51.100.11", "alice.rl@example.com", "Password123!"))!;
    expect(otherIp.status).toBe(200);

    // Slide past the oldest attempt (15 min from first attempt) -> 1 slot opens
    clockMs += 15 * 60 * 1000 - 4000;
    const recovered = (await sendLogin("198.51.100.10", "alice.rl@example.com", "Password123!"))!;
    expect(recovered.status).toBe(200);
  });

  it("enforces 5 / hour per IP independently on check-signup, register-pending, forgot-password, and reset-password", async () => {
    const rateLimiter = new SlidingWindowRateLimiter();
    let clockMs = 1_800_000_000_000;

    const endpoints: Array<{ path: string; body: Record<string, unknown> }> = [
      {
        path: "/api/auth/check-signup",
        body: { email: "candidate@example.com", username: "candidate1" },
      },
      {
        path: "/api/auth/register-pending",
        body: { email: "pendingrl@example.com", password: "Password123!", username: "pendingrl1" },
      },
      {
        path: "/api/auth/forgot-password",
        body: { email: "" },
      },
      {
        path: "/api/auth/reset-password",
        body: { token: "invalid-token", password: "Password123!" },
      },
    ];

    for (const ep of endpoints) {
      for (let i = 0; i < 5; i++) {
        const res = (await handleApiOrMediaRequest(
          new Request(`http://localhost:3000${ep.path}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-forwarded-for": "203.0.113.5",
            },
            body: JSON.stringify(ep.body),
          }),
          { rateLimiter, nowMs: () => clockMs },
        ))!;
        expect(res.status, `${ep.path} attempt #${i + 1}`).not.toBe(429);
      }

      const sixth = (await handleApiOrMediaRequest(
        new Request(`http://localhost:3000${ep.path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.5",
          },
          body: JSON.stringify(ep.body),
        }),
        { rateLimiter, nowMs: () => clockMs },
      ))!;
      expect(sixth.status, `${ep.path} 6th attempt`).toBe(429);
      expect(Number(sixth.headers.get("retry-after"))).toBe(3600);

      // Different IP on the same endpoint is unaffected
      const differentIp = (await handleApiOrMediaRequest(
        new Request(`http://localhost:3000${ep.path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.6",
          },
          body: JSON.stringify(ep.body),
        }),
        { rateLimiter, nowMs: () => clockMs },
      ))!;
      expect(differentIp.status).not.toBe(429);
    }

    // After 1 hour passes, quota recovers for original IP
    clockMs += 60 * 60 * 1000 + 1;
    const afterWindow = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/check-signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.5",
        },
        body: JSON.stringify({ email: "candidate2@example.com", username: "candidate2" }),
      }),
      { rateLimiter, nowMs: () => clockMs },
    ))!;
    expect(afterWindow.status).toBe(200);
  });

  it("enforces 60 / minute per IP on POST /api/events", async () => {
    const rateLimiter = new SlidingWindowRateLimiter();
    let clockMs = 1_800_000_000_000;

    const sendEvent = (ip: string) =>
      handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": ip,
          },
          body: JSON.stringify({
            profile_id: aliceId,
            event_type: "profile_view",
            visitor_id: crypto.randomUUID(),
          }),
        }),
        { rateLimiter, nowMs: () => clockMs },
      );

    for (let i = 0; i < 60; i++) {
      const res = (await sendEvent("192.0.2.50"))!;
      expect(res.status).toBe(201);
    }

    const blocked = (await sendEvent("192.0.2.50"))!;
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBe(60);

    // Another IP is unaffected
    expect((await sendEvent("192.0.2.51"))?.status).toBe(201);

    // After 60 seconds passes, original IP recovers
    clockMs += 60_000 + 1;
    expect((await sendEvent("192.0.2.50"))?.status).toBe(201);
  });

  it("enforces 20 / hour per user on /api/storage/*/upload regardless of client IP", async () => {
    const rateLimiter = new SlidingWindowRateLimiter();
    let clockMs = 1_800_000_000_000;

    const sendUpload = (userCookie: string | null, uid: string, idx: number, ip: string) =>
      handleApiOrMediaRequest(
        new Request(
          `http://localhost:3000/api/storage/avatars/upload?path=${encodeURIComponent(`${uid}/rl-${idx}.png`)}`,
          {
            method: "POST",
            headers: {
              "content-type": "image/png",
              "x-forwarded-for": ip,
              ...(userCookie ? { cookie: userCookie } : {}),
            },
            body: new Uint8Array(PNG_BYTES),
          },
        ),
        { rateLimiter, nowMs: () => clockMs },
      );

    // Unauthenticated requests return 401 before touching per-user rate limit
    expect((await sendUpload(null, aliceId, 0, "198.51.100.70"))?.status).toBe(401);

    for (let i = 0; i < 20; i++) {
      // Rotate IPs across requests to verify keying is per-user, not per-IP
      const res = (await sendUpload(aliceCookie, aliceId, i % 3, `198.51.100.${10 + i}`))!;
      expect(res.status).toBe(201);
    }

    const blockedAlice = (await sendUpload(aliceCookie, aliceId, 0, "203.0.113.99"))!;
    expect(blockedAlice.status).toBe(429);
    expect(Number(blockedAlice.headers.get("retry-after"))).toBe(3600);

    // Bob on the exact same IP succeeds
    const bobRes = (await sendUpload(bobCookie, bobId, 0, "203.0.113.99"))!;
    expect(bobRes.status).toBe(201);

    // After 1 hour, Alice can upload again
    clockMs += 60 * 60 * 1000 + 1;
    expect((await sendUpload(aliceCookie, aliceId, 0, "203.0.113.99"))?.status).toBe(201);
  });

  it("enforces 30 / minute per IP on /api/firebase-proxy/*", async () => {
    const rateLimiter = new SlidingWindowRateLimiter();
    let clockMs = 1_800_000_000_000;

    const sendProxy = (ip: string) =>
      handleApiOrMediaRequest(
        new Request(
          "http://localhost:3000/api/firebase-proxy/identitytoolkit/v1/projects?key=wrong-key",
          {
            method: "GET",
            headers: { "x-forwarded-for": ip },
          },
        ),
        { rateLimiter, nowMs: () => clockMs },
      );

    for (let i = 0; i < 30; i++) {
      const res = (await sendProxy("192.0.2.90"))!;
      expect(res.status).toBe(403);
    }

    const blocked = (await sendProxy("192.0.2.90"))!;
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBe(60);

    expect((await sendProxy("192.0.2.91"))?.status).toBe(403);

    clockMs += 60_000 + 1;
    expect((await sendProxy("192.0.2.90"))?.status).toBe(403);
  });

  it("hashes and verifies passwords asynchronously via crypto.scrypt without blocking event-loop timers", async () => {
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 5);

    try {
      const hashes = await Promise.all([
        hashPassword("AsyncPass1!"),
        hashPassword("AsyncPass2!"),
        hashPassword("AsyncPass3!"),
        hashPassword("AsyncPass4!"),
      ]);

      expect(hashes).toHaveLength(4);
      const checks = await Promise.all([
        verifyPassword("AsyncPass1!", hashes[0]!),
        verifyPassword("WrongPass!", hashes[0]!),
        verifyPassword("AsyncPass2!", hashes[1]!),
        verifyPassword("AsyncPass3!", "badformat"),
      ]);

      expect(checks).toEqual([true, false, true, false]);
      expect(ticks).toBeGreaterThanOrEqual(1);
    } finally {
      clearInterval(timer);
    }
  });

  it("getClientIp ignores spoofed leftmost X-Forwarded-For entries and respects TRUSTED_PROXY_HEADER", () => {
    const prevHeader = process.env["TRUSTED_PROXY_HEADER"];
    delete process.env["TRUSTED_PROXY_HEADER"];
    try {
      // Default: uses ONLY the rightmost XFF entry appended by the trusted proxy
      expect(
        getClientIp(
          new Request("http://localhost:3000/api/events", {
            headers: {
              "x-forwarded-for": "1.1.1.1, 2.2.2.2, 198.51.100.42",
              "cf-connecting-ip": "9.9.9.9",
              "x-vercel-forwarded-for": "8.8.8.8",
              "x-real-ip": "7.7.7.7",
            },
          }),
        ),
      ).toBe("198.51.100.42");

      // Normalizes bracketed IPv6 or IPv4:port in rightmost slot and ignores malformed tail without walking left
      expect(
        getClientIp(
          new Request("http://localhost:3000/api/events", {
            headers: { "x-forwarded-for": "1.1.1.1, [2001:db8::1]:443" },
          }),
        ),
      ).toBe("2001:db8::1");
      expect(
        getClientIp(
          new Request("http://localhost:3000/api/events", {
            headers: { "x-forwarded-for": "1.1.1.1, not-a-valid-ip" },
          }),
        ),
      ).toBe("127.0.0.1");

      // TRUSTED_PROXY_HEADER=cf-connecting-ip uses ONLY cf-connecting-ip and ignores XFF
      process.env["TRUSTED_PROXY_HEADER"] = "cf-connecting-ip";
      expect(
        getClientIp(
          new Request("http://localhost:3000/api/events", {
            headers: {
              "x-forwarded-for": "1.1.1.1, 2.2.2.2",
              "x-vercel-forwarded-for": "8.8.8.8",
              "cf-connecting-ip": "203.0.113.19",
            },
          }),
        ),
      ).toBe("203.0.113.19");

      // TRUSTED_PROXY_HEADER=x-vercel-forwarded-for uses ONLY x-vercel-forwarded-for
      process.env["TRUSTED_PROXY_HEADER"] = "X-Vercel-Forwarded-For";
      expect(
        getClientIp(
          new Request("http://localhost:3000/api/events", {
            headers: {
              "x-forwarded-for": "1.1.1.1, 2.2.2.2",
              "cf-connecting-ip": "9.9.9.9",
              "x-vercel-forwarded-for": "198.51.100.99",
            },
          }),
        ),
      ).toBe("198.51.100.99");
    } finally {
      if (prevHeader === undefined) delete process.env["TRUSTED_PROXY_HEADER"];
      else process.env["TRUSTED_PROXY_HEADER"] = prevHeader;
    }
  });

  it("spoofed X-Forwarded-For headers cannot reset or bypass IP rate limits", async () => {
    const rateLimiter = new SlidingWindowRateLimiter();
    const clockMs = 1_820_000_000_000;

    // 1. Default mode (last XFF entry): attacker prepends rotating spoofed IPs while proxy appends real IP
    for (let i = 0; i < 5; i++) {
      const res = (await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/auth/forgot-password", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `10.0.0.${i + 1}, 198.51.100.77`,
            "cf-connecting-ip": `172.16.0.${i + 1}`,
          },
          body: JSON.stringify({ email: "" }),
        }),
        { rateLimiter, nowMs: () => clockMs },
      ))!;
      expect(res.status).toBe(200);
    }

    const blockedDefault = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.250, 198.51.100.77",
          "cf-connecting-ip": "172.16.0.99",
        },
        body: JSON.stringify({ email: "" }),
      }),
      { rateLimiter, nowMs: () => clockMs },
    ))!;
    expect(blockedDefault.status).toBe(429);

    // 2. TRUSTED_PROXY_HEADER=cf-connecting-ip: rotating entire X-Forwarded-For chains does NOT reset limit
    for (let i = 0; i < 5; i++) {
      const res = (await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `192.0.2.${i + 1}, 203.0.113.${i + 10}`,
            "cf-connecting-ip": "198.51.100.88",
          },
          body: JSON.stringify({ email: "alice.rl@example.com", password: "WrongPassword" }),
        }),
        { rateLimiter, nowMs: () => clockMs, trustedProxyHeader: "cf-connecting-ip" },
      ))!;
      expect(res.status).toBe(401);
    }

    const blockedCf = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.254",
          "cf-connecting-ip": "198.51.100.88",
        },
        body: JSON.stringify({ email: "alice.rl@example.com", password: "Password123!" }),
      }),
      { rateLimiter, nowMs: () => clockMs, trustedProxyHeader: "cf-connecting-ip" },
    ))!;
    expect(blockedCf.status).toBe(429);

    // 3. TRUSTED_PROXY_HEADER=x-vercel-forwarded-for: rotating XFF & cf-connecting-ip does NOT reset limit
    for (let i = 0; i < 5; i++) {
      const res = (await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/auth/check-signup", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `198.51.100.${i + 1}`,
            "cf-connecting-ip": `192.0.2.${i + 1}`,
            "x-vercel-forwarded-for": "203.0.113.44",
          },
          body: JSON.stringify({ email: "v@example.com", username: "verceluser" }),
        }),
        { rateLimiter, nowMs: () => clockMs, trustedProxyHeader: "x-vercel-forwarded-for" },
      ))!;
      expect(res.status).toBe(200);
    }

    const blockedVercel = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/check-signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.250",
          "cf-connecting-ip": "192.0.2.250",
          "x-vercel-forwarded-for": "203.0.113.44",
        },
        body: JSON.stringify({ email: "v@example.com", username: "verceluser" }),
      }),
      { rateLimiter, nowMs: () => clockMs, trustedProxyHeader: "x-vercel-forwarded-for" },
    ))!;
    expect(blockedVercel.status).toBe(429);
  });
});
