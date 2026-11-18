import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import firebaseConfig from "../firebase-applet-config.json";
import { TinkiStore } from "../src/server/local-fallback-store.server";

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signTokenWithSecret(secret: string, sub = "forged-user-123"): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub,
      email: "attacker@example.com",
      providers: ["email"],
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  return `${header}.${payload}.${base64UrlEncode(sig)}`;
}

function legacyDerivedSecret(): string {
  return crypto
    .createHash("sha256")
    .update(
      [
        "tinki-session-v2",
        firebaseConfig.projectId,
        firebaseConfig.firestoreDatabaseId,
        firebaseConfig.appId,
        firebaseConfig.apiKey,
      ].join(":"),
    )
    .digest("hex");
}

describe("TinkiStore session secret management", () => {
  const prevSecret = process.env["AUTH_SECRET"];
  const prevNodeEnv = process.env["NODE_ENV"];
  const tempDirs: string[] = [];

  function makeTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    if (prevSecret === undefined) delete process.env["AUTH_SECRET"];
    else process.env["AUTH_SECRET"] = prevSecret;

    if (prevNodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = prevNodeEnv;

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects tokens signed with the legacy firebase-applet-config.json derived secret", () => {
    delete process.env["AUTH_SECRET"];
    process.env["NODE_ENV"] = "development";

    const forgedToken = signTokenWithSecret(legacyDerivedSecret());

    // Default data dir (previously fell back to derived secret)
    const defaultStore = new TinkiStore();
    expect(defaultStore.verifySessionToken(forgedToken)).toBeNull();

    // Custom data dir
    const customStore = new TinkiStore(makeTempDir("tinki-secret-custom-"));
    expect(customStore.verifySessionToken(forgedToken)).toBeNull();
  });

  it("throws in production when AUTH_SECRET is missing or shorter than 32 chars", () => {
    const dir = makeTempDir("tinki-secret-prod-");
    process.env["NODE_ENV"] = "production";

    delete process.env["AUTH_SECRET"];
    expect(() => new TinkiStore(dir)).toThrow(/AUTH_SECRET.*32/);

    process.env["AUTH_SECRET"] = "too-short-secret-31-chars-12345";
    expect(process.env["AUTH_SECRET"].length).toBe(31);
    expect(() => new TinkiStore(dir)).toThrow(/AUTH_SECRET.*32/);

    process.env["AUTH_SECRET"] = "a".repeat(32);
    const prodStore = new TinkiStore(dir);
    expect(prodStore.verifySessionToken(signTokenWithSecret(legacyDerivedSecret()))).toBeNull();
  });

  it("generates and persists a random secret with mode 0o600 in development", async () => {
    delete process.env["AUTH_SECRET"];
    process.env["NODE_ENV"] = "development";

    const dir = makeTempDir("tinki-secret-dev-");
    const storeA = new TinkiStore(dir);
    const secretPath = path.join(dir, ".secret");

    expect(fs.existsSync(secretPath)).toBe(true);
    const stat = fs.statSync(secretPath);
    expect(stat.mode & 0o777).toBe(0o600);

    const persisted = fs.readFileSync(secretPath, "utf8").trim();
    expect(persisted.length).toBeGreaterThanOrEqual(64);

    const session = await storeA.signUp({
      email: "devuser@example.com",
      password: "Password123!",
      username: "devuser1",
    });
    await storeA.flush();

    const storeB = new TinkiStore(dir);
    const verified = storeB.verifySessionToken(session.access_token);
    expect(verified?.id).toBe(session.user.id);
    expect(storeB.verifySessionToken(signTokenWithSecret(legacyDerivedSecret()))).toBeNull();
  });
});
