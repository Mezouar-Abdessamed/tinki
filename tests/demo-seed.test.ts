import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { TinkiStore } from "../src/server/local-fallback-store.server";

const DEMO_ID = "00000000-0000-4000-8000-000000000001";

describe("TinkiStore demo seeding guard & startup cleanup", () => {
  const prevNodeEnv = process.env["NODE_ENV"];
  const prevSeedDemo = process.env["SEED_DEMO"];
  const prevSecret = process.env["AUTH_SECRET"];
  const tempDirs: string[] = [];

  function makeTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    if (prevNodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = prevNodeEnv;

    if (prevSeedDemo === undefined) delete process.env["SEED_DEMO"];
    else process.env["SEED_DEMO"] = prevSeedDemo;

    if (prevSecret === undefined) delete process.env["AUTH_SECRET"];
    else process.env["AUTH_SECRET"] = prevSecret;

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not seed demo@tinki.app by default when SEED_DEMO is unset or false", async () => {
    process.env["NODE_ENV"] = "development";
    delete process.env["SEED_DEMO"];

    const dir = makeTempDir("tinki-no-demo-");
    const store = new TinkiStore(dir);

    expect(store.getProfileById(DEMO_ID)).toBeNull();
    expect(store.getProfileByUsername("sara")).toBeNull();
    expect(store.isUsernameAvailable("sara")).toBe(true);
    await expect(
      store.login({ email: "demo@tinki.app", password: "DemoPass123!" }),
    ).rejects.toThrow(/invalid login/i);

    process.env["SEED_DEMO"] = "false";
    const storeFalse = new TinkiStore(makeTempDir("tinki-demo-false-"));
    expect(storeFalse.getProfileById(DEMO_ID)).toBeNull();
    expect(storeFalse.getProfileByUsername("sara")).toBeNull();
  });

  it("seeds demo@tinki.app and fake analytics only when NODE_ENV !== 'production' and SEED_DEMO=true", async () => {
    process.env["NODE_ENV"] = "development";
    process.env["SEED_DEMO"] = "true";

    const dir = makeTempDir("tinki-demo-enabled-");
    const store = new TinkiStore(dir);

    const profile = store.getProfileByUsername("sara");
    expect(profile?.id).toBe(DEMO_ID);
    const session = await store.login({ email: "demo@tinki.app", password: "DemoPass123!" });
    expect(session.user.id).toBe(DEMO_ID);
    expect(store.listCustomLinks(DEMO_ID)).toHaveLength(3);
    const analytics = store.getAnalytics(DEMO_ID, DEMO_ID);
    expect(analytics.views).toBe(18);
    expect(analytics.clicks).toBe(12);
    expect(analytics.customLinkClicks).toBe(5);
  });

  it("never creates the demo user in production even if SEED_DEMO=true", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["SEED_DEMO"] = "true";
    process.env["AUTH_SECRET"] = "prod-secret-at-least-32-characters-long-1234";

    const dir = makeTempDir("tinki-prod-no-demo-");
    const store = new TinkiStore(dir);

    expect(store.getProfileById(DEMO_ID)).toBeNull();
    expect(store.getProfileByUsername("sara")).toBeNull();
    await expect(
      store.login({ email: "demo@tinki.app", password: "DemoPass123!" }),
    ).rejects.toThrow(/invalid login/i);
  });

  it("cleans up existing demo user, profile, links, and events on startup when SEED_DEMO is not true (preserving real users)", async () => {
    const dir = makeTempDir("tinki-demo-cleanup-");

    // Step 1: Start with SEED_DEMO=true in dev, plus add a real user alongside demo
    process.env["NODE_ENV"] = "development";
    process.env["SEED_DEMO"] = "true";
    const seededStore = new TinkiStore(dir);
    const demoSession = await seededStore.login({
      email: "demo@tinki.app",
      password: "DemoPass123!",
    });
    expect(seededStore.getProfileByUsername("sara")?.id).toBe(DEMO_ID);

    const realSession = await seededStore.signUp({
      email: "alice@example.com",
      password: "RealPassword123!",
      username: "alice",
    });
    const realLink = seededStore.createCustomLink(realSession.user.id, {
      name: "Alice Site",
      url: "https://alice.example.com",
    });
    seededStore.recordEvent(null, {
      profile_id: realSession.user.id,
      event_type: "profile_view",
      visitor_id: "real-visitor-1",
    });
    await seededStore.flush();
    seededStore.dispose();

    // Step 2: Restart without SEED_DEMO=true -> demo data must be removed, Alice untouched
    delete process.env["SEED_DEMO"];
    const cleanedStore = new TinkiStore(dir);
    await cleanedStore.flush();

    expect(cleanedStore.getProfileById(DEMO_ID)).toBeNull();
    expect(cleanedStore.getProfileByUsername("sara")).toBeNull();
    expect(cleanedStore.verifySessionToken(demoSession.access_token)).toBeNull();
    await expect(
      cleanedStore.login({ email: "demo@tinki.app", password: "DemoPass123!" }),
    ).rejects.toThrow(/invalid login/i);

    const diskDb = JSON.parse(fs.readFileSync(path.join(dir, "db.json"), "utf8")) as {
      users: Array<{ id: string; email: string }>;
      profiles: Array<{ id: string; username: string }>;
      customLinks: Array<{ profile_id: string }>;
      profileEvents: Array<{ profile_id: string }>;
    };
    expect(diskDb.users.some((u) => u.email === "demo@tinki.app" || u.id === DEMO_ID)).toBe(false);
    expect(diskDb.profiles.some((p) => p.id === DEMO_ID)).toBe(false);
    expect(diskDb.customLinks.some((l) => l.profile_id === DEMO_ID)).toBe(false);
    expect(diskDb.profileEvents.some((e) => e.profile_id === DEMO_ID)).toBe(false);

    // Real user data remains intact
    expect(cleanedStore.getProfileByUsername("alice")?.id).toBe(realSession.user.id);
    expect(cleanedStore.listCustomLinks(realSession.user.id).map((l) => l.id)).toEqual([
      realLink.id,
    ]);
    expect(cleanedStore.getAnalytics(realSession.user.id, realSession.user.id).views).toBe(1);
    expect(
      (await cleanedStore.login({ email: "alice@example.com", password: "RealPassword123!" })).user
        .id,
    ).toBe(realSession.user.id);
    cleanedStore.dispose();
  });

  it("cleans up existing demo user on startup in production even if SEED_DEMO=true", async () => {
    const dir = makeTempDir("tinki-demo-prod-cleanup-");

    process.env["NODE_ENV"] = "development";
    process.env["SEED_DEMO"] = "true";
    process.env["AUTH_SECRET"] = "prod-secret-at-least-32-characters-long-5678";
    const devStore = new TinkiStore(dir);
    expect(devStore.getProfileById(DEMO_ID)).not.toBeNull();
    await devStore.flush();
    devStore.dispose();

    process.env["NODE_ENV"] = "production";
    process.env["SEED_DEMO"] = "true";
    const prodStore = new TinkiStore(dir);
    expect(prodStore.getProfileById(DEMO_ID)).toBeNull();
    expect(prodStore.getProfileByUsername("sara")).toBeNull();
    prodStore.dispose();
  });
});
