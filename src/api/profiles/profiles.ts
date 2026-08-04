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

// Same shape as EMAIL_RE in src/routes/auth.tsx — kept in sync intentionally
// so a string the client considers a well-formed email is never rejected
// here as malformed.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const checkEmailAvailable = createServerFn({ method: "GET" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data: { email } }) => {
    await enforceRateLimit({
      action: "check_email_available",
      identifier: getClientIp(),
      windowSeconds: 5 * 60,
      max: 30,
    });

    // The validator only casts the shape at compile time — it performs no
    // runtime check, so a malformed/missing/non-string payload must still
    // be rejected here explicitly rather than trusted.
    if (typeof email !== "string") throw new Error("INVALID_EMAIL");
    const emailLower = email.trim().toLowerCase();
    if (!EMAIL_RE.test(emailLower)) throw new Error("INVALID_EMAIL");

    // Every account is created via adminSignUp (src/api/auth/signup.ts),
    // which always lowercases+trims the email before it ever reaches
    // Supabase Auth, and handle_new_user() mirrors auth.users.email onto
    // profiles.email on every insert (and on conflict). There is no
    // email-change feature anywhere in the app, so profiles.email never
    // drifts from what was set at signup — it's a reliable, indexed
    // (idx_profiles_email) mirror, safe to query directly instead of
    // paging through every Supabase Auth user.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", emailLower)
      .limit(1);

    // A failed query must never be read as "no matching row" — that would
    // silently report a taken email as available. Log the real cause
    // server-side only; the client gets a generic, DB-detail-free message.
    if (error) {
      console.error("[checkEmailAvailable] query failed", error);
      throw new Error("Could not check email availability. Please try again.");
    }

    return { available: (data ?? []).length === 0 };
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

const VALID_LANGUAGES = ["he", "ar", "en"];

// Keeps the server-side record of the customer's language in sync with
// the site's language switcher (see Header.tsx) whenever they're logged
// in — this is the only way transactional emails (sent from server
// functions, with no access to the browser's localStorage) know which
// language a customer reads. Silently ignored if it fails; language
// preference is a nice-to-have, never something that should block
// browsing or surface an error to the customer.
export const updateProfileLanguage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { language: string }) => d)
  .handler(async ({ data: { language }, context }) => {
    if (!VALID_LANGUAGES.includes(language)) throw new Error("Invalid language");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ language })
      .eq("id", context.userId);

    if (error) {
      console.error("[updateProfileLanguage] failed for user", context.userId, error);
      throw new Error("Could not update language preference.");
    }
    return { success: true };
  });
