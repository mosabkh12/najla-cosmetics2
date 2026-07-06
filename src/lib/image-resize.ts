// Modern phone photos are routinely 3000-4000px+ and several MB — sent
// as-is (base64-encoded, ~33% larger again), that can exceed the hosting
// platform's request body limit and simply fail to upload, with no clear
// reason why. Downscaling to a sane display size before upload fixes both
// reliability (small, predictable payload) and how sharp the image looks
// (a properly resized photo at the resolution it's actually shown at
// beats a huge original squeezed into a small container, or a crude
// manual shrink someone did just to get under a size limit).
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;

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
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("ENCODE_FAILED");
    return { blob, contentType: "image/jpeg" };
  } catch {
    return { blob: file, contentType: file.type };
  }
}
