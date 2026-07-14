import { uploadAdminImage } from "@/api/storage/storage";
import { resizeImageForUpload } from "@/lib/image-resize";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
// This is the SOURCE file size cap, before client-side resizing — generous
// because resizeImageForUpload downscales/recompresses before anything is
// sent to the server, so the actual upload payload ends up small and
// reliable regardless of how large the original photo was. Without that
// resize step, a raw file anywhere near this size would base64-encode to
// well over hosting platforms' request body limits (commonly ~4.5MB) and
// simply fail with no clear reason why — this is what used to make
// uploads "not always work."
export const MAX_SOURCE_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export const UPLOAD_ERROR_MAP: Record<string, string> = {
  INVALID_FILE_TYPE: "Please select a JPEG, PNG, or WEBP image",
  FILE_TOO_LARGE: "Image must be under 20MB",
  INVALID_FOLDER: "Upload failed",
  INVALID_FILE: "Please select a valid image file",
  UPLOAD_FAILED: "Upload failed, please try again",
  RATE_LIMITED: "Too many uploads. Please try again later.",
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Uploads go through the requireAdmin-protected uploadAdminImage server
// function — the browser never writes to Supabase Storage directly. The
// file is resized/recompressed client-side first (see image-resize.ts) so
// the actual network payload stays small and sharp regardless of how large
// the original photo was. `folder` must be one of storage.ts's
// ALLOWED_FOLDERS ("products" | "services" | "settings").
export async function uploadImageFile(file: File, folder: string): Promise<string | null> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    toast.error(UPLOAD_ERROR_MAP.INVALID_FILE_TYPE);
    return null;
  }
  if (file.size > MAX_SOURCE_FILE_SIZE) {
    toast.error(UPLOAD_ERROR_MAP.FILE_TOO_LARGE);
    return null;
  }
  try {
    const { blob, contentType } = await resizeImageForUpload(file);
    const base64 = await blobToBase64(blob);
    const { publicUrl } = await uploadAdminImage({
      data: { folder, contentType, base64 },
    });
    return publicUrl;
  } catch (e: unknown) {
    const message = getErrorMessage(e);
    toast.error(UPLOAD_ERROR_MAP[message] ?? "Upload failed, please try again");
    return null;
  }
}
