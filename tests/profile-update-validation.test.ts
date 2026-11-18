import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { TinkiStore } from "../src/server/local-fallback-store.server";

describe("Profile update strict Zod validation (updateProfile & PATCH /api/profiles/me)", () => {
  const prevDataDir = process.env["TINKI_DATA_DIR"];
  const prevLocalStore = process.env["ENABLE_LOCAL_STORE"];
  let tmpDir: string;
  let handleApiOrMediaRequest: typeof import("../src/server/api-router.server").handleApiOrMediaRequest;
  let StoreErrorClass: typeof import("../src/server/local-fallback-store.server").StoreError;
  let TinkiStoreClass: typeof import("../src/server/local-fallback-store.server").TinkiStore;
  let usernameCooldownMs: number;
  let store: TinkiStore;
  let aliceId: string;
  let aliceCookie: string;
  let bobId: string;
  let bobCookie: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-profile-val-"));
    process.env["TINKI_DATA_DIR"] = tmpDir;
    process.env["ENABLE_LOCAL_STORE"] = "true";
    vi.resetModules();

    ({ handleApiOrMediaRequest } = await import("../src/server/api-router.server"));
    const mod = await import("../src/server/local-fallback-store.server");
    StoreErrorClass = mod.StoreError;
    TinkiStoreClass = mod.TinkiStore;
    usernameCooldownMs = mod.USERNAME_COOLDOWN_MS;
    store = mod.getStore();

    await store.createPendingSignup({
      email: "alice.val@example.com",
      password: "Password123!",
      username: "aliceval",
    });
    const aliceSession = store.completeVerifiedEmailSignup({ email: "alice.val@example.com" });
    aliceId = aliceSession.user.id;
    aliceCookie = `tinki_session=${encodeURIComponent(aliceSession.access_token)}`;

    await store.createPendingSignup({
      email: "bob.val@example.com",
      password: "Password123!",
      username: "bobval",
    });
    const bobSession = store.completeVerifiedEmailSignup({ email: "bob.val@example.com" });
    bobId = bobSession.user.id;
    bobCookie = `tinki_session=${encodeURIComponent(bobSession.access_token)}`;
  });

  afterAll(() => {
    if (prevDataDir === undefined) delete process.env["TINKI_DATA_DIR"];
    else process.env["TINKI_DATA_DIR"] = prevDataDir;
    if (prevLocalStore === undefined) delete process.env["ENABLE_LOCAL_STORE"];
    else process.env["ENABLE_LOCAL_STORE"] = prevLocalStore;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function patchMe(rawBody: string): Promise<Response> {
    const res = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/profiles/me", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: aliceCookie,
        },
        body: rawBody,
      }),
    );
    expect(res).toBeDefined();
    return res!;
  }

  it("accepts valid editable fields, own media paths, preset background, and https URLs", async () => {
    const validPayload = {
      display_name: "A".repeat(80),
      bio: "B".repeat(50),
      avatar_path: `${aliceId}/avatar-1.webp`,
      cover_photo_path: `${aliceId}/cover-1.jpg`,
      cover_photo_x: 25,
      cover_photo_y: 75,
      show_qr_button: false,
      github_url: "https://github.com/aliceval",
      x_url: "https://x.com/aliceval",
      card_background_type: "linear",
      card_background_color: "#112233",
      card_gradient_color: "#445566",
      card_gradient_angle: 180,
      social_icon_color: "#AABBCC",
      social_icon_bg_color: null,
      page_background_type: "radial",
      page_background_color: "#0A0B0C",
      page_gradient_color: "#1F2E3D",
      page_gradient_angle: 45,
      page_background_use_image: true,
      page_background_image_url: `${aliceId}/bg-photo.png`,
      page_background_image_mode: "repeat",
      page_background_media_type: "image",
      page_background_video_url: `${aliceId}/bg-video.mp4`,
      name_font_family: "serif",
      name_font_weight: 700,
      name_font_style: "italic",
      bio_font_family: "mono",
      bio_font_weight: 400,
      bio_font_style: "normal",
      name_color: "#FFFFFF",
      bio_color: "#CCCCCC",
      qr_foreground_color: "#000000",
      qr_background_color: "#FFFFFF",
      qr_margin: 6,
      qr_error_correction: "H",
      qr_module_shape: "classy",
      qr_eye_shape: "leaf",
    };

    const res = await patchMe(JSON.stringify(validPayload));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: Record<string, unknown> };
    expect(body.profile["display_name"]).toBe("A".repeat(80));
    expect(body.profile["bio"]).toBe("B".repeat(50));
    expect(body.profile["avatar_path"]).toBe(`${aliceId}/avatar-1.webp`);
    expect(body.profile["page_background_video_url"]).toBe(`${aliceId}/bg-video.mp4`);

    const presetRes = await patchMe(
      JSON.stringify({
        page_background_image_url: "/presets/floral.svg",
        page_background_video_url: "https://cdn.example.com/loop.mp4",
        avatar_path: null,
      }),
    );
    expect(presetRes.status).toBe(200);
    const presetBody = (await presetRes.json()) as { profile: Record<string, unknown> };
    expect(presetBody.profile["page_background_image_url"]).toBe("/presets/floral.svg");
    expect(presetBody.profile["avatar_path"]).toBeNull();
  });

  it("returns 400 (never 500) on wrong types and non-object JSON bodies", async () => {
    const wrongTypeBodies = [
      "[]",
      "null",
      '"hello"',
      "123",
      JSON.stringify({ bio: 123 }),
      JSON.stringify({ bio: { text: "hi" } }),
      JSON.stringify({ bio: ["array"] }),
      JSON.stringify({ display_name: 999 }),
      JSON.stringify({ display_name: ["bad"] }),
      JSON.stringify({ cover_photo_x: "50" }),
      JSON.stringify({ card_gradient_angle: "135" }),
      JSON.stringify({ qr_margin: "4" }),
      JSON.stringify({ name_font_weight: "600" }),
      JSON.stringify({ show_qr_button: "yes" }),
      JSON.stringify({ page_background_use_image: 1 }),
      JSON.stringify({ github_url: 123 }),
      JSON.stringify({ github_url: { url: "https://github.com/alice" } }),
      JSON.stringify({ page_background_image_url: 42 }),
      JSON.stringify({ page_background_video_url: true }),
    ];

    for (const raw of wrongTypeBodies) {
      const res = await patchMe(raw);
      expect(res.status, `Expected 400 for body ${raw}`).toBe(400);
      const data = (await res.json()) as { error?: string };
      expect(typeof data.error).toBe("string");
      expect(data.error!.length).toBeGreaterThan(0);
    }

    expect(() => store.updateProfile(aliceId, { bio: 123 } as unknown)).toThrow(StoreErrorClass);
  });

  it("rejects unknown, read-only, and prototype keys with 400", async () => {
    const forbiddenPayloads = [
      '{"verified":true}',
      '{"id":"other-id"}',
      '{"created_at":"2020-01-01T00:00:00Z"}',
      '{"updated_at":"2020-01-01T00:00:00Z"}',
      '{"unexpected_field":"boom"}',
      '{"__proto__":{"verified":true}}',
    ];

    for (const raw of forbiddenPayloads) {
      const res = await patchMe(raw);
      expect(res.status, `Expected 400 for payload ${raw}`).toBe(400);
    }
    expect(store.getProfileById(aliceId)?.verified).toBe(false);
  });

  it("rejects out-of-range lengths, invalid hex colors, invalid numeric bounds, and bad enums with 400", async () => {
    const invalidFieldCases: Array<Record<string, unknown>> = [
      { display_name: "A".repeat(81) },
      { bio: "B".repeat(51) },
      { card_background_color: "#fff" },
      { card_gradient_color: "red" },
      { page_background_color: "rgb(0,0,0)" },
      { social_icon_color: "#12345Z" },
      { qr_foreground_color: "000000" },
      { cover_photo_x: -0.1 },
      { cover_photo_y: 100.1 },
      { card_gradient_angle: -1 },
      { page_gradient_angle: 361 },
      { qr_margin: -1 },
      { qr_margin: 11 },
      { name_font_weight: 50 },
      { bio_font_weight: 950 },
      { name_font_weight: 450.5 },
      { card_background_type: "image" },
      { page_background_type: "gradient" },
      { page_background_image_mode: "tile" },
      { page_background_media_type: "svg" },
      { name_font_family: "comic-sans" },
      { bio_font_family: "arial" },
      { name_font_style: "bold" },
      { bio_font_style: "oblique" },
      { qr_error_correction: "Z" },
      { qr_module_shape: "star" },
      { qr_eye_shape: "triangle" },
    ];

    for (const payload of invalidFieldCases) {
      const res = await patchMe(JSON.stringify(payload));
      expect(res.status, `Expected 400 for ${JSON.stringify(payload)}`).toBe(400);
    }
  });

  it("rejects another user's media paths, path traversal, and non-https URLs with 400", async () => {
    const maliciousPathAndUrlCases: Array<Record<string, unknown>> = [
      // Another user's folder or prefix-spoof
      { avatar_path: `${bobId}/avatar.png` },
      { cover_photo_path: `${bobId}/cover.jpg` },
      { avatar_path: `${aliceId}-spoof/avatar.png` },
      { cover_photo_path: `../${bobId}/cover.jpg` },
      { avatar_path: `${aliceId}/../${bobId}/avatar.png` },
      { avatar_path: `${aliceId}/.meta.json` },
      { avatar_path: `${aliceId}/photo.png.meta.json` },
      { avatar_path: "https://cdn.example.com/avatar.png" },
      { avatar_path: "" },
      { cover_photo_path: "" },
      // Background media URLs: another user's folder, traversal, non-https, presets on video
      { page_background_image_url: `${bobId}/bg.png` },
      { page_background_video_url: `${bobId}/bg.mp4` },
      { page_background_image_url: `../${bobId}/bg.png` },
      { page_background_image_url: `/media/backgrounds/${bobId}/bg.png` },
      { page_background_image_url: "http://example.com/bg.jpg" },
      { page_background_image_url: "javascript:alert(1)" },
      { page_background_image_url: "data:image/svg+xml,<svg/>" },
      { page_background_image_url: "/evil/preset.svg" },
      { page_background_video_url: "http://example.com/bg.mp4" },
      { page_background_video_url: "javascript:alert(1)" },
      { page_background_video_url: "/presets/floral.svg" },
      // Social URLs: non-https / javascript / mismatched host
      { github_url: "http://github.com/aliceval" },
      { github_url: "javascript:alert(1)" },
      { github_url: "github.com/aliceval" },
      { github_url: "https://evil.com/aliceval" },
      { instagram_url: "data:text/html,<script>alert(1)</script>" },
    ];

    for (const payload of maliciousPathAndUrlCases) {
      const res = await patchMe(JSON.stringify(payload));
      expect(res.status, `Expected 400 for ${JSON.stringify(payload)}`).toBe(400);
    }
  });

  it("leaves in-memory and persisted profile and user state unchanged when a patch fails", async () => {
    const beforeProfile = structuredClone(store.getProfileById(aliceId));
    expect(beforeProfile).toBeTruthy();

    // Patch contains a valid username change alongside an invalid bio and invalid social URL.
    const failingRes1 = await patchMe(
      JSON.stringify({
        username: "alice-atomic-fail",
        display_name: "Should Not Persist",
        bio: "B".repeat(51),
      }),
    );
    expect(failingRes1.status).toBe(400);

    const failingRes2 = await patchMe(
      JSON.stringify({
        username: "alice-atomic-fail-2",
        github_url: "https://evil.com/alice",
      }),
    );
    expect(failingRes2.status).toBe(400);

    // Valid display_name alongside a taken username must also leave everything unchanged.
    const failingRes3 = await patchMe(
      JSON.stringify({
        username: "bobval",
        display_name: "Should Not Persist Either",
      }),
    );
    expect(failingRes3.status).toBe(409);

    // Trigger another write (for Bob) to verify no partial mutation leaked into db.json.
    store.updateProfile(bobId, { display_name: "Bob Updated" });

    expect(store.getProfileById(aliceId)).toEqual(beforeProfile);
    expect(store.isUsernameAvailable("alice-atomic-fail")).toBe(true);
    expect(store.isUsernameAvailable("alice-atomic-fail-2")).toBe(true);
    expect(store.refreshSessionForUser(aliceId)?.user.user_metadata.username).toBe(
      beforeProfile!.username,
    );

    await store.flush();
    const reloaded = new TinkiStoreClass(tmpDir);
    expect(reloaded.getProfileById(aliceId)).toEqual(beforeProfile);
    expect(reloaded.refreshSessionForUser(aliceId)?.user.user_metadata.username).toBe(
      beforeProfile!.username,
    );
  });

  it("syncs users[].username on username change and enforces a 30-day cooldown before others can claim the old username", async () => {
    const t0 = Date.now();
    const renamed = store.updateProfile(
      aliceId,
      { username: "alice-renamed", display_name: "Alice Renamed" },
      { nowMs: t0 },
    );
    expect(renamed.username).toBe("alice-renamed");
    expect(store.getProfileByUsername("alice-renamed")?.id).toBe(aliceId);
    expect(store.getProfileByUsername("aliceval")).toBeNull();
    expect(store.refreshSessionForUser(aliceId)?.user.user_metadata.username).toBe("alice-renamed");

    // Reload from disk to confirm users[].username and cooldown record both persisted.
    await store.flush();
    const reloaded = new TinkiStoreClass(tmpDir);
    expect(reloaded.refreshSessionForUser(aliceId)?.user.user_metadata.username).toBe(
      "alice-renamed",
    );

    // Old username ("aliceval") is blocked for anonymous checks and other users during 30-day cooldown.
    const anonAvailRes = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/usernames/available?username=aliceval"),
    );
    expect(anonAvailRes?.status).toBe(200);
    expect(await anonAvailRes?.json()).toEqual({ available: false });

    const bobAvailRes = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/usernames/available?username=aliceval", {
        headers: { cookie: bobCookie },
      }),
    );
    expect(bobAvailRes?.status).toBe(200);
    expect(await bobAvailRes?.json()).toEqual({ available: false });

    const bobClaimRes = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/profiles/me", {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: bobCookie },
        body: JSON.stringify({ username: "aliceval" }),
      }),
    );
    expect(bobClaimRes?.status).toBe(409);

    expect(() =>
      store.updateProfile(
        bobId,
        { username: "aliceval" },
        { nowMs: t0 + usernameCooldownMs - 1000 },
      ),
    ).toThrow(StoreErrorClass);

    await expect(
      store.createPendingSignup({
        email: "newcomer@example.com",
        password: "Password123!",
        username: "aliceval",
      }),
    ).rejects.toThrow(StoreErrorClass);

    // Previous owner (Alice) can check availability and reclaim her own old username within cooldown.
    const aliceAvailRes = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/usernames/available?username=aliceval", {
        headers: { cookie: aliceCookie },
      }),
    );
    expect(aliceAvailRes?.status).toBe(200);
    expect(await aliceAvailRes?.json()).toEqual({ available: true });

    // After 30 days have passed, Bob can claim the old username.
    const afterCooldownMs = t0 + usernameCooldownMs + 1;
    expect(store.isUsernameAvailable("aliceval", undefined, { nowMs: afterCooldownMs })).toBe(true);
    const bobReclaimed = store.updateProfile(
      bobId,
      { username: "aliceval" },
      { nowMs: afterCooldownMs },
    );
    expect(bobReclaimed.username).toBe("aliceval");
    expect(store.refreshSessionForUser(bobId)?.user.user_metadata.username).toBe("aliceval");
  });
});
