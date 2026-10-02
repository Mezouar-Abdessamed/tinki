import path from "node:path";

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    // Dummy, non-secret values so modules that construct the Supabase browser
    // client can be imported by unit tests. No network calls are made.
    env: {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
      VITE_SUPABASE_ANON_KEY: "sb_publishable_test_key",
      VITE_SUPABASE_PROJECT_ID: "example",
    },
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/db/globalSetup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/lib/**/*.tsx"],
    },
  },
});
