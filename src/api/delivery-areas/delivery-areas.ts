import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin } from "../admin/middleware";

// Fixed, honest 60s ceiling — no stale-while-revalidate (see products.ts
// for the full rationale). Fully public, read-only, non-personalized data
// (no auth middleware, never reads context.userId) — safe to shared-cache
// regardless of caller session. Set only on the success path so an error
// response is never tagged cacheable.
const PUBLIC_CACHE_HEADER = "public, max-age=60, s-maxage=60";

export const getDeliveryAreas = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("delivery_areas")
    .select("*")
    .eq("is_active", true)
    .order("price");
  setResponseHeader("Cache-Control", PUBLIC_CACHE_HEADER);
  return data ?? [];
});

export const getAdminDeliveryAreas = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("delivery_areas")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const saveDeliveryArea = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id?: string; payload: Record<string, unknown> }) => d)
  .handler(async ({ data: { id, payload } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const clean = {
      name: String(payload.name ?? ""),
      name_ar: (payload.name_ar as string) || null,
      name_en: (payload.name_en as string) || null,
      price: Number(payload.price) || 0,
      is_active: !!payload.is_active,
    };
    if (!clean.name.trim()) throw new Error("INVALID_DELIVERY_AREA");
    if (clean.price < 0) throw new Error("INVALID_DELIVERY_AREA");

    const op = id
      ? await supabaseAdmin.from("delivery_areas").update(clean).eq("id", id)
      : await supabaseAdmin.from("delivery_areas").insert(clean);
    if (op.error) {
      // Thrown as a plain Error (not the raw PostgrestError) so the
      // message survives the server-function RPC boundary intact and
      // never leaks raw DB internals to the client.
      console.error("[saveDeliveryArea] failed", op.error);
      throw new Error("Failed to save delivery area. Please check the details and try again.");
    }

    return { success: true };
  });

export const toggleDeliveryArea = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string; currentActive: boolean }) => d)
  .handler(async ({ data: { id, currentActive } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("delivery_areas")
      .update({ is_active: !currentActive })
      .eq("id", id);
    if (error) throw error;
    return { success: true };
  });

export const deleteDeliveryArea = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string }) => d)
  .handler(async ({ data: { id } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("delivery_areas").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  });
