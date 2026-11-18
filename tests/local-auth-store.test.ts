import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyFirebaseIdToken } from "../src/server/firebase-token-verifier.server";
import {
  StoreError,
  TinkiStore,
  hashPassword,
  verifyPassword,
} from "../src/server/local-fallback-store.server";

function signTestJwt(
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject,
  kid = "test-kid-1",
) {
  const encode = (val: object) =>
    Buffer.from(JSON.stringify(val))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const headerSeg = encode({ alg: "RS256", typ: "JWT", kid });
  const payloadSeg = encode(payload);
  const sig = crypto.sign("RSA-SHA256", Buffer.from(`${headerSeg}.${payloadSeg}`), privateKey);
  const sigSeg = sig.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${headerSeg}.${payloadSeg}.${sigSeg}`;
}

describe("TinkiStore local auth & persistence", () => {
  let tmpDir: string;
  let store: TinkiStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-store-test-"));
    store = new TinkiStore(tmpDir);
  });

  afterEach(() => {
    store.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("hashes and verifies passwords with timing-safe async scrypt comparison", async () => {
    const hash = await hashPassword("MySecretPass123!");
    expect(await verifyPassword("MySecretPass123!", hash)).toBe(true);
    expect(await verifyPassword("WrongPassword", hash)).toBe(false);
    expect(await verifyPassword("anything", "malformed")).toBe(false);
  });

  it("verifies RS256 Firebase ID tokens and rejects expired or mismatched tokens", async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const publicJwk = publicKey.export({ format: "jwk" }) as crypto.JsonWebKey & { kid?: string };
    publicJwk.kid = "test-kid-1";
    const getJwks = async () => new Map([["test-kid-1", publicJwk]]);
    const now = 1_750_000_000;

    const validToken = signTestJwt(
      {
        aud: "test-project",
        iss: "https://securetoken.google.com/test-project",
        sub: "google-uid-123",
        email: "Jane.Doe@gmail.com",
        email_verified: true,
        name: "Jane Doe",
        iat: now - 10,
        auth_time: now - 10,
        exp: now + 3600,
      },
      privateKey,
    );

    const claims = await verifyFirebaseIdToken(validToken, {
      projectId: "test-project",
      nowSeconds: now,
      getJwks,
    });
    expect(claims.uid).toBe("google-uid-123");
    expect(claims.email).toBe("jane.doe@gmail.com");
    expect(claims.name).toBe("Jane Doe");

    const expiredToken = signTestJwt(
      {
        aud: "test-project",
        iss: "https://securetoken.google.com/test-project",
        sub: "google-uid-123",
        email: "jane.doe@gmail.com",
        email_verified: true,
        iat: now - 4000,
        auth_time: now - 4000,
        exp: now - 5,
      },
      privateKey,
    );
    await expect(
      verifyFirebaseIdToken(expiredToken, { projectId: "test-project", nowSeconds: now, getJwks }),
    ).rejects.toThrow(/expired/i);

    const wrongAudToken = signTestJwt(
      {
        aud: "other-project",
        iss: "https://securetoken.google.com/other-project",
        sub: "google-uid-123",
        email: "jane.doe@gmail.com",
        email_verified: true,
        iat: now - 10,
        auth_time: now - 10,
        exp: now + 3600,
      },
      privateKey,
    );
    await expect(
      verifyFirebaseIdToken(wrongAudToken, { projectId: "test-project", nowSeconds: now, getJwks }),
    ).rejects.toThrow(/does not match/i);
  });

  it("signs in with Google, sets emailVerified, links verified email users, and refuses unverified ones", async () => {
    const googleSession = store.loginWithGoogle({
      uid: "google-uid-abc",
      email: "NewGoogleUser@gmail.com",
      name: "New Google User",
    });
    expect(googleSession.user.email).toBe("newgoogleuser@gmail.com");
    expect(googleSession.user.identities).toEqual([{ provider: "google" }]);
    expect(store.getProfileById(googleSession.user.id)).toBeNull();

    // Google user claims username and sets optional/initial password
    const afterPassword = await store.updatePassword(googleSession.user.id, "MyNewPass123!");
    expect(afterPassword.user.identities.map((i) => i.provider)).toEqual(["google", "email"]);
    const createdProfile = store.createProfile(googleSession.user.id, "janedoe");
    expect(createdProfile.username).toBe("janedoe");
    expect(createdProfile.display_name).toBe("New Google User");

    // Email user created through verified flow (register-pending + confirm-email) CAN link with Google
    await store.createPendingSignup({
      email: "verified@gmail.com",
      password: "Password123!",
      username: "verifieduser",
    });
    const verifiedEmailUser = store.completeVerifiedEmailSignup({
      email: "verified@gmail.com",
    });
    const linkedSession = store.loginWithGoogle({
      uid: "google-uid-verified",
      email: "verified@gmail.com",
    });
    expect(linkedSession.user.id).toBe(verifiedEmailUser.user.id);
    expect(linkedSession.user.identities.map((i) => i.provider)).toEqual(["email", "google"]);

    // Email user NOT created through verified flow MUST NOT be linked by email
    const unverifiedUser = await store.signUp({
      email: "unverified@gmail.com",
      password: "Password123!",
      username: "unverifieduser",
    });
    let unverifiedLinkErr: unknown;
    try {
      store.loginWithGoogle({
        uid: "google-uid-attacker",
        email: "unverified@gmail.com",
      });
    } catch (err) {
      unverifiedLinkErr = err;
    }
    expect(unverifiedLinkErr).toBeInstanceOf(StoreError);
    expect((unverifiedLinkErr as StoreError).code).toBe("email_not_verified");
    expect((unverifiedLinkErr as StoreError).status).toBe(409);

    // Also refuse linking a legacy StoredUser lacking emailVerified: true on disk
    await store.flush();
    const dbPath = path.join(tmpDir, "db.json");
    const rawDb = JSON.parse(fs.readFileSync(dbPath, "utf8")) as {
      users: Array<Record<string, unknown>>;
    };
    const googleRec = rawDb.users.find((u) => u["id"] === googleSession.user.id);
    const verifiedRec = rawDb.users.find((u) => u["id"] === verifiedEmailUser.user.id);
    const unverifiedRec = rawDb.users.find((u) => u["id"] === unverifiedUser.user.id);
    expect(googleRec?.["emailVerified"]).toBe(true);
    expect(verifiedRec?.["emailVerified"]).toBe(true);
    expect(unverifiedRec?.["emailVerified"]).toBe(false);
    expect(unverifiedRec?.["googleUid"]).toBeUndefined();
    expect(unverifiedRec?.["providers"]).toEqual(["email"]);

    rawDb.users.push({
      id: "legacy-user-1",
      email: "legacy@gmail.com",
      passwordHash: await hashPassword("LegacyPass123!"),
      providers: ["email"],
      createdAt: new Date().toISOString(),
    });
    fs.writeFileSync(dbPath, JSON.stringify(rawDb, null, 2), "utf8");

    const reloaded = new TinkiStore(tmpDir);
    try {
      let legacyErr: unknown;
      try {
        reloaded.loginWithGoogle({
          uid: "google-uid-legacy-attempt",
          email: "legacy@gmail.com",
        });
      } catch (err) {
        legacyErr = err;
      }
      expect(legacyErr).toBeInstanceOf(StoreError);
      expect((legacyErr as StoreError).code).toBe("email_not_verified");
      expect((legacyErr as StoreError).status).toBe(409);
    } finally {
      reloaded.dispose();
    }
  });

  it("signs up, enforces unique email/username, logs in, and persists across restarts", async () => {
    const created = await store.signUp({
      email: "Alex@Example.com",
      password: "Password123!",
      username: "alex99",
    });
    expect(created.user.email).toBe("alex@example.com");
    expect(store.isUsernameAvailable("alex99")).toBe(false);
    expect(store.isUsernameAvailable("newname")).toBe(true);
    expect(store.isUsernameAvailable("dashboard")).toBe(false);

    await expect(
      store.signUp({ email: "alex@example.com", password: "Password123!", username: "other" }),
    ).rejects.toThrow(/already registered/i);
    await expect(
      store.signUp({ email: "other@example.com", password: "Password123!", username: "alex99" }),
    ).rejects.toThrow(/already taken/i);

    const loggedIn = await store.login({ email: "ALEX@EXAMPLE.COM", password: "Password123!" });
    expect(loggedIn.user.id).toBe(created.user.id);
    await expect(
      store.login({ email: "alex@example.com", password: "WrongPassword" }),
    ).rejects.toThrow(/invalid login/i);

    // Reload from disk in a fresh store instance
    await store.flush();
    const reloaded = new TinkiStore(tmpDir);
    try {
      const verified = reloaded.verifySessionToken(loggedIn.access_token);
      expect(verified).toBeTruthy();
      expect(verified?.id).toBe(created.user.id);
      expect(reloaded.getProfileByUsername("alex99")?.id).toBe(created.user.id);
    } finally {
      reloaded.dispose();
    }
  });

  it("validates pending signup candidates without reserving usernames prematurely", async () => {
    store.validatePendingSignupCandidate({
      email: "Fresh@Example.com",
      username: "freshuser",
    });
    expect(store.isUsernameAvailable("freshuser")).toBe(true);

    await store.signUp({
      email: "taken@example.com",
      password: "Password123!",
      username: "takenuser",
    });
    expect(() =>
      store.validatePendingSignupCandidate({
        email: "taken@example.com",
        username: "newname",
      }),
    ).toThrow(/already registered/i);
    expect(() =>
      store.validatePendingSignupCandidate({
        email: "other@example.com",
        username: "takenuser",
      }),
    ).toThrow(/already taken/i);
  });

  it("reserves pending email signups until verified and activates the profile on confirmation", async () => {
    const pending = await store.createPendingSignup({
      email: "VerifyMe@Example.com",
      password: "Password123!",
      username: "verifyme",
    });
    expect(pending.email).toBe("verifyme@example.com");
    expect(pending.username).toBe("verifyme");

    // Profile and active login are NOT created until email is confirmed
    expect(store.getProfileByUsername("verifyme")).toBeNull();
    await expect(
      store.login({ email: "verifyme@example.com", password: "Password123!" }),
    ).rejects.toThrow(/invalid login/i);

    // Another user cannot steal the reserved username while pending, but same email can retry
    expect(store.isUsernameAvailable("verifyme")).toBe(false);
    expect(store.isUsernameAvailable("verifyme", "verifyme@example.com")).toBe(true);
    expect(
      await store.getPendingSignupCredentialsMatch("verifyme@example.com", "Password123!"),
    ).toBeTruthy();
    expect(
      await store.getPendingSignupCredentialsMatch("verifyme@example.com", "WrongPass"),
    ).toBeNull();

    // Confirming email promotes pending signup into real user + profile
    const session = store.completeVerifiedEmailSignup({ email: "verifyme@example.com" });
    expect(session.user.email).toBe("verifyme@example.com");
    expect(session.user.user_metadata.username).toBe("verifyme");
    expect(store.getProfileByUsername("verifyme")?.id).toBe(session.user.id);
    expect(
      await store.getPendingSignupCredentialsMatch("verifyme@example.com", "Password123!"),
    ).toBeNull();

    // Subsequent password login works and repeat confirmation call is idempotent
    expect(
      (await store.login({ email: "verifyme@example.com", password: "Password123!" })).user.id,
    ).toBe(session.user.id);
    expect(store.completeVerifiedEmailSignup({ email: "verifyme@example.com" }).user.id).toBe(
      session.user.id,
    );
  });

  it("supports password update and single-use password reset tokens", async () => {
    const session = await store.signUp({
      email: "reset@example.com",
      password: "OldPassword1!",
      username: "resetuser",
    });

    await expect(
      store.updatePassword(session.user.id, "NewPassword1!", "WrongOld"),
    ).rejects.toThrow(/current password is incorrect/i);
    await store.updatePassword(session.user.id, "NewPassword1!", "OldPassword1!");
    expect(
      await store.login({ email: "reset@example.com", password: "NewPassword1!" }),
    ).toBeTruthy();

    const staleReset = store.createPasswordReset("reset@example.com");
    const reset = store.createPasswordReset("reset@example.com");
    if (!staleReset?.token || !reset?.token) {
      throw new Error("Expected password reset tokens to be generated");
    }
    expect(staleReset.token).not.toBe(reset.token);
    await expect(store.consumePasswordReset(staleReset.token, "StaleAttempt1!")).rejects.toThrow(
      /expired or is invalid/i,
    );

    const newSession = await store.consumePasswordReset(reset.token, "ResetPass99!");
    expect(newSession.user.id).toBe(session.user.id);

    // Token is single-use
    await expect(store.consumePasswordReset(reset.token, "AnotherPass1!")).rejects.toThrow(
      /expired or is invalid/i,
    );
    expect(
      await store.login({ email: "reset@example.com", password: "ResetPass99!" }),
    ).toBeTruthy();
  });

  it("manages profile fields, custom links CRUD + reorder, analytics, media, and account deletion", async () => {
    const session = await store.signUp({
      email: "creator@example.com",
      password: "Password123!",
      username: "creator",
    });

    const updated = store.updateProfile(session.user.id, {
      display_name: "Creator One",
      bio: "Design & Code",
      github_url: "https://github.com/creator",
    });
    expect(updated.display_name).toBe("Creator One");
    expect(updated.github_url).toBe("https://github.com/creator");

    const linkA = store.createCustomLink(session.user.id, {
      name: "Portfolio",
      url: "https://creator.dev",
      icon: "portfolio",
      link_type: "link",
    });
    const linkB = store.createCustomLink(session.user.id, {
      name: "Email",
      url: "mailto:hi@creator.dev",
      icon: "email",
      link_type: "email",
    });
    expect(store.listCustomLinks(session.user.id)).toHaveLength(2);

    store.reorderCustomLinks(session.user.id, session.user.id, [linkB.id, linkA.id]);
    const reordered = store.listCustomLinks(session.user.id);
    expect(reordered.map((l) => l.id)).toEqual([linkB.id, linkA.id]);

    // Owner's own view is ignored; visitor's view and clicks are counted
    store.recordEvent(session.user.id, {
      profile_id: session.user.id,
      event_type: "profile_view",
      visitor_id: "owner",
    });
    store.recordEvent(null, {
      profile_id: session.user.id,
      event_type: "profile_view",
      visitor_id: "v1",
      country: "US",
    });
    store.recordEvent(null, {
      profile_id: session.user.id,
      event_type: "social_click",
      platform: "github",
      visitor_id: "v1",
    });
    store.recordEvent(null, {
      profile_id: session.user.id,
      event_type: "custom_link_click",
      custom_link_id: linkA.id,
      visitor_id: "v1",
    });

    const stats = store.getAnalytics(session.user.id, session.user.id);
    expect(stats.views).toBe(1);
    expect(stats.clicks).toBe(1);
    expect(stats.customLinkClicks).toBe(1);
    expect(stats.byCountry["US"]).toBe(1);

    // Media upload & read
    const mediaPath = `${session.user.id}/avatar.png`;
    const validPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    store.saveMediaFile(session.user.id, "avatars", mediaPath, validPng, "image/png");
    const file = store.readMediaFile("avatars", mediaPath);
    expect(file).toBeTruthy();
    expect(file?.contentType).toBe("image/png");

    // Session token revocation on logout & account deletion across restarts
    const beforeLogoutSession = await store.login({
      email: "creator@example.com",
      password: "Password123!",
    });
    expect(store.verifySessionToken(beforeLogoutSession.access_token)).toBeTruthy();
    expect(store.revokeUserTokens(session.user.id)).toBe(true);
    expect(store.verifySessionToken(beforeLogoutSession.access_token)).toBeNull();

    const activeBeforeDelete = await store.login({
      email: "creator@example.com",
      password: "Password123!",
    });
    expect(store.verifySessionToken(activeBeforeDelete.access_token)).toBeTruthy();

    // Delete account verifies password & username and removes data + media
    await expect(store.deleteAccount(session.user.id, "creator", "WrongPassword")).rejects.toThrow(
      /current password is incorrect/i,
    );
    await store.deleteAccount(session.user.id, "creator", "Password123!");
    await store.flush();
    expect(store.verifySessionToken(activeBeforeDelete.access_token)).toBeNull();
    const reloadedAfterDelete = new TinkiStore(tmpDir);
    try {
      expect(reloadedAfterDelete.verifySessionToken(activeBeforeDelete.access_token)).toBeNull();
    } finally {
      reloadedAfterDelete.dispose();
    }
    expect(store.getProfileById(session.user.id)).toBeNull();
    expect(store.readMediaFile("avatars", mediaPath)).toBeNull();
    expect(store.isUsernameAvailable("creator")).toBe(true);
  });

  it("only seeds demo@tinki.app when NODE_ENV !== 'production' and SEED_DEMO=true and cleans up on startup otherwise", async () => {
    const prevNodeEnv = process.env["NODE_ENV"];
    const prevSeedDemo = process.env["SEED_DEMO"];
    const prevSecret = process.env["AUTH_SECRET"];
    const demoDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-demo-node-"));
    let seeded: TinkiStore | undefined;
    let cleaned: TinkiStore | undefined;
    let prodStore: TinkiStore | undefined;
    try {
      // Disabled by default
      expect(store.getProfileByUsername("sara")).toBeNull();

      // Enabled in non-production when SEED_DEMO=true
      process.env["NODE_ENV"] = "development";
      process.env["SEED_DEMO"] = "true";
      seeded = new TinkiStore(demoDir);
      expect(seeded.getProfileByUsername("sara")?.username).toBe("sara");
      await seeded.flush();

      // Cleaned up when SEED_DEMO is unset
      delete process.env["SEED_DEMO"];
      cleaned = new TinkiStore(demoDir);
      expect(cleaned.getProfileByUsername("sara")).toBeNull();
      await expect(
        cleaned.login({ email: "demo@tinki.app", password: "DemoPass123!" }),
      ).rejects.toThrow(/invalid login/i);
      await cleaned.flush();

      // Never seeded in production even with SEED_DEMO=true
      process.env["NODE_ENV"] = "production";
      process.env["SEED_DEMO"] = "true";
      process.env["AUTH_SECRET"] = "test-production-secret-at-least-32-chars";
      prodStore = new TinkiStore(demoDir);
      expect(prodStore.getProfileByUsername("sara")).toBeNull();
    } finally {
      seeded?.dispose();
      cleaned?.dispose();
      prodStore?.dispose();
      if (prevNodeEnv === undefined) delete process.env["NODE_ENV"];
      else process.env["NODE_ENV"] = prevNodeEnv;
      if (prevSeedDemo === undefined) delete process.env["SEED_DEMO"];
      else process.env["SEED_DEMO"] = prevSeedDemo;
      if (prevSecret === undefined) delete process.env["AUTH_SECRET"];
      else process.env["AUTH_SECRET"] = prevSecret;
      fs.rmSync(demoDir, { recursive: true, force: true });
    }
  });
});
