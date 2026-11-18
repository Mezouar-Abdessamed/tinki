import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TinkiStore } from "../src/server/local-fallback-store.server";

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeTempDir(prefix: string, tracker: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tracker.push(dir);
  return dir;
}

describe("POST /api/auth/forgot-password security", () => {
  const tempDirs: string[] = [];
  const prevDataDir = process.env["TINKI_DATA_DIR"];
  const prevLocalStore = process.env["ENABLE_LOCAL_STORE"];
  let apiDir: string;
  let handleApiOrMediaRequest: typeof import("../src/server/api-router.server").handleApiOrMediaRequest;
  let resetApiRateLimits: typeof import("../src/server/api-router.server").resetApiRateLimits;
  let getStoreFn: typeof import("../src/server/local-fallback-store.server").getStore;

  beforeAll(async () => {
    apiDir = makeTempDir("tinki-forgot-api-", tempDirs);
    process.env["TINKI_DATA_DIR"] = apiDir;
    process.env["ENABLE_LOCAL_STORE"] = "true";
    vi.resetModules();
    ({ handleApiOrMediaRequest, resetApiRateLimits } = await import(
      "../src/server/api-router.server"
    ));
    const { getStore } = await import("../src/server/local-fallback-store.server");
    getStoreFn = getStore;

    const removedSignupRes = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "existing@example.com",
          password: "InitialPassword123!",
          username: "existinguser",
        }),
      }),
    );
    expect(removedSignupRes?.status).toBe(404);

    const pendingRes = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/register-pending", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "existing@example.com",
          password: "InitialPassword123!",
          username: "existinguser",
        }),
      }),
    );
    expect(pendingRes?.status).toBe(201);
    getStore().completeVerifiedEmailSignup({ email: "existing@example.com" });
  });

  beforeEach(() => {
    resetApiRateLimits();
  });

  afterAll(() => {
    if (prevDataDir === undefined) delete process.env["TINKI_DATA_DIR"];
    else process.env["TINKI_DATA_DIR"] = prevDataDir;
    if (prevLocalStore === undefined) delete process.env["ENABLE_LOCAL_STORE"];
    else process.env["ENABLE_LOCAL_STORE"] = prevLocalStore;

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns identical { ok: true } responses for existing, non-existing, and empty emails and never exposes resetToken", async () => {
    const delivered: Array<{ email: string; continueUrl?: string }> = [];
    const sendMock = async (email: string, continueUrl?: string) => {
      delivered.push({ email, ...(continueUrl ? { continueUrl } : {}) });
    };

    async function callForgot(email: string) {
      const started = Date.now();
      const response = await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/auth/forgot-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        }),
        { sendPasswordResetEmail: sendMock },
      );
      const elapsed = Date.now() - started;
      expect(response).not.toBeNull();
      const res = response!;
      const rawText = await res.text();
      return {
        status: res.status,
        contentType: res.headers.get("content-type"),
        cacheControl: res.headers.get("cache-control"),
        setCookie: res.headers.get("set-cookie"),
        rawText,
        json: JSON.parse(rawText) as Record<string, unknown>,
        elapsed,
      };
    }

    const existingRes = await callForgot("existing@example.com");
    const existingUpperRes = await callForgot("  EXISTING@Example.COM ");
    const unknownRes = await callForgot("does-not-exist@example.com");
    const emptyRes = await callForgot("");

    for (const result of [existingRes, existingUpperRes, unknownRes, emptyRes]) {
      expect(result.status).toBe(200);
      expect(result.contentType).toBe("application/json; charset=utf-8");
      expect(result.cacheControl).toBe("no-store");
      expect(result.setCookie).toBeNull();
      expect(result.rawText).toBe('{"ok":true}');
      expect(result.json).toEqual({ ok: true });
      expect(result.rawText).not.toMatch(/resetToken|token/i);
      expect(Object.keys(result.json)).toEqual(["ok"]);
      // Normalized timing floor (120ms minus minor timer jitter)
      expect(result.elapsed).toBeGreaterThanOrEqual(110);
    }

    expect(existingRes.rawText).toBe(unknownRes.rawText);
    expect(existingRes.status).toBe(unknownRes.status);
    expect(existingRes.contentType).toBe(unknownRes.contentType);

    // Email delivery is attempted uniformly for existing and non-existing non-empty emails
    expect(delivered).toEqual([
      { email: "existing@example.com", continueUrl: "http://localhost:3000/reset-password" },
      { email: "existing@example.com", continueUrl: "http://localhost:3000/reset-password" },
      { email: "does-not-exist@example.com", continueUrl: "http://localhost:3000/reset-password" },
    ]);

    // Stored token in db.json (only SHA-256 hash) is never present in any API response
    await getStoreFn().flush();
    const db = JSON.parse(fs.readFileSync(path.join(apiDir, "db.json"), "utf8")) as {
      resetTokens: Array<Record<string, unknown>>;
    };
    expect(db.resetTokens.length).toBe(1);
    expect(typeof db.resetTokens[0]?.["tokenHash"]).toBe("string");
    expect(db.resetTokens[0]?.["token"]).toBeUndefined();
    expect(existingRes.rawText).not.toContain(String(db.resetTokens[0]?.["tokenHash"]));
  });

  it("still returns HTTP 200 { ok: true } if email delivery throws", async () => {
    const failingDelivery = async () => {
      throw new Error("Simulated SMTP/Firebase failure");
    };

    const existingRes = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "existing@example.com" }),
      }),
      { sendPasswordResetEmail: failingDelivery },
    );
    const unknownRes = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "missing@example.com" }),
      }),
      { sendPasswordResetEmail: failingDelivery },
    );

    expect(existingRes?.status).toBe(200);
    expect(unknownRes?.status).toBe(200);
    expect(await existingRes?.text()).toBe('{"ok":true}');
    expect(await unknownRes?.text()).toBe('{"ok":true}');
  });
});

