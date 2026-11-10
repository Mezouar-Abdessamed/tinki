import { defineConfig } from "vitest/config";

// These focused application tests do not need the legacy database test setup.
export default defineConfig({ test: { environment: "node", include: ["tests/profile-edit-state.test.ts", "tests/signup.test.ts", "tests/signup-availability.test.ts"] } });