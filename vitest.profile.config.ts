import { defineConfig } from "vitest/config";

// These pure editing-state tests do not need the legacy database test setup.
export default defineConfig({ test: { environment: "node", include: ["tests/profile-edit-state.test.ts"] } });