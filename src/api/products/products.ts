import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin } from "../admin/middleware";
import type { SupabaseAdmin } from "@/integrations/supabase/client.server";
import type { Lang } from "@/api/email/appointment-emails";

// Previously a 60s shared/browser cache (`public, max-age=60, s-maxage=60`)
// — that meant a newly-uploaded product photo (or any other product/
// service field change) could keep showing the old version to a new
// visitor for up to a minute, which is exactly the "why doesn't the new
// photo show up right away" complaint this fixes. Same reasoning already
// applied to business_settings (see settings.ts) — an admin's change here
// must be visible immediately, not after an HTTP cache window elapses.
const PUBLIC_CACHE_HEADER = "no-store";

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

const MAX_REVALIDATE_IDS = 50; // matches MAX_UNIQUE_PRODUCTS in orders.ts

// Public: lets the checkout page compare the customer's (possibly
// stale, localStorage-persisted) cart against live price/stock/
// availability before they submit — deliberately includes INACTIVE
// products (unlike getProductById) since "this got deactivated since
// you added it" is exactly one of the mismatches checkout needs to
// detect and show. Reveals nothing the customer doesn't already see in
// their own cart (they picked these ids themselves).
export const getProductsByIds = createServerFn({ method: "GET" })
  .validator((d: { ids: string[] }) => d)
  .handler(async ({ data: { ids } }) => {
    const uniqueIds = Array.from(new Set(ids)).slice(0, MAX_REVALIDATE_IDS);
    if (uniqueIds.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, name, price, stock_quantity, is_active")
      .in("id", uniqueIds);
    if (error) throw error;
    setResponseHeader("Cache-Control", PUBLIC_CACHE_HEADER);
    return data ?? [];
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

// Emails everyone who favorited this product that it's available again.
// Fire-and-forget from saveProduct — a failure here must never fail the
// admin's actual save, so every step is wrapped and logged rather than
// thrown. Runs one favoriter at a time (same pattern as
// notifyCancelledAppointments in slots.ts) since sendMail has no built-in
// batching and a partial failure shouldn't stop the rest from sending.
async function notifyRestockedFavoriters(
  supabaseAdmin: SupabaseAdmin,
  productId: string,
  productName: string,
  productImageUrl: string | null,
) {
  const { data: favorites } = await supabaseAdmin
    .from("favorites")
    .select("user_id")
    .eq("product_id", productId);
  if (!favorites || favorites.length === 0) return;

  const { sendBackInStockEmail } = await import("@/api/email/product-emails");
  for (const fav of favorites) {
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name, language")
        .eq("id", fav.user_id)
        .maybeSingle();
      if (profile?.email) {
        await sendBackInStockEmail({
          customerName: profile.full_name ?? "",
          customerEmail: profile.email,
          productName,
          productImageUrl,
          lang: profile.language as Lang,
        });
      }
    } catch (e) {
      console.error("[saveProduct] failed to notify favoriter", fav.user_id, e);
    }
  }
}

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id?: string; payload: Record<string, unknown> }) => d)
  .handler(async ({ data: { id, payload } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deleteOldImageIfUnreferenced } = await import("@/api/storage/storage");

    let previousImageUrl: string | null = null;
    let previousStockQuantity: number | null = null;
    if (id) {
      const { data } = await supabaseAdmin
        .from("products")
        .select("image_url, stock_quantity")
        .eq("id", id)
        .maybeSingle();
      previousImageUrl = data?.image_url ?? null;
      previousStockQuantity = data?.stock_quantity ?? null;
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
    if (op.error) {
      // Thrown as a plain Error (not the raw PostgrestError) so the
      // message survives the server-function RPC boundary intact and
      // never leaks raw DB internals to the client — same reasoning as
      // the order/appointment RPCs' clean-code mapping.
      console.error("[saveProduct] failed", op.error);
      throw new Error("Failed to save product. Please check the details and try again.");
    }

    if (previousImageUrl && previousImageUrl !== clean.image_url) {
      await deleteOldImageIfUnreferenced(supabaseAdmin, previousImageUrl);
    }

    // Only on the 0-or-less → positive transition, i.e. genuinely just
    // restocked — not on every save of an already-in-stock product, and
    // not on first insert (there are no favorites for a product that
    // doesn't exist yet).
    if (id && (previousStockQuantity ?? 0) <= 0 && clean.stock_quantity > 0) {
      notifyRestockedFavoriters(supabaseAdmin, id, clean.name, clean.image_url).catch((e) =>
        console.error("[saveProduct] restock notification pass failed", e),
      );
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
    if (error) {
      // Thrown as a plain Error (not the raw PostgrestError) so the
      // message survives the server-function RPC boundary intact and
      // never leaks raw DB internals to the client.
      console.error("[deleteProduct] failed", id, error);
      throw new Error("Failed to delete product. Please try again.");
    }

    if (existing?.image_url) {
      await deleteOldImageIfUnreferenced(supabaseAdmin, existing.image_url);
    }

    return { success: true };
  });
