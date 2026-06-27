import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle();
    return data;
  });

export const checkPhoneAvailable = createServerFn({ method: "GET" })
  .validator((d: { phone: string }) => d)
  .handler(async ({ data: { phone } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cleaned = phone.replace(/\D/g, "");
    if (!cleaned) return { available: true };
    const { data } = await supabaseAdmin.from("profiles").select("id").eq("phone", cleaned).limit(1);
    return { available: !data || data.length === 0 };
  });

export const checkEmailAvailable = createServerFn({ method: "GET" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data: { email } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.admin.listUsers();
    const exists = (data?.users ?? []).some((u) => u.email?.toLowerCase() === email.toLowerCase());
    return { available: !exists };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { full_name: string; phone: string }) => d)
  .handler(async ({ data: { full_name, phone }, context }) => {
    const { error } = await context.supabase.from("profiles").update({ full_name, phone }).eq("id", context.userId);
    if (error) throw error;
    return { success: true };
  });
