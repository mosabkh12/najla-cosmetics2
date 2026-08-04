// Standalone from vite.config.ts on purpose: that file is generated/managed
// by @lovable.dev/vite-tanstack-config, which explicitly warns against
// adding plugins manually. Test-only concerns (environment, include globs,
// the @ alias) live here instead so the app's real build config is never
// touched by adding tests.
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    restoreMocks: true,
  },
});
