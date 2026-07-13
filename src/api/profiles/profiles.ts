import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit, getClientIp } from "@/api/rate-limit/rate-limit.server";

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    return data;
  });

export const checkPhoneAvailable = createServerFn({ method: "GET" })
  .validator((d: { phone: string }) => d)
  .handler(async ({ data: { phone } }) => {
    await enforceRateLimit({
      action: "check_phone_available",
      identifier: getClientIp(),
      windowSeconds: 5 * 60,
      max: 30,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cleaned = phone.replace(/\D/g, "");
    if (!cleaned) return { available: true };
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", cleaned)
      .limit(1);
    return { available: !data || data.length === 0 };
  });

export const checkEmailAvailable = createServerFn({ method: "GET" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data: { email } }) => {
    await enforceRateLimit({
      action: "check_email_available",
      identifier: getClientIp(),
      windowSeconds: 5 * 60,
      max: 30,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.admin.listUsers();
    const exists = (data?.users ?? []).some((u) => u.email?.toLowerCase() === email.toLowerCase());
    return { available: !exists };
  });

// Only these fields may ever be changed by a customer through this
// function. `role`, `email`, `email_verified`, `id`, `created_at`, and
// `updated_at` are intentionally never accepted here — they're either
// server-managed or security-sensitive (see the profiles_own_update RLS
// policy removal in supabase/migrations for why this matters).
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { full_name: string; phone: string }) => d)
  .handler(async ({ data: { full_name, phone }, context }) => {
    if (typeof full_name !== "string" || typeof phone !== "string") {
      throw new Error("Invalid profile data");
    }

    const trimmedName = full_name.trim().slice(0, 255);
    if (!trimmedName) throw new Error("Full name is required");

    // Same normalization convention as checkPhoneAvailable — digits only.
    const cleanedPhone = phone.replace(/\D/g, "").slice(0, 20);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: trimmedName, phone: cleanedPhone })
      .eq("id", context.userId);

    if (error) {
      console.error("[updateProfile] failed for user", context.userId, error);
      throw new Error("Could not update profile. Please try again.");
    }
    return { success: true };
  });
