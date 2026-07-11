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
// Tried in order until the encoded blob fits under the server's upload cap
// (see MAX_UPLOAD_BYTES) — starts sharp and only steps down for the rare
// busy/high-detail photo that would otherwise come out over the limit at
// the highest quality.
const JPEG_QUALITIES = [0.92, 0.85, 0.75, 0.65];
// Mirrors the server's own post-resize cap (src/api/storage/storage.ts
// MAX_FILE_SIZE) minus headroom for base64 overhead, so we never send a
// blob the server is guaranteed to reject.
const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024;

export interface ResizedImage {
  blob: Blob;
  contentType: string;
}

// Falls back to the original file untouched if resizing isn't possible in
// this browser (createImageBitmap/canvas unsupported, or a corrupt file) —
// upload should still be attempted rather than blocked outright.
export async function resizeImageForUpload(file: File): Promise<ResizedImage> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
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
    bitmap.close();

    let blob: Blob | null = null;
    for (const quality of JPEG_QUALITIES) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= MAX_UPLOAD_BYTES) break;
    }
    if (!blob) throw new Error("ENCODE_FAILED");
    return { blob, contentType: "image/jpeg" };
  } catch {
    return { blob: file, contentType: file.type };
  }
}
