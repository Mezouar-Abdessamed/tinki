import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import { handleApiOrMediaRequest } from "../src/server/api-router.server";
import { mediaDocIdFromPath } from "../src/server/firestore-public-rest.server";
import { TinkiStore } from "../src/server/local-fallback-store.server";
import { isBackgroundStoragePath } from "../src/lib/profiles";

describe("Firestore security specification & cross-restart session persistence", () => {
  it("keeps firestore.rules compliant with all security invariants and blueprint collections", () => {
    const blueprint = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "firebase-blueprint.json"), "utf8"),
    ) as {
      entities: Record<string, { properties: Record<string, { maxLength?: number; pattern?: string }> }>;
      firestore: Record<string, { schema: string }>;
    };
    const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");

    assert.match(rules, /match \/{document=\*\*}\s*\{\s*allow read, write: if false;\s*\}/);

    for (const collectionPath of Object.keys(blueprint.firestore)) {
      const topSegment = collectionPath.split("/").filter(Boolean)[0];
      assert.ok(topSegment, `Invalid path: ${collectionPath}`);
      assert.ok(
        rules.includes(`match /${topSegment}/`),
        `firestore.rules missing match block for collection /${topSegment}/`,
      );
    }

    assert.match(
      rules,
      /match \/accounts\/\{userId\}[\s\S]*allow get:\s*if isValidId\(userId\) && isOwner\(userId\);/,
    );
    assert.match(rules, /match \/accounts\/\{userId\}[\s\S]*allow list:\s*if false;/);

    assert.ok(rules.includes("data.verified == (data.username == 'abdessamed')"));
    assert.ok(rules.includes("request.auth.token.email_verified == true"));
    assert.ok(rules.includes("affectedKeys().hasOnly"));
    assert.ok(rules.includes("isOptString(data.bio, 50)"));
    assert.ok(rules.includes("resource.data.profile_id == request.auth.uid"));
    assert.ok(rules.includes("request.auth == null || request.auth.uid != incoming().profile_id"));
    assert.ok(
      rules.includes("existsAfter(/databases/$(database)/documents/usernames/$(incoming().username))"),
    );
    const usernamesMatch = rules.match(/match \/usernames\/\{username\}[\s\S]*?\n {4}\}/);
    assert.ok(usernamesMatch, "Expected match /usernames/{username} block");
    assert.ok(
      !usernamesMatch[0].includes("documents/profiles/"),
      "usernames/{username} must not circularly reference profiles via existsAfter/getAfter",
    );
    assert.ok(rules.includes("data.object_path.split('/')[0] == request.auth.uid"));
    assert.ok(rules.includes("'classy'") && rules.includes("'diamond'") && rules.includes("'leaf'"));
  });

  it("validates deterministic media IDs and Firebase UID background storage paths", () => {
    const firebaseUid = "TestFirebaseUid9999999999";
    const bgPath = `${firebaseUid}/550e8400-e29b-41d4-a716-446655440000.jpg`;
    assert.equal(isBackgroundStoragePath(bgPath), true);
    assert.equal(isBackgroundStoragePath(`../${firebaseUid}/evil.jpg`), false);
    assert.equal(
      mediaDocIdFromPath("avatars", `${firebaseUid}/avatar.webp`),
      `avatars__${firebaseUid}__avatar_webp`,
    );
  });

  it("verifies signed session tokens across persisted restarts and rejects unknown users on wiped db", async () => {
    const tmpDirA = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-persist-a-"));
    const tmpDirB = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-persist-b-"));
    try {
      const prevSecret = process.env["AUTH_SECRET"];
      process.env["AUTH_SECRET"] = "deterministic-test-secret-for-restart";
      try {
        const storeA = new TinkiStore(tmpDirA);
        const session = storeA.loginWithGoogle({
          uid: "TestGoogleUid12345",
          email: "persistent@example.com",
          name: "Persistent User",
        });
        assert.equal(session.user.id, "TestGoogleUid12345");
        await storeA.flush();

        const storeReloaded = new TinkiStore(tmpDirA);
        const restoredUser = storeReloaded.verifySessionToken(session.access_token);
        assert.ok(restoredUser);
        assert.equal(restoredUser.id, "TestGoogleUid12345");
        assert.equal(restoredUser.email, "persistent@example.com");

        const storeWiped = new TinkiStore(tmpDirB);
        assert.equal(storeWiped.verifySessionToken(session.access_token), null);
      } finally {
        if (prevSecret === undefined) delete process.env["AUTH_SECRET"];
        else process.env["AUTH_SECRET"] = prevSecret;
      }
    } finally {
      fs.rmSync(tmpDirA, { recursive: true, force: true });
      fs.rmSync(tmpDirB, { recursive: true, force: true });
    }
  });

  it("issues SameSite=Lax; Secure 7-day cookies on HTTPS/forwarded and production requests without trusting Origin or Referer", async () => {
    const httpsReq = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        "x-forwarded-proto": "https",
        "content-type": "application/json",
      },
      body: "{}",
    });
    const httpsRes = await handleApiOrMediaRequest(httpsReq);
    assert.ok(httpsRes);
    const httpsCookie = httpsRes.headers.get("set-cookie") ?? "";
    assert.match(httpsCookie, /SameSite=Lax;\s*Secure/i);
    assert.match(httpsCookie, /HttpOnly/i);
    assert.doesNotMatch(httpsCookie, /SameSite=None|Partitioned/i);

    // Spoofed Origin/Referer on plain HTTP must NOT cause Secure to be set in development
    const spoofedHttpReq = new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        referer: "https://localhost:3000/dashboard",
        "content-type": "application/json",
      },
      body: "{}",
    });
    const spoofedHttpRes = await handleApiOrMediaRequest(spoofedHttpReq);
    assert.ok(spoofedHttpRes);
    const spoofedCookie = spoofedHttpRes.headers.get("set-cookie") ?? "";
    assert.match(spoofedCookie, /SameSite=Lax/i);
    assert.doesNotMatch(spoofedCookie, /;\s*Secure\b/i);
  });
});
