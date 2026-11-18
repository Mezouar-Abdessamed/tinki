import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import { requiresInitialPasswordSetup } from "../src/lib/account-helpers";
import { handleApiOrMediaRequest } from "../src/server/api-router.server";
import { TinkiStore } from "../src/server/local-fallback-store.server";

describe("ClaimUsername flow & non-circular Firestore rules", () => {
  it("requiresInitialPasswordSetup returns true only for social accounts without an email password", () => {
    assert.equal(requiresInitialPasswordSetup({ identities: [{ provider: "google" }] }), true);
    assert.equal(
      requiresInitialPasswordSetup({
        identities: [{ provider: "google" }, { provider: "email" }],
      }),
      false,
    );
    assert.equal(requiresInitialPasswordSetup({ identities: [{ provider: "email" }] }), false);
    assert.equal(requiresInitialPasswordSetup({ identities: [] }), false);
    assert.equal(requiresInitialPasswordSetup(null), false);
  });

  it("ClaimUsernameForm calls createMyProfile before authApi.updatePassword so failed claims do not lock password state", () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/dashboard/ClaimUsernameForm.tsx"),
      "utf8",
    );
    const createIdx = src.indexOf("await createMyProfile(parsed.data)");
    const updatePwIdx = src.indexOf("await authApi.updatePassword({ password })");
    assert.ok(createIdx !== -1 && updatePwIdx !== -1);
    assert.ok(
      createIdx < updatePwIdx,
      "createMyProfile must execute before authApi.updatePassword",
    );
  });

  it("firestore.rules breaks circular existsAfter between usernames and profiles while keeping one-way atomicity", () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
    const usernamesBlock = rules.match(/match \/usernames\/\{username\}[\s\S]*?\n {4}\}/)?.[0] ?? "";
    const profilesBlock = rules.match(/match \/profiles\/\{profileId\}[\s\S]*?\n {4}\}/)?.[0] ?? "";

    assert.ok(usernamesBlock.includes("allow create:"));
    assert.equal(usernamesBlock.includes("documents/profiles/"), false);
    assert.ok(
      profilesBlock.includes("existsAfter(/databases/$(database)/documents/usernames/$(incoming().username))"),
    );
  });

  it("TinkiStore.updatePassword persists across restarts on shared data dir and rejects unknown users on wiped dir", async () => {
    const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-pw-a-"));
    const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-pw-b-"));
    const prevSecret = process.env["AUTH_SECRET"];
    process.env["AUTH_SECRET"] = "test-secret-across-restarts-1234";
    try {
      const storeA = new TinkiStore(tmpA);
      let storeWiped: TinkiStore | undefined;
      let storeRestarted: TinkiStore | undefined;
      try {
        const initialSession = storeA.loginWithGoogle({
          uid: "GoogleUidAfterRestart1",
          email: "creator@example.com",
          name: "Creator",
        });
        assert.equal(requiresInitialPasswordSetup(initialSession.user), true);
        await storeA.flush();

        storeWiped = new TinkiStore(tmpB);
        assert.equal(storeWiped.verifySessionToken(initialSession.access_token), null);
        await assert.rejects(
          () => storeWiped!.updatePassword(initialSession.user.id, "StrongPass123!"),
          /User not found/i,
        );

        storeRestarted = new TinkiStore(tmpA);
        const verifiedUser = storeRestarted.verifySessionToken(initialSession.access_token);
        assert.ok(verifiedUser);

        const updated = await storeRestarted.updatePassword(verifiedUser.id, "StrongPass123!");
        assert.equal(requiresInitialPasswordSetup(updated.user), false);
        assert.ok(updated.user.identities.some((i) => i.provider === "email"));
        assert.ok(updated.user.identities.some((i) => i.provider === "google"));
        assert.equal(storeRestarted.verifySessionToken(initialSession.access_token), null);

        await assert.rejects(
          () => storeRestarted!.updatePassword(verifiedUser.id, "AnotherPass123!"),
          /current password is incorrect/i,
        );
        const changed = await storeRestarted.updatePassword(
          verifiedUser.id,
          "AnotherPass123!",
          "StrongPass123!",
        );
        assert.ok(changed.access_token);
        assert.equal(storeRestarted.verifySessionToken(updated.access_token), null);
        assert.ok(storeRestarted.verifySessionToken(changed.access_token));
      } finally {
        storeA.dispose();
        storeWiped?.dispose();
        storeRestarted?.dispose();
      }
    } finally {
      if (prevSecret === undefined) delete process.env["AUTH_SECRET"];
      else process.env["AUTH_SECRET"] = prevSecret;
      fs.rmSync(tmpA, { recursive: true, force: true });
      fs.rmSync(tmpB, { recursive: true, force: true });
    }
  });

  it("handles /api/auth/session cleanly when unauthenticated", async () => {
    const res = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/session", { method: "GET" }),
    );
    assert.ok(res);
    assert.equal(res.status, 200);
  });
});
