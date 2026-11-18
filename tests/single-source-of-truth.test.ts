import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleApiOrMediaRequest } from "../src/server/api-router.server";
import {
  StoreError,
  TinkiStore,
  getStore,
  isLocalStoreEnabled,
  resetSharedStoreForTests,
} from "../src/server/local-fallback-store.server";

describe("Single source of truth (Firestore default, gated local store & debounced persistence)", () => {
  const prevNodeEnv = process.env["NODE_ENV"];
  const prevEnableLocal = process.env["ENABLE_LOCAL_STORE"];
  const prevDataDir = process.env["TINKI_DATA_DIR"];
  const prevSecret = process.env["AUTH_SECRET"];
  const tempDirs: string[] = [];

  function makeTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    resetSharedStoreForTests();
    vi.restoreAllMocks();

    if (prevNodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = prevNodeEnv;

    if (prevEnableLocal === undefined) delete process.env["ENABLE_LOCAL_STORE"];
    else process.env["ENABLE_LOCAL_STORE"] = prevEnableLocal;

    if (prevDataDir === undefined) delete process.env["TINKI_DATA_DIR"];
    else process.env["TINKI_DATA_DIR"] = prevDataDir;

    if (prevSecret === undefined) delete process.env["AUTH_SECRET"];
    else process.env["AUTH_SECRET"] = prevSecret;

    while (tempDirs.length > 0) {
      const target = tempDirs.pop();
      if (target) fs.rmSync(target, { recursive: true, force: true });
    }
  });

  it("gates the local store behind ENABLE_LOCAL_STORE=true and permanently disables it in production", () => {
    delete process.env["ENABLE_LOCAL_STORE"];
    process.env["NODE_ENV"] = "development";
    assert.equal(isLocalStoreEnabled(), false);

    process.env["ENABLE_LOCAL_STORE"] = "false";
    assert.equal(isLocalStoreEnabled(), false);

    process.env["ENABLE_LOCAL_STORE"] = "true";
    assert.equal(isLocalStoreEnabled(), true);

    process.env["NODE_ENV"] = "production";
    assert.equal(isLocalStoreEnabled(), false);

    process.env["NODE_ENV"] = "test";
    delete process.env["ENABLE_LOCAL_STORE"];
    assert.throws(
      () => getStore(),
      (err: unknown) =>
        err instanceof StoreError && err.status === 503 && err.code === "local_store_disabled",
    );
  });

  it("never falls back to the local store when Firestore returns empty or 404, and surfaces Firestore 502 errors", async () => {
    const dir = makeTempDir("tinki-no-fallback-");
    process.env["TINKI_DATA_DIR"] = dir;
    process.env["ENABLE_LOCAL_STORE"] = "true";
    process.env["NODE_ENV"] = "test";
    process.env["AUTH_SECRET"] = "test-secret-for-single-source-123456";

    // Seed local store on disk with a profile, custom link, social setting, and avatar file
    const seeded = new TinkiStore(dir);
    try {
      const created = await seeded.signUp({
        email: "alice@example.com",
        password: "Password123!",
        username: "alice",
      });
      seeded.createCustomLink(created.user.id, {
        name: "Local Only Link",
        url: "https://local-only.example.com",
      });
      seeded.saveSocialLinkSettings(created.user.id, [
        { profile_id: created.user.id, platform: "github", enabled: true, position: 0 },
      ]);
      const validPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      seeded.saveMediaFile(
        created.user.id,
        "avatars",
        `${created.user.id}/avatar.png`,
        validPng,
        "image/png",
      );
      await seeded.flush();

      // Switch to default single-source Firestore mode
      delete process.env["ENABLE_LOCAL_STORE"];
      resetSharedStoreForTests();

      const emptyFirestoreFetch: typeof fetch = async (input) => {
        const target = String(input);
        if (target.includes(":runQuery")) {
          return new Response(JSON.stringify([{ readTime: "2026-01-01T00:00:00Z" }]), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: { code: 404, message: "Not found" } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      };

      const linksRes = await handleApiOrMediaRequest(
        new Request(`http://localhost:3000/api/profiles/${created.user.id}/custom-links`),
        { firestoreFetch: emptyFirestoreFetch },
      );
      expect(linksRes?.status).toBe(200);
      expect(await linksRes?.json()).toEqual({ links: [] });

      const socialRes = await handleApiOrMediaRequest(
        new Request(`http://localhost:3000/api/profiles/${created.user.id}/social-settings`),
        { firestoreFetch: emptyFirestoreFetch },
      );
      expect(socialRes?.status).toBe(200);
      expect(await socialRes?.json()).toEqual({ settings: [] });

      const byUsernameRes = await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/profiles/by-username/alice"),
        { firestoreFetch: emptyFirestoreFetch },
      );
      expect(byUsernameRes?.status).toBe(200);
      expect(await byUsernameRes?.json()).toEqual({ profile: null });

      const availableRes = await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/usernames/available?username=alice"),
        { firestoreFetch: emptyFirestoreFetch },
      );
      expect(availableRes?.status).toBe(200);
      expect(await availableRes?.json()).toEqual({ available: true });

      const mediaRes = await handleApiOrMediaRequest(
        new Request(`http://localhost:3000/media/avatars/${created.user.id}/avatar.png`),
        { firestoreFetch: emptyFirestoreFetch },
      );
      expect(mediaRes?.status).toBe(404);

      const sessionRes = await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/auth/session"),
        { firestoreFetch: emptyFirestoreFetch },
      );
      expect(sessionRes?.status).toBe(200);
      expect(await sessionRes?.json()).toEqual({ session: null });

      const disabledRouteRes = await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "alice@example.com", password: "Password123!" }),
        }),
        { firestoreFetch: emptyFirestoreFetch },
      );
      expect(disabledRouteRes?.status).toBe(503);
      expect((await disabledRouteRes?.json()) as { code: string }).toMatchObject({
        code: "local_store_disabled",
      });

      // Firestore upstream failure returns 502 instead of falling back or pretending data does not exist
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const failingFirestoreFetch: typeof fetch = async () =>
        new Response("upstream failure", { status: 500 });

      const failedLinksRes = await handleApiOrMediaRequest(
        new Request(`http://localhost:3000/api/profiles/${created.user.id}/custom-links`),
        { firestoreFetch: failingFirestoreFetch },
      );
      expect(failedLinksRes?.status).toBe(502);
      expect((await failedLinksRes?.json()) as { code: string }).toMatchObject({
        code: "firestore_unavailable",
      });
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      seeded.dispose();
    }
  });

  it("debounces db.json writes across bursts and flushes asynchronously via temp-file rename", async () => {
    const dir = makeTempDir("tinki-debounce-");
    const store = new TinkiStore(dir, { persistDelayMs: 60 });
    try {
      const user = await store.signUp({
        email: "burst@example.com",
        password: "Password123!",
        username: "burstuser",
      });
      await store.flush();

      const writeSpy = vi.spyOn(fs.promises, "writeFile");
      const renameSpy = vi.spyOn(fs.promises, "rename");

      for (let i = 0; i < 20; i++) {
        store.recordEvent(null, {
          profile_id: user.user.id,
          event_type: "profile_view",
          visitor_id: `visitor-${i}`,
        });
      }

      // Immediately after synchronous burst, no disk write has fired yet
      expect(writeSpy).toHaveBeenCalledTimes(0);

      // Waiting past debounce coalesces all 20 events into a single atomic write
      await new Promise((resolve) => setTimeout(resolve, 140));
      await store.flush();
      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(renameSpy).toHaveBeenCalledTimes(1);

      const reloaded = new TinkiStore(dir);
      try {
        expect(reloaded.getAnalytics(user.user.id, user.user.id).views).toBe(20);
      } finally {
        reloaded.dispose();
      }
    } finally {
      store.dispose();
    }
  });

  it("logs persistence and load errors instead of silently swallowing them", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Corrupted db.json logs on load()
    const badJsonDir = makeTempDir("tinki-corrupt-");
    fs.writeFileSync(path.join(badJsonDir, "db.json"), "{not valid json", "utf8");
    const corruptStore = new TinkiStore(badJsonDir);
    corruptStore.dispose();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to load database file"),
      expect.any(Error),
    );

    errorSpy.mockClear();

    // Unwritable dataDir (file at target path) logs on flush() instead of crashing or hiding failure
    const parentDir = makeTempDir("tinki-unwritable-");
    const blockingFilePath = path.join(parentDir, "not-a-directory");
    fs.writeFileSync(blockingFilePath, "occupy", "utf8");

    const unwritableStore = new TinkiStore(blockingFilePath, { persistDelayMs: 10 });
    try {
      await unwritableStore.signUp({
        email: "log@example.com",
        password: "Password123!",
        username: "loguser",
      });
      await unwritableStore.flush();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to persist database file"),
        expect.any(Error),
      );
    } finally {
      unwritableStore.dispose();
    }
  });
});
