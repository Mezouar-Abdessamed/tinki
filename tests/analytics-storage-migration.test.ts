import { afterEach, describe, expect, it, vi } from "vitest";

import {
  VIEW_PREFIX,
  VISITOR_KEY,
  getVisitorId,
  migrateLegacyAnalyticsStorage,
  trackProfileView,
} from "../src/lib/analytics";

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe("Analytics localStorage key migration (onelink_ -> tinki_)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("migrates legacy onelink_visitor and onelink_viewed:* keys once and removes old keys", () => {
    const legacyVisitorId = "550e8400-e29b-41d4-a716-446655440000";
    const now = Date.now();
    const recentTs = String(now - 5_000);
    const socialTs = String(now - 2_000);

    const storage = createMemoryStorage({
      onelink_visitor: legacyVisitorId,
      "onelink_viewed:profile-1": recentTs,
      "onelink_viewed:profile-1:social:github": socialTs,
      unrelated_key: "keep",
    });

    vi.stubGlobal("window", { localStorage: storage });

    expect(getVisitorId()).toBe(legacyVisitorId);
    expect(storage.getItem(VISITOR_KEY)).toBe(legacyVisitorId);
    expect(storage.getItem(`${VIEW_PREFIX}profile-1`)).toBe(recentTs);
    expect(storage.getItem(`${VIEW_PREFIX}profile-1:social:github`)).toBe(socialTs);
    expect(storage.getItem("tinki_storage_migrated_v1")).toBe("1");
    expect(storage.getItem("unrelated_key")).toBe("keep");

    // Legacy keys are deleted after migration
    expect(storage.getItem("onelink_visitor")).toBeNull();
    expect(storage.getItem("onelink_viewed:profile-1")).toBeNull();
    expect(storage.getItem("onelink_viewed:profile-1:social:github")).toBeNull();

    // Subsequent calls are gated by the one-time marker and do not re-migrate late writes
    storage.setItem("onelink_viewed:late", "12345");
    migrateLegacyAnalyticsStorage(storage);
    expect(storage.getItem(`${VIEW_PREFIX}late`)).toBeNull();
  });

  it("preserves newer tinki_ timestamps and ignores invalid legacy visitor IDs", () => {
    const newVisitorId = "11111111-1111-4111-8111-111111111111";
    const storage = createMemoryStorage({
      onelink_visitor: "not-a-valid-uuid",
      [VISITOR_KEY]: newVisitorId,
      "onelink_viewed:prof-a": "1000",
      [`${VIEW_PREFIX}prof-a`]: "5000",
    });

    migrateLegacyAnalyticsStorage(storage);

    expect(storage.getItem(VISITOR_KEY)).toBe(newVisitorId);
    expect(storage.getItem("onelink_visitor")).toBeNull();
    expect(storage.getItem(`${VIEW_PREFIX}prof-a`)).toBe("5000");
    expect(storage.getItem("onelink_viewed:prof-a")).toBeNull();
  });

  it("records profile views using tinki_viewed:* and skips duplicate views migrated from onelink_viewed:*", async () => {
    const now = Date.now();
    const storage = createMemoryStorage({
      onelink_visitor: "550e8400-e29b-41d4-a716-446655440000",
      "onelink_viewed:creator-1": String(now - 60_000),
    });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);

    // Migrated legacy view prevents duplicate view event within the hour
    await trackProfileView("creator-1", false);
    expect(fetchMock).not.toHaveBeenCalled();

    // New profile writes under tinki_viewed:*
    await trackProfileView("creator-2", false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.getItem(`${VIEW_PREFIX}creator-2`)).toBeTruthy();
    expect(storage.getItem("onelink_viewed:creator-2")).toBeNull();
  });
});
