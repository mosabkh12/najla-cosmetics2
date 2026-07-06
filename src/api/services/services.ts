import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin } from "../admin/middleware";

// Fixed, honest 60s ceiling — no stale-while-revalidate (see products.ts
// for the full rationale). Fully public, read-only, non-personalized data
// (no auth middleware, never reads context.userId) — safe to shared-cache
// regardless of caller session. Set only on the success path so an error
// response is never tagged cacheable.
//
// Plain standard HTTP caching only — no custom edge cache, no purge API,
// no external service. See CACHING.md.
const PUBLIC_CACHE_HEADER = "public, max-age=60, s-maxage=60";

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
    if (id) {
      const { data } = await supabaseAdmin
        .from("services")
        .select("image_url")
        .eq("id", id)
        .maybeSingle();
      previousImageUrl = data?.image_url ?? null;
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
      price: Number(payload.price) || 0,
      duration_minutes: Number(payload.duration_minutes) || 30,
      is_active: !!payload.is_active,
    };
    const op = id
      ? await supabaseAdmin.from("services").update(clean).eq("id", id)
      : await supabaseAdmin.from("services").insert(clean);
    if (op.error) throw op.error;

    if (previousImageUrl && previousImageUrl !== clean.image_url) {
      await deleteOldImageIfUnreferenced(supabaseAdmin, previousImageUrl);
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
      .select("image_url")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("services").delete().eq("id", id);
    if (error) throw error;

    if (existing?.image_url) {
      await deleteOldImageIfUnreferenced(supabaseAdmin, existing.image_url);
    }

    return { success: true };
  });
