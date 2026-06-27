import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "../admin/middleware";

export const getProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("products").select("*").eq("is_active", true);
  return data ?? [];
});

export const getFeaturedProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("products").select("*").eq("is_active", true).order("created_at").limit(8);
  return data ?? [];
});

export const getProductById = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data: { id } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("products").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  });

export const getProductImages = createServerFn({ method: "GET" })
  .validator((d: { productId: string }) => d)
  .handler(async ({ data: { productId } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("product_images").select("*").eq("product_id", productId).order("sort_order");
    return data ?? [];
  });

export const getRelatedProducts = createServerFn({ method: "GET" })
  .validator((d: { id: string; category: string }) => d)
  .handler(async ({ data: { id, category } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("products").select("*").eq("is_active", true).eq("category", category).neq("id", id).limit(4);
    if (data && data.length < 4) {
      const { data: more } = await supabaseAdmin.from("products").select("*").eq("is_active", true).neq("id", id).neq("category", category).limit(4 - data.length);
      return [...data, ...(more ?? [])];
    }
    return data ?? [];
  });

export const getAdminProducts = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("products").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id?: string; payload: Record<string, unknown> }) => d)
  .handler(async ({ data: { id, payload } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const clean = {
      name: String(payload.name ?? ""),
      category: String(payload.category ?? ""),
      name_ar: (payload.name_ar as string) || null,
      description: (payload.description as string) || null,
      description_ar: (payload.description_ar as string) || null,
      image_url: (payload.image_url as string) || null,
      price: Number(payload.price) || 0,
      stock_quantity: Number(payload.stock_quantity) || 0,
      low_stock_threshold: Number(payload.low_stock_threshold) || 5,
      is_active: !!payload.is_active,
    };
    const op = id
      ? await supabaseAdmin.from("products").update(clean).eq("id", id)
      : await supabaseAdmin.from("products").insert(clean);
    if (op.error) throw op.error;
    return { success: true };
  });

export const toggleProduct = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string; currentActive: boolean }) => d)
  .handler(async ({ data: { id, currentActive } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("products").update({ is_active: !currentActive }).eq("id", id);
    if (error) throw error;
    return { success: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string }) => d)
  .handler(async ({ data: { id } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("products").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  });
