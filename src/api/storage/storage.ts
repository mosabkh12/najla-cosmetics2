import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../admin/middleware";

export const getImageUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { fileName: string; folder: string }) => d)
  .handler(async ({ data: { fileName, folder } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = fileName.split(".").pop() || "jpg";
    const path = `${folder}/${Date.now()}.${ext}`;
    const { data } = supabaseAdmin.storage.from("images").getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  });
