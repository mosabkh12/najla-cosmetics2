import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin } from "../admin/middleware";

// Fixed, honest 60s ceiling — no stale-while-revalidate. swr would let a
// shared cache keep serving a stale copy for minutes after the 60s mark
// while it refetches in the background; a hard s-maxage means any cache
// respecting this header cannot serve it past 60s, period. Also carries
// max-age so a private/browser cache (which ignores s-maxage) gets the
// same 60s lifetime. These handlers take no auth-derived context (no
// requireSupabaseAuth/requireAdmin middleware, never read context.userId),
// so the response is identical for every caller regardless of session —
// safe to mark `public` even though a logged-in browser's request may
// still carry an Authorization header (irrelevant to the response). Set
// only on the success path so an error response never gets tagged cacheable.
//
// This is plain standard HTTP caching only — no custom edge cache, no
// purge API, no external service. Vercel's CDN (and any browser) honors
// this header directly; freshness after an admin change is bounded by
// this 60s ceiling. See CACHING.md.
const PUBLIC_CACHE_HEADER = "public, max-age=60, s-maxage=60";

export const getProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("products").select("*").eq("is_active", true);
  setResponseHeader("Cache-Control", PUBLIC_CACHE_HEADER);
  return data ?? [];
});

export const getFeaturedProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at")
    .limit(8);
  setResponseHeader("Cache-Control", PUBLIC_CACHE_HEADER);
  return data ?? [];
});

// Public: only ever returns an active product. A disabled/hidden
// product's id is not a secret (it may still be linked from an old
// share/bookmark), so this must not leak its data just because the
// caller knows its id. No inactive-product equivalent exists because
// nothing in the admin UI fetches a single product by id today (it
// works off the full getAdminProducts list) — add one deliberately if
// that ever changes, rather than relaxing this filter.
export const getProductById = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data: { id } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    setResponseHeader("Cache-Control", PUBLIC_CACHE_HEADER);
    return data;
  });

// Public: images for an inactive product are exactly as sensitive as
// the product itself, so this checks is_active before returning
// anything from product_images rather than trusting the caller to
// only ever ask about active products.
export const getProductImages = createServerFn({ method: "GET" })
  .validator((d: { productId: string }) => d)
  .handler(async ({ data: { productId } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("is_active", true)
      .maybeSingle();
    setResponseHeader("Cache-Control", PUBLIC_CACHE_HEADER);
    if (!product) return [];

    const { data } = await supabaseAdmin
      .from("product_images")
      .select("*")
      .eq("product_id", productId)
      .order("sort_order");
    return data ?? [];
  });

export const getRelatedProducts = createServerFn({ method: "GET" })
  .validator((d: { id: string; category: string }) => d)
  .handler(async ({ data: { id, category } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("is_active", true)
      .eq("category", category)
      .neq("id", id)
      .limit(4);
    setResponseHeader("Cache-Control", PUBLIC_CACHE_HEADER);
    if (data && data.length < 4) {
      const { data: more } = await supabaseAdmin
        .from("products")
        .select("*")
        .eq("is_active", true)
        .neq("id", id)
        .neq("category", category)
        .limit(4 - data.length);
      return [...data, ...(more ?? [])];
    }
    return data ?? [];
  });

export const getAdminProducts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id?: string; payload: Record<string, unknown> }) => d)
  .handler(async ({ data: { id, payload } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteOldImageIfUnreferenced } = await import("@/api/storage/storage");

    let previousImageUrl: string | null = null;
    if (id) {
      const { data } = await supabaseAdmin
        .from("products")
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
      skin_type: (payload.skin_type as string) || null,
      stock_quantity: Number(payload.stock_quantity) || 0,
      low_stock_threshold: Number(payload.low_stock_threshold) || 5,
      is_active: !!payload.is_active,
    };
    const op = id
      ? await supabaseAdmin.from("products").update(clean).eq("id", id)
      : await supabaseAdmin.from("products").insert(clean);
    if (op.error) throw op.error;

    if (previousImageUrl && previousImageUrl !== clean.image_url) {
      await deleteOldImageIfUnreferenced(supabaseAdmin, previousImageUrl);
    }

    return { success: true };
  });

export const toggleProduct = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string; currentActive: boolean }) => d)
  .handler(async ({ data: { id, currentActive } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("products")
      .update({ is_active: !currentActive })
      .eq("id", id);
    if (error) throw error;
    return { success: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string }) => d)
  .handler(async ({ data: { id } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteOldImageIfUnreferenced } = await import("@/api/storage/storage");

    const { data: existing } = await supabaseAdmin
      .from("products")
      .select("image_url")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("products").delete().eq("id", id);
    if (error) throw error;

    if (existing?.image_url) {
      await deleteOldImageIfUnreferenced(supabaseAdmin, existing.image_url);
    }

    return { success: true };
  });
