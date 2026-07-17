import { createServerFn } from "@tanstack/react-start";
import { randomInt } from "crypto";
import { enforceRateLimit, getClientIp } from "@/api/rate-limit/rate-limit.server";

const OTP_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_FAILED_ATTEMPTS = 5;

// This is the one email sent before any profiles row necessarily exists
// (new signups included) — there's no server-side language preference to
// look up yet, so the client passes whatever it's currently displaying.
const OTP_EMAIL_COPY = {
  he: {
    subject: "קוד אימות",
    subtitle: "קוד האימות שלך",
    expires: "הקוד תקף ל-10 דקות.",
    ignore: "אם לא ביקשת זאת, התעלמי מהודעה זו.",
    dir: "rtl" as const,
  },
  ar: {
    subject: "رمز التحقق",
    subtitle: "رمز التحقق الخاص بك",
    expires: "الرمز صالح لمدة 10 دقائق.",
    ignore: "إذا لم تطلبي هذا، تجاهلي هذه الرسالة.",
    dir: "rtl" as const,
  },
  en: {
    subject: "Verification Code",
    subtitle: "Your verification code",
    expires: "This code expires in 10 minutes.",
    ignore: "If you didn't request this, ignore this email.",
    dir: "ltr" as const,
  },
};

export const sendOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string; lang?: string }) => d)
  .handler(async ({ data: { email, lang } }) => {
    await enforceRateLimit({
      action: "otp_send",
      identifier: getClientIp(),
      windowSeconds: 10 * 60,
      max: 8,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMail } = await import("@/api/email/mailer");
    const { hashOtp } = await import("@/api/auth/crypto.server");

    const emailLower = (email ?? "").toLowerCase().trim();
    if (!emailLower) throw new Error("VERIFICATION_FAILED");

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("verification_otps")
      .select("created_at")
      .eq("email", emailLower)
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (recent && recent.length > 0) {
      const lastSentMs = new Date(recent[0].created_at).getTime();
      if (Date.now() - lastSentMs < RESEND_COOLDOWN_MS) throw new Error("OTP_COOLDOWN");
      if (recent.length >= MAX_SENDS_PER_HOUR) throw new Error("OTP_RATE_LIMITED");
    }

    const otp = String(randomInt(100000, 999999));
    const expires_at = new Date(Date.now() + OTP_TTL_MS).toISOString();
    const otp_hash = hashOtp(emailLower, otp);

    const { error: insError } = await supabaseAdmin
      .from("verification_otps")
      .insert({ email: emailLower, otp_hash, expires_at });
    if (insError) throw new Error("VERIFICATION_FAILED");

    const copy = OTP_EMAIL_COPY[lang as keyof typeof OTP_EMAIL_COPY] ?? OTP_EMAIL_COPY.he;
    const { getEmailBrand } = await import("@/api/email/brand");
    const brand = await getEmailBrand();

    await sendMail(
      emailLower,
      `${brand.businessName} — ${copy.subject}`,
      `<div dir="${copy.dir}" style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:40px 24px;text-align:center;">
        <h1 style="font-size:24px;font-weight:600;color:#1b1c1c;margin-bottom:8px;">${brand.businessName}</h1>
        <p style="font-size:14px;color:#615e57;margin-bottom:32px;">${copy.subtitle}</p>
        <div style="background:#f6f3f2;border-radius:16px;padding:24px;margin-bottom:24px;">
          <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1b1c1c;">${otp}</span>
        </div>
        <p style="font-size:13px;color:#615e57;">${copy.expires}</p>
        <p style="font-size:12px;color:#999;margin-top:24px;">${copy.ignore}</p>
      </div>`,
    );

    return { success: true };
  });

// Proves OTP possession server-side, then issues a short-lived,
// single-use signup verification token. Nothing about "verified" is
// ever trusted from the browser — every check here is against
// database state keyed by the email the OTP was actually issued to.
export const verifyOtp = createServerFn({ method: "POST" })
  .validator((d: { email: string; otp: string }) => d)
  .handler(async ({ data: { email, otp } }) => {
    await enforceRateLimit({
      action: "otp_verify",
      identifier: getClientIp(),
      windowSeconds: 10 * 60,
      max: 15,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashOtp, hashToken, generateToken } = await import("@/api/auth/crypto.server");

    const emailLower = (email ?? "").toLowerCase().trim();
    const otpTrimmed = (otp ?? "").trim();
    if (!emailLower || !/^\d{6}$/.test(otpTrimmed)) throw new Error("INVALID_OTP");

    const otpHash = hashOtp(emailLower, otpTrimmed);

    const { data: candidate } = await supabaseAdmin
      .from("verification_otps")
      .select("id, otp_hash, attempt_count")
      .eq("email", emailLower)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!candidate || candidate.attempt_count >= MAX_FAILED_ATTEMPTS) {
      throw new Error("INVALID_OTP");
    }

    if (candidate.otp_hash !== otpHash) {
      await supabaseAdmin
        .from("verification_otps")
        .update({ attempt_count: candidate.attempt_count + 1 })
        .eq("id", candidate.id);
      throw new Error("INVALID_OTP");
    }

    // Atomic claim: the WHERE used_at IS NULL condition means only one
    // concurrent request can ever successfully mark this row used,
    // even if two requests race with the same valid code.
    const { data: claimed } = await supabaseAdmin
      .from("verification_otps")
      .update({ used_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();

    if (!claimed) throw new Error("INVALID_OTP");

    // Existing account re-verifying its email during login (not a new
    // signup) — mark it verified directly; no signup token is needed
    // for this path since adminSignUp is never called.
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", emailLower)
      .maybeSingle();

    if (existingProfile) {
      await supabaseAdmin
        .from("profiles")
        .update({ email_verified: true })
        .eq("id", existingProfile.id);
    }

    // Issue the one-time signup verification token. Only its hash is
    // stored; the raw value is returned to the browser exactly once,
    // for immediate, single use by adminSignUp.
    const token = generateToken();
    const tokenHash = hashToken(token);
    const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    const { error: tokenError } = await supabaseAdmin
      .from("signup_verification_tokens")
      .insert({ email: emailLower, token_hash: tokenHash, expires_at: tokenExpiresAt });
    if (tokenError) throw new Error("VERIFICATION_FAILED");

    return { success: true, verificationToken: token };
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
