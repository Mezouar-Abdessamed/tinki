import assert from "node:assert/strict";
import test from "node:test";

import { requiresInitialPasswordSetup } from "./account-helpers";

test("requiresInitialPasswordSetup handles social-only, linked, email-only, and empty identities", () => {
  assert.equal(requiresInitialPasswordSetup({ identities: [{ provider: "google" }] }), true);
  assert.equal(
    requiresInitialPasswordSetup({
      identities: [{ provider: "google" }, { provider: "email" }],
    }),
    false,
  );
  assert.equal(requiresInitialPasswordSetup({ identities: [{ provider: "email" }] }), false);
  assert.equal(requiresInitialPasswordSetup({ identities: [] }), false);
  assert.equal(requiresInitialPasswordSetup(undefined), false);
});
