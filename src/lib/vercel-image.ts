// Builds URLs for Vercel's built-in Image Optimization endpoint
// (/_vercel/image) — resizes and re-encodes (AVIF/WebP via content
// negotiation) on the fly. This is a Vercel platform feature, not a
// package, configured entirely via the `images` key in vercel.json —
// ALLOWED_WIDTHS here must stay in sync with that file's `images.sizes`,
// since a width outside that list gets rejected by the endpoint.
//
// Works for both same-origin paths (/images/brand/hero.png) and the
// external Supabase Storage URLs admin-uploaded photos live at (matched
// against vercel.json's `images.remotePatterns`).
export const ALLOWED_WIDTHS = [
  384, 480, 640, 750, 828, 1080, 1280, 1600, 1920, 2048, 2560,
] as const;
export type AllowedWidth = (typeof ALLOWED_WIDTHS)[number];

export function vercelImageUrl(src: string, width: AllowedWidth, quality: 75 | 80 = 80): string {
  return `/_vercel/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}

export function vercelImageSrcSet(
  src: string,
  widths: AllowedWidth[],
  quality: 75 | 80 = 80,
): string {
  return widths.map((w) => `${vercelImageUrl(src, w, quality)} ${w}w`).join(", ");
}
