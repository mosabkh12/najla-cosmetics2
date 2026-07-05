# Caching strategy

## Deployment target: Vercel

This project deploys to **Vercel**. `vite.config.ts` pins Nitro's build preset explicitly:

```ts
export default defineConfig({
  // ...
  nitro: { preset: "vercel" },
});
```

No Cloudflare-specific code, deploy scripts, or generated config remain in this repo. There is no `wrangler.toml`, no Cloudflare Workers Cache API usage, and no `vercel.json` — none is needed for this project; Vercel's zero-config Nitro output handles routing and headers on its own.

Verified by actually running `npm run build` after this change: it now produces `.vercel/output/` (Vercel's Build Output API v3 — `functions/__server.func/`, `config.json`, `nitro.json`), and `.vercel/output/nitro.json` reports `"preset": "vercel"`. No `.output/`, no `wrangler.json`, no Cloudflare artifacts were generated. (`@lovable.dev/vite-tanstack-config`'s own type docs mention it can force the Cloudflare preset inside Lovable's own one-click-deploy pipeline specifically — that did not apply to this build, which correctly picked up the `preset: "vercel"` override.)

## Caching approach: plain standard HTTP caching only

No custom edge cache, no cache-purge API, no external cache service (no Redis/Upstash/KV), and no new environment variables. Two layers, both already standard for this stack:

### 1. Browser caching — TanStack Query
Public product/service/settings/detail queries keep a `staleTime` (120s for lists/details, 300s for settings). Admin mutations (`saveProduct`/`toggleProduct`/`deleteProduct`, `saveService`/`toggleService`/`deleteService`, `saveSettings`) call `invalidateQueries` on the matching public + admin query keys immediately after a successful write — **the admin sees their own change instantly**, in the same browser session, regardless of any HTTP/CDN cache state.

### 2. HTTP `Cache-Control` header — the only CDN-facing mechanism
All public, unauthenticated, read-only server functions send:

```
Cache-Control: public, max-age=60, s-maxage=60
```

Applied to: `getProducts`, `getFeaturedProducts`, `getProductById`, `getProductImages`, `getRelatedProducts`, `getServices`, `getSettings`. No `stale-while-revalidate` — a hard `s-maxage=60` means Vercel's CDN (and any other cache that honors standard `Cache-Control`) cannot serve a copy older than 60 seconds, full stop. `max-age=60` is included alongside it so a plain browser HTTP cache (which ignores `s-maxage`) gets the same 60-second lifetime.

This header is set with `setResponseHeader()` only on each handler's success path, so an error response is never marked cacheable. Every one of these handlers has no auth middleware and never reads `context.userId`/claims — the response is identical for every caller, so it's safe to mark `public` even though a logged-in browser's request may still carry an `Authorization` header (irrelevant to what these handlers return).

**Public visitors may see up to 60 seconds of staleness after an admin change — there is no purge mechanism, and none is claimed.** This is a deliberate, disclosed trade-off, not an oversight: it keeps the implementation to "plain HTTP headers + the query cache already in the app," with zero new infrastructure, credentials, or moving parts.

## What stays uncached

- `getAvailableTimes` (booking availability) — explicit `Cache-Control: no-store`.
- All appointment mutations (create/reschedule/cancel/status update), all order mutations and checkout, OTP/signup/auth, `getProfile`/`updateProfile`, favorites, all `admin-*`/`getAdmin*` reads, and all admin mutation responses.
- Nothing authenticated or user-specific is ever marked `public` or shared-cached.

## Image caching — unchanged

`uploadAdminImage` still sets `cacheControl: "31536000"` on the Supabase Storage upload. Uploaded files use server-generated random UUID filenames with `upsert: false` (never overwritten), so a full year is safe. Replacing an image doesn't purge the old cached URL — it doesn't need to, since the new file gets a brand-new URL and the old one is cleaned up by the existing `deleteOldImageIfUnreferenced` reference-counting logic once nothing points at it anymore. No image purge API was added.

## Expected update delay

| Who | When they see the change |
|---|---|
| The admin who made the change | Immediately — TanStack Query invalidation, same browser session |
| Any other visitor | Within 60 seconds — bounded by `Cache-Control: max-age=60, s-maxage=60`, nothing more precise is claimed |

## Required environment variables

**None.** This implementation adds no new secrets, API tokens, or environment variables of any kind.

## Confirmed removed

- `src/lib/edge-cache.server.ts` (Cloudflare Workers `caches.default` wrapper) — deleted.
- All `withEdgeCache`/`purgeEdgeCache` imports and calls in `src/api/products/products.ts`, `src/api/services/services.ts`, `src/api/settings/settings.ts` — removed; those handlers now only set the plain `Cache-Control` header described above.
- Generated Cloudflare build artifacts (`.output/`, `.wrangler/`) — these were already gitignored (never committed) and have been deleted from disk since they were stale/misleading after the platform change.

## Future improvements (not built — would need real traffic/infrastructure to justify)

- **CDN purge on mutation**: Vercel's own Data Cache / `revalidateTag`-style APIs could give near-instant global freshness instead of the 60s bound, but that's a meaningfully larger change (tagging responses, wiring a revalidation call into each mutation) — not justified until the 60s window is demonstrated to be a real problem.
- **Redis/Upstash**: not needed today. Would become worth it if traffic grows enough that even a 60s cache window doesn't meaningfully cut database load, or if `sendOtp`/`checkEmailAvailable`/`checkPhoneAvailable` need real cross-instance rate limiting beyond the current per-email database-backed cooldown.
