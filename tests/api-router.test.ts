import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import firebaseConfig from "../firebase-applet-config.json";
import {
  SlidingWindowRateLimiter,
  handleApiOrMediaRequest,
  resetApiRateLimits,
} from "../src/server/api-router.server";
import {
  MAX_MEDIA_FILE_BYTES,
  getStore,
  resetSharedStoreForTests,
} from "../src/server/local-fallback-store.server";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

function jsonRequest(
  pathname: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    token?: string;
    ip?: string;
    headers?: Record<string, string>;
  } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(options.ip ? { "x-forwarded-for": options.ip } : {}),
    ...(options.cookie ? { cookie: options.cookie } : {}),
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    ...options.headers,
  };
  return new Request(`http://localhost:3000${pathname}`, {
    method: options.method ?? "POST",
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

function cookieFromSetCookie(res: Response): string {
  const raw = res.headers.get("set-cookie");
  if (!raw) throw new Error("Expected set-cookie header on response");
  return raw.split(";")[0] ?? "";
}

async function createSignedUpUser(opts: { email: string; password: string; username: string }) {
  const store = getStore();
  const session = await store.signUp(opts);
  return {
    userId: session.user.id,
    token: session.access_token,
    cookie: `tinki_session=${encodeURIComponent(session.access_token)}`,
  };
}

describe("API router (handleApiOrMediaRequest)", () => {
  const prevDataDir = process.env["TINKI_DATA_DIR"];
  const prevLocalStore = process.env["ENABLE_LOCAL_STORE"];
  const prevSecret = process.env["AUTH_SECRET"];
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-api-router-"));
    process.env["TINKI_DATA_DIR"] = tmpDir;
    process.env["ENABLE_LOCAL_STORE"] = "true";
    process.env["AUTH_SECRET"] = "router-test-secret-minimum-32-chars-long";
    resetSharedStoreForTests();
    resetApiRateLimits();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetSharedStoreForTests();
    resetApiRateLimits();
    if (prevDataDir === undefined) delete process.env["TINKI_DATA_DIR"];
    else process.env["TINKI_DATA_DIR"] = prevDataDir;
    if (prevLocalStore === undefined) delete process.env["ENABLE_LOCAL_STORE"];
    else process.env["ENABLE_LOCAL_STORE"] = prevLocalStore;
    if (prevSecret === undefined) delete process.env["AUTH_SECRET"];
    else process.env["AUTH_SECRET"] = prevSecret;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("authentication-required routes & ownership", () => {
    it("returns 401 on all protected routes when unauthenticated or using invalid tokens", async () => {
      const protectedCalls: Array<() => Promise<Response | null>> = [
        () =>
          handleApiOrMediaRequest(
            new Request("http://localhost:3000/api/profiles/me", { method: "GET" }),
          ),
        () =>
          handleApiOrMediaRequest(
            jsonRequest("/api/profiles/me", { method: "PATCH", body: { bio: "hi" } }),
          ),
        () =>
          handleApiOrMediaRequest(jsonRequest("/api/profiles", { body: { username: "someone" } })),
        () =>
          handleApiOrMediaRequest(
            jsonRequest("/api/custom-links", { body: { name: "Site", url: "https://a.com" } }),
          ),
        () =>
          handleApiOrMediaRequest(
            jsonRequest("/api/custom-links/reorder", { body: { ordered_ids: [] } }),
          ),
        () =>
          handleApiOrMediaRequest(
            jsonRequest("/api/custom-links/link-1", { method: "PATCH", body: { name: "New" } }),
          ),
        () =>
          handleApiOrMediaRequest(
            jsonRequest("/api/custom-links/link-1", { method: "DELETE", body: {} }),
          ),
        () =>
          handleApiOrMediaRequest(
            jsonRequest("/api/social-settings", { method: "PUT", body: { settings: [] } }),
          ),
        () =>
          handleApiOrMediaRequest(
            new Request("http://localhost:3000/api/analytics", { method: "GET" }),
          ),
        () =>
          handleApiOrMediaRequest(
            new Request("http://localhost:3000/api/storage/avatars/upload?path=u/a.png", {
              method: "POST",
              headers: { "content-type": "image/png" },
              body: new Uint8Array(PNG_BYTES),
            }),
          ),
        () =>
          handleApiOrMediaRequest(
            new Request("http://localhost:3000/api/storage/avatars/list", { method: "GET" }),
          ),
        () =>
          handleApiOrMediaRequest(
            jsonRequest("/api/storage/avatars/remove", { body: { paths: [] } }),
          ),
        () =>
          handleApiOrMediaRequest(
            jsonRequest("/api/auth/update-password", { body: { password: "NewPassword1!" } }),
          ),
        () =>
          handleApiOrMediaRequest(
            jsonRequest("/api/auth/reauth-google", { body: { idToken: "fake" } }),
          ),
        () =>
          handleApiOrMediaRequest(
            jsonRequest("/api/auth/account", {
              method: "DELETE",
              body: { username: "someone", password: "Password123!" },
            }),
          ),
      ];

      for (const invoke of protectedCalls) {
        const res = await invoke();
        expect(res?.status).toBe(401);
        expect(await res?.json()).toMatchObject({ code: "unauthorized" });
      }

      // Tampered bearer / cookie tokens also fail with 401
      const tamperedRes = await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/profiles/me", {
          method: "GET",
          headers: {
            cookie: "tinki_session=invalid.tampered.token",
          },
        }),
      );
      expect(tamperedRes?.status).toBe(401);
    });

    it("authenticates with session cookies, refreshes sliding sessions, revokes on logout, and blocks cross-user access", async () => {
      const alice = await createSignedUpUser({
        email: "alice.auth@example.com",
        password: "Password123!",
        username: "aliceauth",
      });
      const bob = await createSignedUpUser({
        email: "bob.auth@example.com",
        password: "Password123!",
        username: "bobauth",
      });

      const meRes = (await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/profiles/me", {
          method: "GET",
          headers: { cookie: alice.cookie },
        }),
      ))!;
      expect(meRes.status).toBe(200);
      expect(meRes.headers.get("set-cookie")).toContain("tinki_session=");
      expect(((await meRes.json()) as { profile: { username: string } }).profile.username).toBe(
        "aliceauth",
      );

      // Cross-user analytics read is forbidden
      const crossAnalytics = (await handleApiOrMediaRequest(
        new Request(`http://localhost:3000/api/analytics?profileId=${alice.userId}`, {
          method: "GET",
          headers: { cookie: bob.cookie },
        }),
      ))!;
      expect(crossAnalytics.status).toBe(403);

      // Logout revokes the token and clears the cookie
      const logoutRes = (await handleApiOrMediaRequest(
        jsonRequest("/api/auth/logout", { cookie: alice.cookie, body: {} }),
      ))!;
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.headers.get("set-cookie")).toContain("Max-Age=0");

      const afterLogout = (await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/profiles/me", {
          method: "GET",
          headers: { cookie: alice.cookie },
        }),
      ))!;
      expect(afterLogout.status).toBe(401);
    });
  });

  describe("forgot-password and reset-password", () => {
    it("returns uniform 200 without leaking tokens, forwards continueUrl unless client-dispatched, and resets passwords once", async () => {
      await createSignedUpUser({
        email: "forgot.router@example.com",
        password: "OldPassword1!",
        username: "forgotrouter",
      });

      const sent: Array<{ email: string; continueUrl: string | undefined }> = [];
      const existingRes = (await handleApiOrMediaRequest(
        jsonRequest("/api/auth/forgot-password", {
          ip: "198.51.100.1",
          body: { email: "  FORGOT.ROUTER@example.com  " },
        }),
        {
          sendPasswordResetEmail: async (email, continueUrl) => {
            sent.push({ email, continueUrl });
          },
        },
      ))!;
      expect(existingRes.status).toBe(200);
      const existingBody = (await existingRes.json()) as Record<string, unknown>;
      expect(existingBody).toEqual({ ok: true });
      expect(sent).toEqual([
        { email: "forgot.router@example.com", continueUrl: "http://localhost:3000/reset-password" },
      ]);

      // Nonexistent account returns identical shape without timing/body distinction
      const missingRes = (await handleApiOrMediaRequest(
        jsonRequest("/api/auth/forgot-password", {
          ip: "198.51.100.2",
          body: { email: "nobody@example.com" },
        }),
        {
          sendPasswordResetEmail: async () => {
            throw new Error("Simulated mail transport outage");
          },
        },
      ))!;
      expect(missingRes.status).toBe(200);
      expect(await missingRes.json()).toEqual({ ok: true });

      // Client-dispatched header skips server-side Firebase email dispatch
      const prevNodeEnv = process.env["NODE_ENV"];
      const fetchSpy = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
      vi.stubGlobal("fetch", fetchSpy);
      process.env["NODE_ENV"] = "development";
      try {
        const clientDispatchedRes = (await handleApiOrMediaRequest(
          jsonRequest("/api/auth/forgot-password", {
            ip: "198.51.100.3",
            headers: { "x-reset-email-dispatched": "client" },
            body: { email: "forgot.router@example.com" },
          }),
        ))!;
        expect(clientDispatchedRes.status).toBe(200);
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        if (prevNodeEnv === undefined) delete process.env["NODE_ENV"];
        else process.env["NODE_ENV"] = prevNodeEnv;
        vi.unstubAllGlobals();
      }

      // Issue an active token directly on the store and exercise /api/auth/reset-password
      const issued = getStore().createPasswordReset("forgot.router@example.com");
      expect(issued?.token).toBeTruthy();

      // Weak password rejected without consuming token
      const weakRes = (await handleApiOrMediaRequest(
        jsonRequest("/api/auth/reset-password", {
          ip: "198.51.100.4",
          body: { token: issued!.token, password: "short" },
        }),
      ))!;
      expect(weakRes.status).toBe(400);

      // Valid reset returns session cookie and logs user in
      const resetRes = (await handleApiOrMediaRequest(
        jsonRequest("/api/auth/reset-password", {
          ip: "198.51.100.5",
          body: { token: issued!.token, password: "NewPassword9!" },
        }),
      ))!;
      expect(resetRes.status).toBe(200);
      const resetCookie = cookieFromSetCookie(resetRes);
      const sessionCheck = (await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/auth/session", {
          method: "GET",
          headers: { cookie: resetCookie },
        }),
      ))!;
      expect(sessionCheck.status).toBe(200);
      expect(
        ((await sessionCheck.json()) as { session: { user: { email: string } } | null }).session
          ?.user.email,
      ).toBe("forgot.router@example.com");

      // Reusing the same reset token fails
      const reuseRes = (await handleApiOrMediaRequest(
        jsonRequest("/api/auth/reset-password", {
          ip: "198.51.100.6",
          body: { token: issued!.token, password: "AnotherPass9!" },
        }),
      ))!;
      expect(reuseRes.status).toBe(400);

      // Old password no longer logs in; new password succeeds
      const oldLogin = (await handleApiOrMediaRequest(
        jsonRequest("/api/auth/login", {
          ip: "198.51.100.7",
          body: { email: "forgot.router@example.com", password: "OldPassword1!" },
        }),
      ))!;
      expect(oldLogin.status).toBe(401);

      const newLogin = (await handleApiOrMediaRequest(
        jsonRequest("/api/auth/login", {
          ip: "198.51.100.7",
          body: { email: "forgot.router@example.com", password: "NewPassword9!" },
        }),
      ))!;
      expect(newLogin.status).toBe(200);
    });
  });

  describe("media uploads, listing, removal, and /media/* serving", () => {
    it("uploads, lists, serves with security headers, and removes files while rejecting bad buckets/ownership/types/sizes", async () => {
      const alice = await createSignedUpUser({
        email: "alice.media@example.com",
        password: "Password123!",
        username: "alicemedia",
      });
      const bob = await createSignedUpUser({
        email: "bob.media@example.com",
        password: "Password123!",
        username: "bobmedia",
      });

      const uploadReq = (
        bucket: string,
        objectPath: string,
        body: Buffer,
        contentType: string,
        cookie = alice.cookie,
      ) =>
        handleApiOrMediaRequest(
          new Request(
            `http://localhost:3000/api/storage/${encodeURIComponent(bucket)}/upload?path=${encodeURIComponent(objectPath)}`,
            {
              method: "POST",
              headers: { cookie, "content-type": contentType },
              body: new Uint8Array(body),
            },
          ),
        );

      // Happy path upload
      const up = (await uploadReq(
        "avatars",
        `${alice.userId}/avatar.png`,
        PNG_BYTES,
        "image/png",
      ))!;
      expect(up.status).toBe(201);
      expect(await up.json()).toEqual({ path: `${alice.userId}/avatar.png` });

      // List returns uploaded file
      const listRes = (await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/storage/avatars/list", {
          method: "GET",
          headers: { cookie: alice.cookie },
        }),
      ))!;
      expect(listRes.status).toBe(200);
      expect(await listRes.json()).toEqual({
        files: [{ id: `${alice.userId}/avatar.png`, name: "avatar.png" }],
      });

      // GET and HEAD /media/* return file & security headers
      const getRes = (await handleApiOrMediaRequest(
        new Request(`http://localhost:3000/media/avatars/${alice.userId}/avatar.png`),
      ))!;
      expect(getRes.status).toBe(200);
      expect(getRes.headers.get("content-type")).toBe("image/png");
      expect(getRes.headers.get("x-content-type-options")).toBe("nosniff");
      expect(getRes.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
      expect(getRes.headers.get("content-disposition")).toBe("inline");
      expect(Buffer.from(await getRes.arrayBuffer())).toEqual(PNG_BYTES);

      const headRes = (await handleApiOrMediaRequest(
        new Request(`http://localhost:3000/media/avatars/${alice.userId}/avatar.png`, {
          method: "HEAD",
        }),
      ))!;
      expect(headRes.status).toBe(200);
      expect((await headRes.arrayBuffer()).byteLength).toBe(0);

      // Invalid bucket, cross-user path, traversal, empty body, oversized body, disallowed/spoofed MIME
      expect(
        (await uploadReq("secrets", `${alice.userId}/a.png`, PNG_BYTES, "image/png")).status,
      ).toBe(400);
      expect(
        (
          await uploadReq(
            "avatars",
            `${alice.userId}/steal.png`,
            PNG_BYTES,
            "image/png",
            bob.cookie,
          )
        ).status,
      ).toBe(403);
      expect(
        (await uploadReq("avatars", `${alice.userId}/../evil.png`, PNG_BYTES, "image/png")).status,
      ).toBe(400);
      expect(
        (await uploadReq("avatars", `${alice.userId}/empty.png`, Buffer.alloc(0), "image/png"))
          .status,
      ).toBe(400);
      expect(
        (
          await uploadReq(
            "avatars",
            `${alice.userId}/huge.png`,
            Buffer.alloc(MAX_MEDIA_FILE_BYTES + 1, 0),
            "image/png",
          )
        ).status,
      ).toBe(400);
      expect(
        (await uploadReq("avatars", `${alice.userId}/x.svg`, SVG_BYTES, "image/svg+xml")).status,
      ).toBe(415);
      expect(
        (await uploadReq("avatars", `${alice.userId}/fake.png`, JPEG_BYTES, "image/png")).status,
      ).toBe(415);
      expect(
        (await uploadReq("avatars", `${alice.userId}/form.png`, PNG_BYTES, "multipart/form-data"))
          .status,
      ).toBe(415);

      // Bob's remove attempt leaves Alice's file untouched; Alice removes it and /media returns 404
      await handleApiOrMediaRequest(
        jsonRequest("/api/storage/avatars/remove", {
          cookie: bob.cookie,
          body: { paths: [`${alice.userId}/avatar.png`] },
        }),
      );
      const stillPresent = (await handleApiOrMediaRequest(
        new Request(`http://localhost:3000/media/avatars/${alice.userId}/avatar.png`),
      ))!;
      expect(stillPresent.status).toBe(200);

      const aliceRemove = (await handleApiOrMediaRequest(
        jsonRequest("/api/storage/avatars/remove", {
          cookie: alice.cookie,
          body: { paths: [`${alice.userId}/avatar.png`] },
        }),
      ))!;
      expect(aliceRemove.status).toBe(200);

      const afterRemove = (await handleApiOrMediaRequest(
        new Request(`http://localhost:3000/media/avatars/${alice.userId}/avatar.png`),
      ))!;
      expect(afterRemove.status).toBe(404);
    });
  });

  describe("custom-link validation, CRUD, and reorder", () => {
    it("creates, validates, lists, updates, reorders, and deletes custom links with ownership enforcement", async () => {
      const alice = await createSignedUpUser({
        email: "alice.links@example.com",
        password: "Password123!",
        username: "alicelinks",
      });
      const bob = await createSignedUpUser({
        email: "bob.links@example.com",
        password: "Password123!",
        username: "boblinks",
      });

      // Google user without a profile yet gets 404 on POST /api/custom-links
      const googleSession = getStore().loginWithGoogle({
        uid: "google-no-profile",
        email: "noprofile@gmail.com",
      });
      const noProfileRes = (await handleApiOrMediaRequest(
        jsonRequest("/api/custom-links", {
          token: googleSession.access_token,
          body: { name: "Portfolio", url: "https://example.com" },
        }),
      ))!;
      expect(noProfileRes.status).toBe(404);

      // Invalid names & malformed JSON rejected with 400
      for (const badName of ["", "   ", "a".repeat(81)]) {
        const res = (await handleApiOrMediaRequest(
          jsonRequest("/api/custom-links", {
            cookie: alice.cookie,
            body: { name: badName, url: "https://example.com" },
          }),
        ))!;
        expect(res.status).toBe(400);
      }

      const badJsonRes = (await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/custom-links", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: alice.cookie },
          body: "{not-json",
        }),
      ))!;
      expect(badJsonRes.status).toBe(400);

      // Create two links
      const createA = (await handleApiOrMediaRequest(
        jsonRequest("/api/custom-links", {
          cookie: alice.cookie,
          body: {
            name: "  Portfolio  ",
            url: "https://alice.dev",
            icon: "portfolio",
            link_type: "link",
          },
        }),
      ))!;
      expect(createA.status).toBe(201);
      const { link: linkA } = (await createA.json()) as {
        link: { id: string; name: string; position: number; enabled: boolean };
      };
      expect(linkA.name).toBe("Portfolio");
      expect(linkA.position).toBe(0);

      const createB = (await handleApiOrMediaRequest(
        jsonRequest("/api/custom-links", {
          cookie: alice.cookie,
          body: {
            name: "Email Me",
            url: "mailto:alice@example.com",
            icon: "email",
            link_type: "email",
          },
        }),
      ))!;
      expect(createB.status).toBe(201);
      const { link: linkB } = (await createB.json()) as {
        link: { id: string; position: number };
      };
      expect(linkB.position).toBe(1);

      // PATCH validates name and supports disabling
      const badPatch = (await handleApiOrMediaRequest(
        jsonRequest(`/api/custom-links/${linkA.id}`, {
          method: "PATCH",
          cookie: alice.cookie,
          body: { name: "   " },
        }),
      ))!;
      expect(badPatch.status).toBe(400);

      const disableA = (await handleApiOrMediaRequest(
        jsonRequest(`/api/custom-links/${linkA.id}`, {
          method: "PATCH",
          cookie: alice.cookie,
          body: { name: "Studio Site", enabled: false },
        }),
      ))!;
      expect(disableA.status).toBe(200);
      expect(
        ((await disableA.json()) as { link: { name: string; enabled: boolean } }).link,
      ).toMatchObject({ name: "Studio Site", enabled: false });

      // Cross-user PATCH & DELETE rejected with 404
      expect(
        (
          await handleApiOrMediaRequest(
            jsonRequest(`/api/custom-links/${linkA.id}`, {
              method: "PATCH",
              cookie: bob.cookie,
              body: { name: "Hijacked" },
            }),
          )
        )?.status,
      ).toBe(404);
      expect(
        (
          await handleApiOrMediaRequest(
            jsonRequest(`/api/custom-links/${linkA.id}`, {
              method: "DELETE",
              cookie: bob.cookie,
              body: {},
            }),
          )
        )?.status,
      ).toBe(404);

      // Reorder validation: cross-user 403, incomplete/duplicate/unknown 400
      expect(
        (
          await handleApiOrMediaRequest(
            jsonRequest("/api/custom-links/reorder", {
              cookie: bob.cookie,
              body: { target_profile_id: alice.userId, ordered_ids: [linkB.id, linkA.id] },
            }),
          )
        )?.status,
      ).toBe(403);
      expect(
        (
          await handleApiOrMediaRequest(
            jsonRequest("/api/custom-links/reorder", {
              cookie: alice.cookie,
              body: { ordered_ids: [linkB.id] },
            }),
          )
        )?.status,
      ).toBe(400);
      expect(
        (
          await handleApiOrMediaRequest(
            jsonRequest("/api/custom-links/reorder", {
              cookie: alice.cookie,
              body: { ordered_ids: [linkB.id, linkB.id] },
            }),
          )
        )?.status,
      ).toBe(400);
      expect(
        (
          await handleApiOrMediaRequest(
            jsonRequest("/api/custom-links/reorder", {
              cookie: alice.cookie,
              body: { ordered_ids: [linkB.id, "non-existent-id"] },
            }),
          )
        )?.status,
      ).toBe(400);

      // Valid reorder updates order & enabledOnly filtering works on GET
      const reorderOk = (await handleApiOrMediaRequest(
        jsonRequest("/api/custom-links/reorder", {
          cookie: alice.cookie,
          body: { ordered_ids: [linkB.id, linkA.id] },
        }),
      ))!;
      expect(reorderOk.status).toBe(200);

      const allLinksRes = (await handleApiOrMediaRequest(
        new Request(`http://localhost:3000/api/profiles/${alice.userId}/custom-links`),
      ))!;
      expect(allLinksRes.status).toBe(200);
      expect(
        ((await allLinksRes.json()) as { links: Array<{ id: string }> }).links.map((l) => l.id),
      ).toEqual([linkB.id, linkA.id]);

      const enabledLinksRes = (await handleApiOrMediaRequest(
        new Request(
          `http://localhost:3000/api/profiles/${alice.userId}/custom-links?enabledOnly=true`,
        ),
      ))!;
      expect(
        ((await enabledLinksRes.json()) as { links: Array<{ id: string }> }).links.map((l) => l.id),
      ).toEqual([linkB.id]);

      // Delete owned link removes it from list
      const deleteOk = (await handleApiOrMediaRequest(
        jsonRequest(`/api/custom-links/${linkA.id}`, {
          method: "DELETE",
          cookie: alice.cookie,
          body: {},
        }),
      ))!;
      expect(deleteOk.status).toBe(200);

      const afterDelete = (await handleApiOrMediaRequest(
        new Request(`http://localhost:3000/api/profiles/${alice.userId}/custom-links`),
      ))!;
      expect(
        ((await afterDelete.json()) as { links: Array<{ id: string }> }).links.map((l) => l.id),
      ).toEqual([linkB.id]);
    });
  });

  describe("rate limits across auth, storage, events, and firebase-proxy", () => {
    it("enforces login (5/15m IP+email), forgot-password (5/h IP), storage upload (20/h user), events (60/m IP), and firebase-proxy (30/m IP) limits", async () => {
      const alice = await createSignedUpUser({
        email: "alice.limits@example.com",
        password: "Password123!",
        username: "alicelimits",
      });
      const rateLimiter = new SlidingWindowRateLimiter();
      let nowMs = 1_850_000_000_000;

      // 1) /api/auth/login: 5 attempts / 15 min per IP+email
      for (let i = 0; i < 5; i++) {
        const res = (await handleApiOrMediaRequest(
          jsonRequest("/api/auth/login", {
            ip: "198.51.100.40",
            body: { email: "alice.limits@example.com", password: "WrongPassword" },
          }),
          { rateLimiter, nowMs: () => nowMs },
        ))!;
        expect(res.status).toBe(401);
        nowMs += 1000;
      }
      const loginBlocked = (await handleApiOrMediaRequest(
        jsonRequest("/api/auth/login", {
          ip: "198.51.100.40",
          body: { email: "ALICE.LIMITS@example.com", password: "Password123!" },
        }),
        { rateLimiter, nowMs: () => nowMs },
      ))!;
      expect(loginBlocked.status).toBe(429);
      expect(Number(loginBlocked.headers.get("retry-after"))).toBeGreaterThan(0);

      // 2) /api/auth/forgot-password: 5 / hour per IP
      for (let i = 0; i < 5; i++) {
        const res = (await handleApiOrMediaRequest(
          jsonRequest("/api/auth/forgot-password", {
            ip: "198.51.100.41",
            body: { email: "alice.limits@example.com" },
          }),
          { rateLimiter, nowMs: () => nowMs },
        ))!;
        expect(res.status).toBe(200);
      }
      const forgotBlocked = (await handleApiOrMediaRequest(
        jsonRequest("/api/auth/forgot-password", {
          ip: "198.51.100.41",
          body: { email: "alice.limits@example.com" },
        }),
        { rateLimiter, nowMs: () => nowMs },
      ))!;
      expect(forgotBlocked.status).toBe(429);
      expect(Number(forgotBlocked.headers.get("retry-after"))).toBe(3600);

      // 3) /api/storage/*/upload: 20 / hour per user
      for (let i = 0; i < 20; i++) {
        const res = (await handleApiOrMediaRequest(
          new Request(
            `http://localhost:3000/api/storage/avatars/upload?path=${encodeURIComponent(`${alice.userId}/item.png`)}`,
            {
              method: "POST",
              headers: {
                cookie: alice.cookie,
                "content-type": "image/png",
                "x-forwarded-for": `203.0.113.${10 + i}`,
              },
              body: new Uint8Array(PNG_BYTES),
            },
          ),
          { rateLimiter, nowMs: () => nowMs },
        ))!;
        expect(res.status).toBe(201);
      }
      const uploadBlocked = (await handleApiOrMediaRequest(
        new Request(
          `http://localhost:3000/api/storage/avatars/upload?path=${encodeURIComponent(`${alice.userId}/item.png`)}`,
          {
            method: "POST",
            headers: {
              cookie: alice.cookie,
              "content-type": "image/png",
              "x-forwarded-for": "203.0.113.200",
            },
            body: new Uint8Array(PNG_BYTES),
          },
        ),
        { rateLimiter, nowMs: () => nowMs },
      ))!;
      expect(uploadBlocked.status).toBe(429);
      expect(Number(uploadBlocked.headers.get("retry-after"))).toBe(3600);

      // 4) /api/events: 60 / minute per IP
      for (let i = 0; i < 60; i++) {
        const res = (await handleApiOrMediaRequest(
          jsonRequest("/api/events", {
            ip: "192.0.2.77",
            body: {
              profile_id: alice.userId,
              event_type: "profile_view",
              visitor_id: crypto.randomUUID(),
            },
          }),
          { rateLimiter, nowMs: () => nowMs },
        ))!;
        expect(res.status).toBe(201);
      }
      const eventBlocked = (await handleApiOrMediaRequest(
        jsonRequest("/api/events", {
          ip: "192.0.2.77",
          body: {
            profile_id: alice.userId,
            event_type: "profile_view",
            visitor_id: crypto.randomUUID(),
          },
        }),
        { rateLimiter, nowMs: () => nowMs },
      ))!;
      expect(eventBlocked.status).toBe(429);
      expect(Number(eventBlocked.headers.get("retry-after"))).toBe(60);

      // 5) /api/firebase-proxy/*: 30 / minute per IP (stub upstream fetch for happy path)
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ kind: "identitytoolkit#GetProjectConfigResponse" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        ),
      );
      for (let i = 0; i < 30; i++) {
        const res = (await handleApiOrMediaRequest(
          new Request(
            `http://localhost:3000/api/firebase-proxy/identitytoolkit/v1/projects?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
            { method: "GET", headers: { "x-forwarded-for": "192.0.2.88" } },
          ),
          { rateLimiter, nowMs: () => nowMs },
        ))!;
        expect(res.status).toBe(200);
      }
      const proxyBlocked = (await handleApiOrMediaRequest(
        new Request(
          `http://localhost:3000/api/firebase-proxy/identitytoolkit/v1/projects?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
          { method: "GET", headers: { "x-forwarded-for": "192.0.2.88" } },
        ),
        { rateLimiter, nowMs: () => nowMs },
      ))!;
      expect(proxyBlocked.status).toBe(429);
      expect(Number(proxyBlocked.headers.get("retry-after"))).toBe(60);

      // After 1 hour, all windows have recovered
      nowMs += 60 * 60 * 1000 + 1;
      const recoveredProxy = (await handleApiOrMediaRequest(
        new Request(
          `http://localhost:3000/api/firebase-proxy/identitytoolkit/v1/projects?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
          { method: "GET", headers: { "x-forwarded-for": "192.0.2.88" } },
        ),
        { rateLimiter, nowMs: () => nowMs },
      ))!;
      expect(recoveredProxy.status).toBe(200);
    });
  });
});
