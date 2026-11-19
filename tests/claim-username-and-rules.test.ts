import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import { requiresInitialPasswordSetup } from "../src/lib/account-helpers";
import {
  BG_TYPES,
  FONT_FAMILIES,
  FONT_STYLES,
  IMAGE_MODES,
  MEDIA_TYPES,
  QR_ERROR_CORRECTIONS,
  QR_EYE_SHAPES,
  QR_MODULE_SHAPES,
  buildCreateProfilePayload,
  buildUsernameClaimPayload,
  optStr,
  truncateUtf8,
  utf8ByteLength,
} from "../src/lib/firestore-payloads";
import type { Profile } from "../src/lib/profiles";
import { RESERVED_USERNAMES } from "../src/lib/profile-validation";
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
    const usernamesBlock =
      rules.match(/match \/usernames\/\{username\}[\s\S]*?\n {4}\}/)?.[0] ?? "";
    const profilesBlock = rules.match(/match \/profiles\/\{profileId\}[\s\S]*?\n {4}\}/)?.[0] ?? "";

    assert.ok(usernamesBlock.includes("allow create:"));
    assert.equal(usernamesBlock.includes("documents/profiles/"), false);
    assert.ok(
      profilesBlock.includes(
        "exists(/databases/$(database)/documents/usernames/$(incoming().username))",
      ),
    );
    assert.ok(
      profilesBlock.includes(
        "get(/databases/$(database)/documents/usernames/$(incoming().username)).data.owner_id == request.auth.uid",
      ),
    );
    assert.ok(
      profilesBlock.includes(
        "existsAfter(/databases/$(database)/documents/usernames/$(incoming().username))",
      ),
    );
    assert.ok(
      profilesBlock.includes(
        "getAfter(/databases/$(database)/documents/usernames/$(incoming().username)).data.owner_id == request.auth.uid",
      ),
    );
    assert.ok(
      !rules.includes("\\-"),
      "regex character classes should not unnecessarily escape '-'",
    );
  });

  it("buildCreateProfilePayload and buildUsernameClaimPayload satisfy every key and condition in firestore.rules", () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf8");
    const profFn = rules.match(/function isValidProfile\(data, profileId\)[\s\S]*?\n {4}\}/)?.[0];
    assert.ok(profFn, "isValidProfile must exist in firestore.rules");

    const hasAllMatch = profFn.match(/data\.keys\(\)\.hasAll\(\[([\s\S]*?)\]\)/);
    const hasOnlyMatch = profFn.match(/data\.keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
    assert.ok(hasAllMatch && hasOnlyMatch);

    const hasAllKeys = Array.from(hasAllMatch[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
    const hasOnlyKeys = Array.from(hasOnlyMatch[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
    assert.deepEqual([...hasAllKeys].sort(), [...hasOnlyKeys].sort());

    const unameFn = rules.match(
      /function isValidUsernameClaim\(data, username\)[\s\S]*?\n {4}\}/,
    )?.[0];
    assert.ok(unameFn, "isValidUsernameClaim must exist in firestore.rules");
    const unameOnlyMatch = unameFn.match(/data\.keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
    assert.ok(unameOnlyMatch);
    const unameKeys = Array.from(unameOnlyMatch[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);

    const uid = "FirebaseUid_Abc123XYZ789";
    const username = "creator_01";
    const ts = { seconds: 1700000000, nanoseconds: 0 };

    const unamePayload = buildUsernameClaimPayload({
      username,
      ownerId: uid,
      createdAt: ts,
    });
    assert.deepEqual(Object.keys(unamePayload).sort(), [...unameKeys].sort());
    assert.equal(unamePayload.username, username);
    assert.equal(unamePayload.owner_id, uid);
    assert.equal(RESERVED_USERNAMES.has(unamePayload.username), false);

    const profilePayload = buildCreateProfilePayload({
      uid,
      username,
      displayName: "Creator Name",
      createdAt: ts,
      updatedAt: ts,
    });

    assert.deepEqual(Object.keys(profilePayload).sort(), [...hasOnlyKeys].sort());
    assert.equal(profilePayload["id"], uid);
    assert.equal(profilePayload["username"], username);
    assert.equal(profilePayload["verified"], false);
    assert.ok(
      (BG_TYPES as readonly string[]).includes(String(profilePayload["card_background_type"])),
    );
    assert.ok(
      (BG_TYPES as readonly string[]).includes(String(profilePayload["page_background_type"])),
    );
    assert.ok(
      (IMAGE_MODES as readonly string[]).includes(
        String(profilePayload["page_background_image_mode"]),
      ),
    );
    assert.ok(
      (MEDIA_TYPES as readonly string[]).includes(
        String(profilePayload["page_background_media_type"]),
      ),
    );
    assert.ok(
      (FONT_FAMILIES as readonly string[]).includes(String(profilePayload["name_font_family"])),
    );
    assert.ok(
      (FONT_FAMILIES as readonly string[]).includes(String(profilePayload["bio_font_family"])),
    );
    assert.ok(
      (FONT_STYLES as readonly string[]).includes(String(profilePayload["name_font_style"])),
    );
    assert.ok(
      (FONT_STYLES as readonly string[]).includes(String(profilePayload["bio_font_style"])),
    );
    assert.ok(
      (QR_ERROR_CORRECTIONS as readonly string[]).includes(
        String(profilePayload["qr_error_correction"]),
      ),
    );
    assert.ok(
      (QR_MODULE_SHAPES as readonly string[]).includes(String(profilePayload["qr_module_shape"])),
    );
    assert.ok(
      (QR_EYE_SHAPES as readonly string[]).includes(String(profilePayload["qr_eye_shape"])),
    );
    assert.match(String(profilePayload["card_background_color"]), /^#[0-9a-fA-F]{6}$/);
    assert.match(String(profilePayload["page_background_color"]), /^#[0-9a-fA-F]{6}$/);
    assert.match(String(profilePayload["qr_foreground_color"]), /^#[0-9a-fA-F]{6}$/);
    assert.match(String(profilePayload["qr_background_color"]), /^#[0-9a-fA-F]{6}$/);
  });

  it("buildCreateProfilePayload strips ghost fields, blocks verified forgery, and truncates multi-byte UTF-8 strings within Firestore byte limits", () => {
    const uid = "FirebaseUid_Abc123XYZ789";
    const ts = { seconds: 1700000000, nanoseconds: 0 };
    const arabicAndEmojiName = "محمد ".repeat(15) + "🚀🔥✨".repeat(10);

    assert.ok(utf8ByteLength(arabicAndEmojiName) > 80);
    const truncated = truncateUtf8(arabicAndEmojiName, 80);
    assert.ok(utf8ByteLength(truncated) <= 80);
    assert.ok(utf8ByteLength(optStr(arabicAndEmojiName, 80) ?? "") <= 80);

    const maliciousSeed = {
      extra_ghost_field: "should-be-stripped",
      verified: true,
      card_background_type: "invalid_bg" as Profile["card_background_type"],
      page_background_image_mode: null as unknown as Profile["page_background_image_mode"],
      page_background_use_image: null as unknown as boolean,
      page_background_media_type: "audio" as unknown as Profile["page_background_media_type"],
      name_font_family: "comic_sans" as Profile["name_font_family"],
      name_font_weight: 9999,
      name_font_style: "oblique" as Profile["name_font_style"],
      bio_font_family: null as unknown as Profile["bio_font_family"],
      bio_font_weight: -50,
      bio_font_style: null as unknown as Profile["bio_font_style"],
      qr_error_correction: "Z",
      qr_module_shape: "hexagon",
      qr_eye_shape: "triangle",
      qr_margin: 99,
      bio: "🚀".repeat(25),
    } as Partial<Profile> & Record<string, unknown>;

    const payload = buildCreateProfilePayload({
      uid,
      username: "regular_user",
      displayName: arabicAndEmojiName,
      seed: maliciousSeed,
      createdAt: ts,
      updatedAt: ts,
    });

    assert.equal("extra_ghost_field" in payload, false);
    assert.equal(payload["verified"], false);
    assert.equal(payload["card_background_type"], "default");
    assert.equal(payload["page_background_image_mode"], "cover");
    assert.equal(payload["page_background_use_image"], false);
    assert.equal(payload["page_background_media_type"], "image");
    assert.equal(payload["name_font_family"], "display");
    assert.equal(payload["name_font_weight"], 900);
    assert.equal(payload["name_font_style"], "normal");
    assert.equal(payload["bio_font_family"], "sans");
    assert.equal(payload["bio_font_weight"], 100);
    assert.equal(payload["bio_font_style"], "normal");
    assert.equal(payload["qr_error_correction"], "M");
    assert.equal(payload["qr_module_shape"], "square");
    assert.equal(payload["qr_eye_shape"], "square");
    assert.equal(payload["qr_margin"], 10);
    assert.ok(utf8ByteLength(String(payload["display_name"] ?? "")) <= 80);
    assert.ok(utf8ByteLength(String(payload["bio"] ?? "")) <= 50);
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