describe("TinkiStore resetTokens storage invariants", () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stores only the SHA-256 hash, enforces 1-hour expiry, single-use, and invalidates prior tokens for that user", async () => {
    const dir = makeTempDir("tinki-reset-store-", dirs);
    const store = new TinkiStore(dir);

    const userA = await store.signUp({
      email: "alice@example.com",
      password: "Password123!",
      username: "aliceuser",
    });
    const userB = await store.signUp({
      email: "bob@example.com",
      password: "Password123!",
      username: "bobuser",
    });

    const beforeMs = Date.now();
    const issued1 = store.createPasswordReset("alice@example.com");
    const afterMs = Date.now();
    expect(issued1?.token).toBeTruthy();

    await store.flush();
    const dbPath = path.join(dir, "db.json");
    const rawDb1 = fs.readFileSync(dbPath, "utf8");
    expect(rawDb1).not.toContain(issued1!.token);

    const db1 = JSON.parse(rawDb1) as {
      resetTokens: Array<{ tokenHash?: string; token?: string; userId: string; expiresAt: number }>;
    };
    expect(db1.resetTokens).toHaveLength(1);
    expect(db1.resetTokens[0]?.token).toBeUndefined();
    expect(db1.resetTokens[0]?.tokenHash).toBe(sha256Hex(issued1!.token));
    expect(db1.resetTokens[0]?.userId).toBe(userA.user.id);
    expect(db1.resetTokens[0]!.expiresAt).toBeGreaterThanOrEqual(beforeMs + 60 * 60 * 1000);
    expect(db1.resetTokens[0]!.expiresAt).toBeLessThanOrEqual(afterMs + 60 * 60 * 1000);

    // Issue a token for User B and then a second token for User A; User A's first token must be invalidated
    const bobIssued = store.createPasswordReset("bob@example.com");
    const issued2 = store.createPasswordReset("alice@example.com");
    expect(bobIssued?.token).toBeTruthy();
    expect(issued2?.token).toBeTruthy();
    expect(issued2!.token).not.toBe(issued1!.token);

    await store.flush();
    const db2 = JSON.parse(fs.readFileSync(dbPath, "utf8")) as {
      resetTokens: Array<{ tokenHash: string; userId: string; expiresAt: number }>;
    };
    expect(db2.resetTokens.map((t) => t.tokenHash).sort()).toEqual(
      [sha256Hex(bobIssued!.token), sha256Hex(issued2!.token)].sort(),
    );

    // Prior token for Alice is invalidated
    await expect(store.consumePasswordReset(issued1!.token, "NewPass123!")).rejects.toThrow(
      /expired or is invalid/i,
    );

    // Latest token for Alice succeeds once and is then invalidated (single-use)
    const resetSession = await store.consumePasswordReset(issued2!.token, "NewPass123!");
    expect(resetSession.user.id).toBe(userA.user.id);
    await expect(store.consumePasswordReset(issued2!.token, "AnotherPass123!")).rejects.toThrow(
      /expired or is invalid/i,
    );

    // Bob's token was unaffected, and expires if past the 1-hour window
    await store.flush();
    const db3 = JSON.parse(fs.readFileSync(dbPath, "utf8")) as {
      resetTokens: Array<{ tokenHash: string; userId: string; expiresAt: number }>;
    };
    expect(db3.resetTokens).toHaveLength(1);
    expect(db3.resetTokens[0]?.userId).toBe(userB.user.id);

    db3.resetTokens[0]!.expiresAt = Date.now() - 1000;
    fs.writeFileSync(dbPath, JSON.stringify(db3, null, 2), "utf8");

    const reloadedStore = new TinkiStore(dir);
    await expect(reloadedStore.consumePasswordReset(bobIssued!.token, "BobNew123!")).rejects.toThrow(
      /expired or is invalid/i,
    );
  });
});
