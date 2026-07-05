// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only, defaults to
//     cloudflare-module unless overridden below or auto-detected via NITRO_PRESET/platform env vars),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    // This project deploys to Vercel — hard-pin the Nitro preset rather
    // than relying on the wrapper's default (cloudflare-module) or on
    // Vercel's own zero-config auto-detection. No extra dependency: Nitro
    // has built-in support for this preset.
    //
    // Note: `@lovable.dev/vite-tanstack-config` forces the preset to
    // cloudflare-module while building *inside* the Lovable sandbox — this
    // override only takes effect for a real build/deploy run outside it
    // (e.g. Vercel's own build pipeline), which is the only place it needs
    // to apply.
    preset: "vercel",
  },
});
