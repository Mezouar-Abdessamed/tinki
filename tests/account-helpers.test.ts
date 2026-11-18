import { describe, expect, it } from "vitest";

import { requiresInitialPasswordSetup } from "../src/lib/account-helpers";

describe("account helpers", () => {
  it("requiresInitialPasswordSetup handles social-only, linked, email-only, and empty identities", () => {
    expect(requiresInitialPasswordSetup({ identities: [{ provider: "google" }] })).toBe(true);
    expect(
      requiresInitialPasswordSetup({
        identities: [{ provider: "google" }, { provider: "email" }],
      }),
    ).toBe(false);
    expect(requiresInitialPasswordSetup({ identities: [{ provider: "email" }] })).toBe(false);
    expect(requiresInitialPasswordSetup({ identities: [] })).toBe(false);
    expect(requiresInitialPasswordSetup(undefined)).toBe(false);
  });
});
