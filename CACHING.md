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

## Caching approach: none — every public read is `no-store`

Every public product/service/settings/detail server function sends `Cache-Control: no-store`, and none of their TanStack Query calls set a `staleTime` (default `0`, i.e. always considered stale). Nothing here is HTTP-cached or client-cached anymore.

Applied to: `getProducts`, `getFeaturedProducts`, `getProductById`, `getProductImages`, `getRelatedProducts`, `getServices`, `getSettings`.

**History**: this used to be `Cache-Control: public, max-age=60, s-maxage=60` (a 60s CDN/browser cache) plus a 120s TanStack Query `staleTime`, on the reasoning that a bounded, disclosed staleness window was an acceptable trade-off for avoiding new infrastructure. In practice this produced a real, repeatedly-reported bug: a visitor could load the site and see the *old* photo/text for the first several seconds to a minute after an admin change, before it "caught up" to the new version — exactly the kind of "why does it look broken" impression a real business can't tolerate. `business_settings` (`getSettings`) was switched to `no-store` first for this reason; products and services get the identical fix here, extending the same reasoning consistently across every public read instead of leaving it half-applied.

Admin mutations (`saveProduct`/`toggleProduct`/`deleteProduct`, `saveService`/`toggleService`/`deleteService`, `saveSettings`) still additionally call `invalidateQueries` on the matching public + admin query keys immediately after a successful write, so the admin's own browser reflects the change instantly without even waiting on a network round trip — that part is unchanged.

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
| Any other visitor | Immediately — every public read is `no-store` with no client-side `staleTime`, so every page load/navigation fetches fresh data |

## Required environment variables

**None.** This implementation adds no new secrets, API tokens, or environment variables of any kind.

## Confirmed removed

- `src/lib/edge-cache.server.ts` (Cloudflare Workers `caches.default` wrapper) — deleted.
- All `withEdgeCache`/`purgeEdgeCache` imports and calls in `src/api/products/products.ts`, `src/api/services/services.ts`, `src/api/settings/settings.ts` — removed; those handlers now only set the plain `Cache-Control` header described above.
- Generated Cloudflare build artifacts (`.output/`, `.wrangler/`) — these were already gitignored (never committed) and have been deleted from disk since they were stale/misleading after the platform change.

## Future improvements (not built — would need real traffic/infrastructure to justify)

- **Reintroducing a short cache, correctly**: if database load ever becomes a real concern, the right fix is a short `stale-while-revalidate`-style CDN cache *plus* a purge-on-mutation call (Vercel's Data Cache / `revalidateTag`-style APIs), not a blind fixed TTL — a blind TTL is exactly what caused the staleness complaints this change fixes. Not worth building until traffic actually demonstrates the DB load is a problem; `no-store` is the correct default until then.
- **Redis/Upstash**: not needed today. Would become worth it if traffic grows enough that uncached reads meaningfully strain the database, or if `sendOtp`/`checkEmailAvailable`/`checkPhoneAvailable` need real cross-instance rate limiting beyond the current per-email database-backed cooldown.
