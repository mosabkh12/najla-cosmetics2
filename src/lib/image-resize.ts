// Modern phone photos are routinely 3000-4000px+ and several MB — sent
// as-is (base64-encoded, ~33% larger again), that can exceed the hosting
// platform's request body limit and simply fail to upload, with no clear
// reason why. Downscaling to a sane display size before upload fixes both
// reliability (small, predictable payload) and how sharp the image looks
// (a properly resized photo at the resolution it's actually shown at
// beats a huge original squeezed into a small container, or a crude
// manual shrink someone did just to get under a size limit).
// 2560 (not 1920) because these photos render full-bleed at up to full
// viewport width, and on high-DPI/Retina screens the browser needs roughly
// 2x the CSS pixel width in actual source pixels to look sharp — a 1920px
// source stretched across a wide hero on a Retina display looks visibly
// soft even though it looked fine on the admin's own screen while uploading.
const MAX_DIMENSION = 2560;
// Product/service grid cards (home page, products list, services list,
// related-products) render this at a few hundred CSS pixels wide — 480
// comfortably covers that even at 2x DPI, without dragging along the
// hero-sized full image just to shrink it in CSS.
const THUMBNAIL_MAX_DIMENSION = 480;
// Tried in order until the encoded blob fits under the server's upload cap
// (see MAX_UPLOAD_BYTES) — starts sharp and only steps down for the rare
// busy/high-detail photo that would otherwise come out over the limit at
// the highest quality.
const JPEG_QUALITIES = [0.92, 0.85, 0.75, 0.65];
// Fixed (not stepped like JPEG_QUALITIES above) — at 480px a JPEG is
// nowhere near MAX_UPLOAD_BYTES regardless of quality, so there's nothing
// to step down for.
const THUMBNAIL_QUALITY = 0.82;
// Mirrors the server's own post-resize cap (src/api/storage/storage.ts
// MAX_FILE_SIZE) minus headroom for base64 overhead, so we never send a
// blob the server is guaranteed to reject.
const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;

export interface ResizedImage {
  blob: Blob;
  contentType: string;
}

export interface ResizedImageWithThumbnail extends ResizedImage {
  thumbnail: ResizedImage;
}

function drawResized(bitmap: ImageBitmap, maxDimension: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_UNSUPPORTED");
  // Browsers default imageSmoothingQuality to "low", which visibly
  // softens the downscale itself — "high" uses a better resampling
  // filter so the resized image stays sharp, not just small.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

async function encodeJpeg(canvas: HTMLCanvasElement, qualities: number[]): Promise<Blob> {
  let blob: Blob | null = null;
  for (const quality of qualities) {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (blob && blob.size <= MAX_UPLOAD_BYTES) break;
  }
  if (!blob) throw new Error("ENCODE_FAILED");
  return blob;
}

// Falls back to the original file untouched if resizing isn't possible in
// this browser (createImageBitmap/canvas unsupported, or a corrupt file) —
// upload should still be attempted rather than blocked outright.
export async function resizeImageForUpload(file: File): Promise<ResizedImage> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = drawResized(bitmap, MAX_DIMENSION);
    bitmap.close();
    const blob = await encodeJpeg(canvas, JPEG_QUALITIES);
    return { blob, contentType: "image/jpeg" };
  } catch {
    return { blob: file, contentType: file.type };
  }
}

// Same source decode, drawn twice (full + thumbnail) rather than calling
// resizeImageForUpload twice, which would decode the file from scratch
// again for no reason. Used wherever the image also needs a small grid-
// card variant (see ImageUploadField's thumbnailValue/onThumbnailChange).
// Falls back to using the full image as its own "thumbnail" if resizing
// isn't possible — the upload itself must never fail just because the
// smaller variant couldn't be produced.
export async function resizeImageWithThumbnail(file: File): Promise<ResizedImageWithThumbnail> {
  try {
    const bitmap = await createImageBitmap(file);
    const fullCanvas = drawResized(bitmap, MAX_DIMENSION);
    const thumbCanvas = drawResized(bitmap, THUMBNAIL_MAX_DIMENSION);
    bitmap.close();
    const [blob, thumbBlob] = await Promise.all([
      encodeJpeg(fullCanvas, JPEG_QUALITIES),
      encodeJpeg(thumbCanvas, [THUMBNAIL_QUALITY]),
    ]);
    return {
      blob,
      contentType: "image/jpeg",
      thumbnail: { blob: thumbBlob, contentType: "image/jpeg" },
    };
  } catch {
    const fallback: ResizedImage = { blob: file, contentType: file.type };
    return { ...fallback, thumbnail: fallback };
  }
}
