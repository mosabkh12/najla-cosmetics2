import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkFavorite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { productId: string }) => d)
  .handler(async ({ data: { productId }, context }) => {
    const { data } = await context.supabase
      .from("favorites")
      .select("id")
      .eq("user_id", context.userId)
      .eq("product_id", productId)
      .maybeSingle();
    return !!data;
  });

export const getUserFavorites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("favorites")
      .select("products(*)")
      .eq("user_id", context.userId);
    return (data ?? []).map((r) => r.products).filter(Boolean);
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { productId: string }) => d)
  .handler(async ({ data: { productId }, context }) => {
    const { data: existing } = await context.supabase
      .from("favorites")
      .select("id")
      .eq("user_id", context.userId)
      .eq("product_id", productId)
      .maybeSingle();
    if (existing) {
      await context.supabase
        .from("favorites")
        .delete()
        .eq("user_id", context.userId)
        .eq("product_id", productId);
      return { favorited: false };
    }
    await context.supabase
      .from("favorites")
      .insert({ user_id: context.userId, product_id: productId });
    return { favorited: true };
  });
