import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "crypto";
import { requireAdmin } from "../admin/middleware";

// Only folders the app actually writes to today. Add a new entry here
// (and a matching feature) before any code can target it — the browser
// can never choose an arbitrary path.
const ALLOWED_FOLDERS = ["products", "services", "settings"] as const;
type AllowedFolder = (typeof ALLOWED_FOLDERS)[number];

// Deliberately excludes GIF/MP4 — every current image field renders as
// a plain <img>, never <video>, so there's no genuine need for them.
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB, matches the bucket's own file_size_limit
const IMAGES_BUCKET = "images";

// Admin-only. Direct browser writes to the `images` bucket are revoked
// at the storage RLS level (see the accompanying migration) — this is
// now the only way any image gets uploaded. The filename is always
// server-generated (random UUID + extension derived from the
// validated content type), never taken from the browser-supplied file
// name, and the folder is checked against a fixed allowlist so a
// caller can't write outside the intended admin-owned prefixes.
export const uploadAdminImage = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { folder: string; contentType: string; base64: string }) => d)
  .handler(async ({ data }) => {
    if (!ALLOWED_FOLDERS.includes(data.folder as AllowedFolder)) {
      throw new Error("INVALID_FOLDER");
    }

    const ext = ALLOWED_MIME_TYPES[data.contentType];
    if (!ext) throw new Error("INVALID_FILE_TYPE");

    let buffer: Buffer;
    try {
      buffer = Buffer.from(data.base64, "base64");
    } catch {
      throw new Error("INVALID_FILE");
    }
    if (buffer.length === 0 || buffer.length > MAX_FILE_SIZE) {
      throw new Error("FILE_TOO_LARGE");
    }

    const path = `${data.folder}/${randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from(IMAGES_BUCKET).upload(path, buffer, {
      contentType: data.contentType,
      upsert: false,
      // Path is a server-generated random UUID that is never reused or
      // overwritten (upsert: false, enforced above) — safe to cache for a
      // full year. The Supabase Storage SDK only exposes the max-age
      // portion of Cache-Control via this option (it emits
      // `Cache-Control: max-age=<seconds>`); the bucket itself is
      // read-public (see supabase/migrations security_hardening /
      // secure_storage_images_bucket), which is what makes `public`
      // effectively apply on the served object. Never reuse this long
      // duration for any path that can be overwritten (upsert: true).
      cacheControl: "31536000",
    });

    if (error) {
      console.error("[uploadAdminImage] failed", error);
      throw new Error("UPLOAD_FAILED");
    }

    const { data: pub } = supabaseAdmin.storage.from(IMAGES_BUCKET).getPublicUrl(path);
    return { publicUrl: pub.publicUrl };
  });

// Recognizes only genuine public URLs for THIS project's `images`
// bucket, in one of the allowed folders, with a plain generated
// filename — anything else (external URLs, other buckets, malformed
// values, path traversal, empty segments) returns null and must never
// be deleted. The prefix is deriv  ed from the actual configured
// SUPABASE_URL, not a generic "supabase.co" string match.
function extractImagesBucketPath(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) return null;

  const prefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${IMAGES_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;

  const rest = url.slice(prefix.length).split(/[?#]/)[0];
  if (!rest) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    return null;
  }
  if (decoded.includes("..")) return null;

  const segments = decoded.split("/").filter((s) => s.length > 0);
  if (segments.length !== 2) return null; // must be exactly "<folder>/<filename>"

  const [folder, filename] = segments;
  if (!ALLOWED_FOLDERS.includes(folder as AllowedFolder)) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return null;

  return `${folder}/${filename}`;
}

// Deletes an old admin-managed image from storage, but only when:
//   1. it genuinely belongs to this project's images bucket
//      (extractImagesBucketPath rejects everything else, including
//      external URLs — those are never touched);
//   2. no other product/service/business_settings/gallery row still
//      references the exact same URL.
// Must only be called AFTER the database change that stopped
// referencing `oldUrl` has already committed successfully, so a
// still-in-use image is never deleted out from under a live record.
// Never throws — failures are logged and swallowed so a cleanup
// problem can never fail the admin action that triggered it.
export async function deleteOldImageIfUnreferenced(
  supabaseAdmin: any,
  oldUrl: string | null | undefined,
): Promise<void> {
  const path = extractImagesBucketPath(oldUrl);
  if (!path) return;

  try {
    // Plain .eq() filters only (no .or() string interpolation) — every
    // value is passed as a real query parameter, never concatenated
    // into a filter expression.
    const [productsRes, servicesRes, heroRes, aboutRes, galleryRes] = await Promise.all([
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }).eq("image_url", oldUrl),
      supabaseAdmin.from("services").select("id", { count: "exact", head: true }).eq("image_url", oldUrl),
      supabaseAdmin.from("business_settings").select("id", { count: "exact", head: true }).eq("hero_image_url", oldUrl),
      supabaseAdmin.from("business_settings").select("id", { count: "exact", head: true }).eq("about_image_url", oldUrl),
      supabaseAdmin.from("product_images").select("id", { count: "exact", head: true }).eq("image_url", oldUrl),
    ]);

    const stillReferenced =
      (productsRes.count ?? 0) > 0 ||
      (servicesRes.count ?? 0) > 0 ||
      (heroRes.count ?? 0) > 0 ||
      (aboutRes.count ?? 0) > 0 ||
      (galleryRes.count ?? 0) > 0;

    if (stillReferenced) return;

    const { error } = await supabaseAdmin.storage.from(IMAGES_BUCKET).remove([path]);
    if (error) console.error("[deleteOldImageIfUnreferenced] failed to remove", path, error);
  } catch (e) {
    console.error("[deleteOldImageIfUnreferenced] reference check failed for", path, e);
  }
}
