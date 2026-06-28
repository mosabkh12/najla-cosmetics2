import { createServerFn } from "@tanstack/react-start";
import { randomInt } from "crypto";

export const sendOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string }) => d)
  .handler(async ({ data: { email } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMail } = await import("@/api/email/mailer");

    const otp = String(randomInt(100000, 999999));
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const emailLower = email.toLowerCase().trim();

    const { error: delError } = await supabaseAdmin.from("verification_otps").delete().eq("email", emailLower);
    if (delError) throw new Error("Failed to prepare verification");

    const { error: insError } = await supabaseAdmin.from("verification_otps").insert({ email: emailLower, otp, expires_at });
    if (insError) throw new Error("Failed to create verification code");

    await sendMail(
      emailLower,
      "Najla Cosmetics — Verification Code",
      `<div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:40px 24px;text-align:center;">
        <h1 style="font-size:24px;font-weight:600;color:#1b1c1c;margin-bottom:8px;">Najla Cosmetics</h1>
        <p style="font-size:14px;color:#615e57;margin-bottom:32px;">Your verification code</p>
        <div style="background:#f6f3f2;border-radius:16px;padding:24px;margin-bottom:24px;">
          <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1b1c1c;">${otp}</span>
        </div>
        <p style="font-size:13px;color:#615e57;">This code expires in 10 minutes.</p>
        <p style="font-size:12px;color:#999;margin-top:24px;">If you didn't request this, ignore this email.</p>
      </div>`,
    );

    return { success: true };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string; otp: string }) => d)
  .handler(async ({ data: { email, otp } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emailLower = email.toLowerCase().trim();

    const { data, error } = await supabaseAdmin
      .from("verification_otps")
      .select("*")
      .eq("email", emailLower)
      .eq("otp", otp)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !data) throw new Error("INVALID_OTP");

    await supabaseAdmin.from("verification_otps").update({ used: true }).eq("id", data.id);

    const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
    const user = userData?.users?.find((u) => u.email?.toLowerCase() === emailLower);
    if (user) {
      await supabaseAdmin
        .from("profiles")
        .update({ email_verified: true, email: emailLower })
        .eq("id", user.id);
    }

    return { success: true };
  });

export const checkVerified = createServerFn({ method: "GET" })
  .validator((d: { userId: string }) => d)
  .handler(async ({ data: { userId } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("email_verified")
      .eq("id", userId)
      .maybeSingle();
    return { verified: !!data?.email_verified };
  });
