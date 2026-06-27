import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../admin/middleware";

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("business_settings").select("*").maybeSingle();
  return data;
});

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id?: string; payload: Record<string, unknown> }) => d)
  .handler(async ({ data: { id, payload } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const clean = {
      business_name: String(payload.business_name ?? "Najla Cosmetics"),
      address: (payload.address as string) || null,
      phone: (payload.phone as string) || null,
      whatsapp_number: (payload.whatsapp_number as string) || null,
      google_maps_url: (payload.google_maps_url as string) || null,
      hero_image_url: (payload.hero_image_url as string) || null,
      about_image_url: (payload.about_image_url as string) || null,
      working_hours: (payload.working_hours as any) ?? null,
    };
    const op = id
      ? await supabaseAdmin.from("business_settings").update(clean).eq("id", id)
      : await supabaseAdmin.from("business_settings").insert(clean);
    if (op.error) throw op.error;
    return { success: true };
  });
