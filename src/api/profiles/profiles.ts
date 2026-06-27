import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle();
    return data;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { full_name: string; phone: string }) => d)
  .handler(async ({ data: { full_name, phone }, context }) => {
    const { error } = await context.supabase.from("profiles").update({ full_name, phone }).eq("id", context.userId);
    if (error) throw error;
    return { success: true };
  });
