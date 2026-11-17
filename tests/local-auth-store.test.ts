import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { verifyFirebaseIdToken } from "../src/server/firebase-token-verifier.server";
import { TinkiStore, hashPassword, verifyPassword } from "../src/server/local-fallback-store.server";

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
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("hashes and verifies passwords with timing-safe scrypt comparison", () => {
    const hash = hashPassword("MySecretPass123!");
    assert.equal(verifyPassword("MySecretPass123!", hash), true);
    assert.equal(verifyPassword("WrongPassword", hash), false);
    assert.equal(verifyPassword("anything", "malformed"), false);
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
    assert.equal(claims.uid, "google-uid-123");
    assert.equal(claims.email, "jane.doe@gmail.com");
    assert.equal(claims.name, "Jane Doe");

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
    await assert.rejects(
      () => verifyFirebaseIdToken(expiredToken, { projectId: "test-project", nowSeconds: now, getJwks }),
      /expired/i,
    );

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
    await assert.rejects(
      () => verifyFirebaseIdToken(wrongAudToken, { projectId: "test-project", nowSeconds: now, getJwks }),
      /does not match/i,
    );
  });

  it("signs in with Google, supports claiming username + setting password, and links existing email users", () => {
    const googleSession = store.loginWithGoogle({
      uid: "google-uid-abc",
      email: "NewGoogleUser@gmail.com",
      name: "New Google User",
    });
    assert.equal(googleSession.user.email, "newgoogleuser@gmail.com");
    assert.deepEqual(googleSession.user.identities, [{ provider: "google" }]);
    assert.equal(store.getProfileById(googleSession.user.id), null);

    // Google user claims username and sets optional/initial password
    const afterPassword = store.updatePassword(googleSession.user.id, "MyNewPass123!");
    assert.deepEqual(
      afterPassword.user.identities.map((i) => i.provider),
      ["google", "email"],
    );
    const createdProfile = store.createProfile(googleSession.user.id, "janedoe");
    assert.equal(createdProfile.username, "janedoe");
    assert.equal(createdProfile.display_name, "New Google User");

    // Existing email user later signs in with Google on same verified email
    const emailUser = store.signUp({
      email: "existing@gmail.com",
      password: "Password123!",
      username: "existinguser",
    });
    const linkedSession = store.loginWithGoogle({
      uid: "google-uid-existing",
      email: "existing@gmail.com",
    });
    assert.equal(linkedSession.user.id, emailUser.user.id);
    assert.deepEqual(
      linkedSession.user.identities.map((i) => i.provider),
      ["email", "google"],
    );
  });

  it("signs up, enforces unique email/username, logs in, and persists across restarts", () => {
    const created = store.signUp({
      email: "Alex@Example.com",
      password: "Password123!",
      username: "alex99",
    });
    assert.equal(created.user.email, "alex@example.com");
    assert.equal(store.isUsernameAvailable("alex99"), false);
    assert.equal(store.isUsernameAvailable("newname"), true);
    assert.equal(store.isUsernameAvailable("dashboard"), false);

    assert.throws(
      () =>
        store.signUp({ email: "alex@example.com", password: "Password123!", username: "other" }),
      /already registered/i,
    );
    assert.throws(
      () =>
        store.signUp({ email: "other@example.com", password: "Password123!", username: "alex99" }),
      /already taken/i,
    );

    const loggedIn = store.login({ email: "ALEX@EXAMPLE.COM", password: "Password123!" });
    assert.equal(loggedIn.user.id, created.user.id);
    assert.throws(
      () => store.login({ email: "alex@example.com", password: "WrongPassword" }),
      /invalid login/i,
    );

    // Reload from disk in a fresh store instance
    const reloaded = new TinkiStore(tmpDir);
    const verified = reloaded.verifySessionToken(loggedIn.access_token);
    assert.ok(verified);
    assert.equal(verified.id, created.user.id);
    assert.equal(reloaded.getProfileByUsername("alex99")?.id, created.user.id);
  });

  it("validates pending signup candidates without reserving usernames prematurely", () => {
    store.validatePendingSignupCandidate({
      email: "Fresh@Example.com",
      username: "freshuser",
    });
    assert.equal(store.isUsernameAvailable("freshuser"), true);

    store.signUp({
      email: "taken@example.com",
      password: "Password123!",
      username: "takenuser",
    });
    assert.throws(
      () =>
        store.validatePendingSignupCandidate({
          email: "taken@example.com",
          username: "newname",
        }),
      /already registered/i,
    );
    assert.throws(
      () =>
        store.validatePendingSignupCandidate({
          email: "other@example.com",
          username: "takenuser",
        }),
      /already taken/i,
    );
  });

  it("reserves pending email signups until verified and activates the profile on confirmation", () => {
    const pending = store.createPendingSignup({
      email: "VerifyMe@Example.com",
      password: "Password123!",
      username: "verifyme",
    });
    assert.equal(pending.email, "verifyme@example.com");
    assert.equal(pending.username, "verifyme");

    // Profile and active login are NOT created until email is confirmed
    assert.equal(store.getProfileByUsername("verifyme"), null);
    assert.throws(
      () => store.login({ email: "verifyme@example.com", password: "Password123!" }),
      /invalid login/i,
    );

    // Another user cannot steal the reserved username while pending, but same email can retry
    assert.equal(store.isUsernameAvailable("verifyme"), false);
    assert.equal(store.isUsernameAvailable("verifyme", "verifyme@example.com"), true);
    assert.ok(store.getPendingSignupCredentialsMatch("verifyme@example.com", "Password123!"));
    assert.equal(store.getPendingSignupCredentialsMatch("verifyme@example.com", "WrongPass"), null);

    // Confirming email promotes pending signup into real user + profile
    const session = store.completeVerifiedEmailSignup({ email: "verifyme@example.com" });
    assert.equal(session.user.email, "verifyme@example.com");
    assert.equal(session.user.user_metadata.username, "verifyme");
    assert.equal(store.getProfileByUsername("verifyme")?.id, session.user.id);
    assert.equal(store.getPendingSignupCredentialsMatch("verifyme@example.com", "Password123!"), null);

    // Subsequent password login works and repeat confirmation call is idempotent
    assert.equal(
      store.login({ email: "verifyme@example.com", password: "Password123!" }).user.id,
      session.user.id,
    );
    assert.equal(
      store.completeVerifiedEmailSignup({ email: "verifyme@example.com" }).user.id,
      session.user.id,
    );
  });

  it("supports password update and single-use password reset tokens", () => {
    const session = store.signUp({
      email: "reset@example.com",
      password: "OldPassword1!",
      username: "resetuser",
    });

    assert.throws(
      () => store.updatePassword(session.user.id, "NewPassword1!", "WrongOld"),
      /current password is incorrect/i,
    );
    store.updatePassword(session.user.id, "NewPassword1!", "OldPassword1!");
    assert.ok(store.login({ email: "reset@example.com", password: "NewPassword1!" }));

    const reset = store.createPasswordReset("reset@example.com");
    assert.ok(reset?.token);
    const newSession = store.consumePasswordReset(reset.token, "ResetPass99!");
    assert.equal(newSession.user.id, session.user.id);

    // Token is single-use
    assert.throws(
      () => store.consumePasswordReset(reset.token, "AnotherPass1!"),
      /expired or is invalid/i,
    );
    assert.ok(store.login({ email: "reset@example.com", password: "ResetPass99!" }));
  });

  it("manages profile fields, custom links CRUD + reorder, analytics, media, and account deletion", () => {
    const session = store.signUp({
      email: "creator@example.com",
      password: "Password123!",
      username: "creator",
    });

    const updated = store.updateProfile(session.user.id, {
      display_name: "Creator One",
      bio: "Design & Code",
      github_url: "https://github.com/creator",
    });
    assert.equal(updated.display_name, "Creator One");
    assert.equal(updated.github_url, "https://github.com/creator");

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
    assert.equal(store.listCustomLinks(session.user.id).length, 2);

    store.reorderCustomLinks(session.user.id, session.user.id, [linkB.id, linkA.id]);
    const reordered = store.listCustomLinks(session.user.id);
    assert.deepEqual(
      reordered.map((l) => l.id),
      [linkB.id, linkA.id],
    );

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
    assert.equal(stats.views, 1);
    assert.equal(stats.clicks, 1);
    assert.equal(stats.customLinkClicks, 1);
    assert.equal(stats.byCountry["US"], 1);

    // Media upload & read
    const mediaPath = `${session.user.id}/avatar.png`;
    store.saveMediaFile(
      session.user.id,
      "avatars",
      mediaPath,
      Buffer.from("png-bytes"),
      "image/png",
    );
    const file = store.readMediaFile("avatars", mediaPath);
    assert.ok(file);
    assert.equal(file.contentType, "image/png");

    // Delete account verifies password & username and removes data + media
    assert.throws(
      () => store.deleteAccount(session.user.id, "creator", "WrongPassword"),
      /current password is incorrect/i,
    );
    store.deleteAccount(session.user.id, "creator", "Password123!");
    assert.equal(store.getProfileById(session.user.id), null);
    assert.equal(store.readMediaFile("avatars", mediaPath), null);
    assert.equal(store.isUsernameAvailable("creator"), true);
  });
});
