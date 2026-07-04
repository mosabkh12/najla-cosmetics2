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
    const { deleteOldImageIfUnreferenced } = await import("@/api/storage/storage");

    let previous: { hero_image_url: string | null; about_image_url: string | null } | null = null;
    if (id) {
      const { data } = await supabaseAdmin
        .from("business_settings")
        .select("hero_image_url, about_image_url")
        .eq("id", id)
        .maybeSingle();
      previous = data ?? null;
    }

    const lat = payload.latitude === "" || payload.latitude == null ? null : Number(payload.latitude);
    const lng = payload.longitude === "" || payload.longitude == null ? null : Number(payload.longitude);
    const clean = {
      business_name: String(payload.business_name ?? "Najla Cosmetics"),
      address: (payload.address as string) || null,
      phone: (payload.phone as string) || null,
      whatsapp_number: (payload.whatsapp_number as string) || null,
      google_maps_url: (payload.google_maps_url as string) || null,
      hero_image_url: (payload.hero_image_url as string) || null,
      about_image_url: (payload.about_image_url as string) || null,
      working_hours: (payload.working_hours as any) ?? null,
      latitude: lat != null && !isNaN(lat) ? lat : null,
      longitude: lng != null && !isNaN(lng) ? lng : null,
    };
    const op = id
      ? await supabaseAdmin.from("business_settings").update(clean).eq("id", id)
      : await supabaseAdmin.from("business_settings").insert(clean);
    if (op.error) throw op.error;

    // Only after the update has committed: clean up any replaced image
    // that's no longer referenced anywhere.
    if (previous?.hero_image_url && previous.hero_image_url !== clean.hero_image_url) {
      await deleteOldImageIfUnreferenced(supabaseAdmin, previous.hero_image_url);
    }
    if (previous?.about_image_url && previous.about_image_url !== clean.about_image_url) {
      await deleteOldImageIfUnreferenced(supabaseAdmin, previous.about_image_url);
    }

    return { success: true };
  });
