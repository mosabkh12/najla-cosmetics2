import { createServerFn } from "@tanstack/react-start";

// Account creation requires a verification_token proving the caller
// already completed OTP verification for this exact email (see
// verifyOtp in otp.ts) — the browser can never claim "verified" on its
// own. role and email_verified are never accepted from the browser;
// role always defaults to 'customer' via the handle_new_user trigger,
// and email_verified is set true here only after the token has been
// validated below.
export const adminSignUp = createServerFn({ method: "POST" })
  .validator(
    (d: { email: string; password: string; full_name: string; phone: string; verification_token: string }) => d,
  )
  .handler(async ({ data: { email, password, full_name, phone, verification_token } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashToken } = await import("@/api/auth/crypto.server");

    const emailLower = (email ?? "").toLowerCase().trim();
    const rawToken = (verification_token ?? "").trim();
    if (!emailLower || !rawToken) throw new Error("VERIFICATION_REQUIRED");

    const tokenHash = hashToken(rawToken);

    // Atomically claim the token: must exist, match this exact email,
    // be unexpired, and not already used. Marking it used in the same
    // UPDATE (WHERE used_at IS NULL) is what makes it single-use and
    // prevents replaying one verified OTP into multiple accounts.
    const { data: claimed } = await supabaseAdmin
      .from("signup_verification_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("email", emailLower)
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();

    if (!claimed) throw new Error("VERIFICATION_REQUIRED");

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: emailLower,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone },
    });

    // Generic error only — never reveal whether the email is already
    // registered or leak any other Supabase Auth internal detail.
    if (error || !data?.user) throw new Error("SIGNUP_FAILED");

    await supabaseAdmin
      .from("profiles")
      .update({ email_verified: true, email: emailLower })
      .eq("id", data.user.id);

    return { userId: data.user.id };
  });
