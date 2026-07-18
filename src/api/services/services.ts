import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin } from "../admin/middleware";

// No caching (see products.ts for the full rationale) — an admin's photo
// or field change must be visible immediately, not after an HTTP cache
// window elapses.
const PUBLIC_CACHE_HEADER = "no-store";

export const getServices = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("services")
    .select("*")
    .eq("is_active", true)
    .order("created_at");
  setResponseHeader("Cache-Control", PUBLIC_CACHE_HEADER);
  return data ?? [];
});

export const getAdminServices = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("services")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const saveService = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id?: string; payload: Record<string, unknown> }) => d)
  .handler(async ({ data: { id, payload } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteOldImageIfUnreferenced } = await import("@/api/storage/storage");

    let previousImageUrl: string | null = null;
    let previousThumbnailUrl: string | null = null;
    if (id) {
      const { data } = await supabaseAdmin
        .from("services")
        .select("image_url, thumbnail_url")
        .eq("id", id)
        .maybeSingle();
      previousImageUrl = data?.image_url ?? null;
      previousThumbnailUrl = data?.thumbnail_url ?? null;
    }

    const clean = {
      name: String(payload.name ?? ""),
      category: String(payload.category ?? ""),
      name_ar: (payload.name_ar as string) || null,
      name_en: (payload.name_en as string) || null,
      description: (payload.description as string) || null,
      description_ar: (payload.description_ar as string) || null,
      description_en: (payload.description_en as string) || null,
      image_url: (payload.image_url as string) || null,
      thumbnail_url: (payload.thumbnail_url as string) || null,
      price: Number(payload.price) || 0,
      duration_minutes: Number(payload.duration_minutes) || 30,
      is_active: !!payload.is_active,
    };
    const op = id
      ? await supabaseAdmin.from("services").update(clean).eq("id", id)
      : await supabaseAdmin.from("services").insert(clean);
    if (op.error) {
      // Thrown as a plain Error (not the raw PostgrestError) so the
      // message survives the server-function RPC boundary intact and
      // never leaks raw DB internals to the client — same reasoning as
      // the order/appointment RPCs' clean-code mapping.
      console.error("[saveService] failed", op.error);
      throw new Error("Failed to save service. Please check the details and try again.");
    }

    if (previousImageUrl && previousImageUrl !== clean.image_url) {
      await deleteOldImageIfUnreferenced(supabaseAdmin, previousImageUrl);
    }
    if (previousThumbnailUrl && previousThumbnailUrl !== clean.thumbnail_url) {
      await deleteOldImageIfUnreferenced(supabaseAdmin, previousThumbnailUrl);
    }

    return { success: true };
  });

export const toggleService = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string; currentActive: boolean }) => d)
  .handler(async ({ data: { id, currentActive } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("services")
      .update({ is_active: !currentActive })
      .eq("id", id);
    if (error) throw error;
    return { success: true };
  });

export const deleteService = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string }) => d)
  .handler(async ({ data: { id } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteOldImageIfUnreferenced } = await import("@/api/storage/storage");

    const { data: existing } = await supabaseAdmin
      .from("services")
      .select("image_url, thumbnail_url")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("services").delete().eq("id", id);
    if (error) {
      // Thrown as a plain Error (not the raw PostgrestError) so the
      // message survives the server-function RPC boundary intact and
      // never leaks raw DB internals to the client.
      console.error("[deleteService] failed", id, error);
      throw new Error("Failed to delete service. Please try again.");
    }

    if (existing?.image_url) {
      await deleteOldImageIfUnreferenced(supabaseAdmin, existing.image_url);
    }
    if (existing?.thumbnail_url) {
      await deleteOldImageIfUnreferenced(supabaseAdmin, existing.thumbnail_url);
    }

    return { success: true };
  });
