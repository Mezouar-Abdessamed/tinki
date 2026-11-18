import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SOCIAL_PLATFORMS } from "../src/lib/profile-validation";
import { saveSocialLinkSettings, type SocialLinkSetting } from "../src/lib/social-link-settings";
import { handleApiOrMediaRequest, resetApiRateLimits } from "../src/server/api-router.server";
import {
  StoreError,
  getStore,
  resetSharedStoreForTests,
} from "../src/server/local-fallback-store.server";

describe("saveSocialLinkSettings & PUT /api/social-settings validation", () => {
  const prevDataDir = process.env["TINKI_DATA_DIR"];
  const prevEnableLocal = process.env["ENABLE_LOCAL_STORE"];
  const prevNodeEnv = process.env["NODE_ENV"];
  let tmpDir: string;
  let aliceId: string;
  let aliceCookie: string;
  let bobId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-social-settings-"));
    process.env["TINKI_DATA_DIR"] = tmpDir;
    process.env["ENABLE_LOCAL_STORE"] = "true";
    process.env["NODE_ENV"] = "test";
    resetSharedStoreForTests();

    const store = getStore();
    const alice = await store.signUp({
      email: "alice-social@example.com",
      password: "Password123!",
      username: "alicesocial",
    });
    const bob = await store.signUp({
      email: "bob-social@example.com",
      password: "Password123!",
      username: "bobsocial",
    });
    aliceId = alice.user.id;
    aliceCookie = `tinki_session=${encodeURIComponent(alice.access_token)}`;
    bobId = bob.user.id;
    await store.flush();
  });

  beforeEach(() => {
    process.env["ENABLE_LOCAL_STORE"] = "true";
    process.env["NODE_ENV"] = "test";
    resetApiRateLimits();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    resetSharedStoreForTests();
    if (prevDataDir === undefined) delete process.env["TINKI_DATA_DIR"];
    else process.env["TINKI_DATA_DIR"] = prevDataDir;
    if (prevEnableLocal === undefined) delete process.env["ENABLE_LOCAL_STORE"];
    else process.env["ENABLE_LOCAL_STORE"] = prevEnableLocal;
    if (prevNodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = prevNodeEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function putSocialSettings(body: unknown): Promise<Response> {
    return (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/social-settings", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: aliceCookie,
        },
        body: JSON.stringify(body),
      }),
    ))!;
  }

  it("requires body.settings to be an array and returns 400 otherwise", async () => {
    for (const badBody of [
      {},
      { settings: null },
      { settings: "github" },
      { settings: 123 },
      { settings: { platform: "github", enabled: true, position: 0 } },
      [],
    ]) {
      const res = await putSocialSettings(badBody);
      expect(res.status).toBe(400);
      expect((await res.json()) as { code: string }).toMatchObject({
        code: "invalid_social_settings",
      });
    }
  });

  it("validates each item with zod (platform allow-list, boolean enabled, integer position 0-50) and caps array length", async () => {
    const invalidBodies: Array<Record<string, unknown>> = [
      // Unknown platform
      {
        settings: [{ profile_id: aliceId, platform: "myspace", enabled: true, position: 0 }],
      },
      // Non-boolean enabled
      {
        settings: [{ profile_id: aliceId, platform: "github", enabled: "true", position: 0 }],
      },
      // Negative position
      {
        settings: [{ profile_id: aliceId, platform: "github", enabled: true, position: -1 }],
      },
      // Position > 50
      {
        settings: [{ profile_id: aliceId, platform: "github", enabled: true, position: 51 }],
      },
      // Non-integer position
      {
        settings: [{ profile_id: aliceId, platform: "github", enabled: true, position: 1.5 }],
      },
      // String position
      {
        settings: [{ profile_id: aliceId, platform: "github", enabled: true, position: "0" }],
      },
      // Unknown extra field rejected by .strict()
      {
        settings: [
          { profile_id: aliceId, platform: "github", enabled: true, position: 0, extra: 1 },
        ],
      },
      // Exceeds SOCIAL_PLATFORMS.length
      {
        settings: Array.from({ length: SOCIAL_PLATFORMS.length + 1 }, (_, i) => ({
          profile_id: aliceId,
          platform: SOCIAL_PLATFORMS[i % SOCIAL_PLATFORMS.length]!.key,
          enabled: true,
          position: i,
        })),
      },
    ];

    for (const badBody of invalidBodies) {
      const res = await putSocialSettings(badBody);
      expect(res.status).toBe(400);
      expect((await res.json()) as { code: string }).toMatchObject({
        code: "invalid_social_settings",
      });
    }

    // Valid full platform list up to SOCIAL_PLATFORMS.length succeeds
    const validSettings = SOCIAL_PLATFORMS.map((p, index) => ({
      profile_id: aliceId,
      platform: p.key,
      enabled: index % 2 === 0,
      position: index === 0 ? 50 : index,
    }));
    const okRes = await putSocialSettings({ settings: validSettings });
    expect(okRes.status).toBe(200);
    expect(getStore().listSocialLinkSettings(aliceId)).toHaveLength(SOCIAL_PLATFORMS.length);
  });

  it("enforces atomic ownership and validation directly in TinkiStore.saveSocialLinkSettings", () => {
    const store = getStore();
    store.saveSocialLinkSettings(aliceId, [
      { profile_id: aliceId, platform: "github", enabled: true, position: 0 },
    ]);

    expect(() =>
      store.saveSocialLinkSettings(
        aliceId,
        "not-an-array" as unknown as Array<{
          profile_id: string;
          platform: string;
          enabled: boolean;
          position: number;
        }>,
      ),
    ).toThrowError(StoreError);

    // Item 0 targets aliceId, item 1 targets bobId -> must throw 403 atomically without changing github
    expect(() =>
      store.saveSocialLinkSettings(aliceId, [
        { profile_id: aliceId, platform: "github", enabled: false, position: 5 },
        { profile_id: bobId, platform: "x", enabled: true, position: 1 },
      ]),
    ).toThrow(/Not authorized/i);

    const afterFailed = store.listSocialLinkSettings(aliceId).find((s) => s.platform === "github");
    expect(afterFailed?.enabled).toBe(true);
    expect(afterFailed?.position).toBe(0);
  });

  it("validates settings client-side in saveSocialLinkSettings before sending network requests", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(saveSocialLinkSettings("bad" as unknown as SocialLinkSetting[])).rejects.toThrow(
      /array/i,
    );

    await expect(
      saveSocialLinkSettings([
        {
          id: undefined,
          profile_id: aliceId,
          platform: "not-a-platform" as unknown as SocialLinkSetting["platform"],
          enabled: true,
          position: 0,
        },
      ]),
    ).rejects.toThrow();

    await expect(
      saveSocialLinkSettings(
        Array.from({ length: SOCIAL_PLATFORMS.length + 1 }, (_, i) => ({
          id: undefined,
          profile_id: aliceId,
          platform: SOCIAL_PLATFORMS[i % SOCIAL_PLATFORMS.length]!.key,
          enabled: true,
          position: i,
        })),
      ),
    ).rejects.toThrow(/exceed/i);

    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await saveSocialLinkSettings([
      {
        id: undefined,
        profile_id: aliceId,
        platform: "github",
        enabled: true,
        position: 0,
      },
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
