import { describe, expect, it } from "vitest";

import {
  CHUNK_RELOAD_COOLDOWN_MS,
  CHUNK_RELOAD_STORAGE_KEY,
  isDynamicImportError,
  tryConsumeChunkReloadAllowance,
  type StorageLike,
} from "../src/lib/route-error-recovery";

class MemoryStorage implements StorageLike {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("isDynamicImportError", () => {
  it("matches Vite and browser dynamic import fetch errors", () => {
    expect(
      isDynamicImportError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://example.com/src/routes/index.tsx?tsr-split=component",
        ),
      ),
    ).toBe(true);
    expect(isDynamicImportError(new Error("Importing a module script failed."))).toBe(true);
    expect(isDynamicImportError("error loading dynamically imported module")).toBe(true);
    expect(isDynamicImportError(new Error("Loading chunk 42 failed."))).toBe(true);
  });

  it("ignores unrelated application errors", () => {
    expect(isDynamicImportError(new Error("Validation failed"))).toBe(false);
    expect(isDynamicImportError(null)).toBe(false);
  });
});

describe("tryConsumeChunkReloadAllowance", () => {
  it("allows one reload immediately and suppresses rapid repeat loops", () => {
    const storage = new MemoryStorage();
    const t0 = 1_000_000;

    expect(tryConsumeChunkReloadAllowance(storage, t0)).toBe(true);
    expect(storage.getItem(CHUNK_RELOAD_STORAGE_KEY)).toBe(String(t0));
    expect(tryConsumeChunkReloadAllowance(storage, t0 + 1_000)).toBe(false);
    expect(tryConsumeChunkReloadAllowance(storage, t0 + CHUNK_RELOAD_COOLDOWN_MS)).toBe(true);
  });

  it("returns false safely when storage is unavailable or throws", () => {
    expect(tryConsumeChunkReloadAllowance(null)).toBe(false);
    const brokenStorage: StorageLike = {
      getItem() {
        throw new Error("SecurityError");
      },
      setItem() {
        throw new Error("SecurityError");
      },
    };
    expect(tryConsumeChunkReloadAllowance(brokenStorage)).toBe(false);
  });
});
