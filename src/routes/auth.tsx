import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkPhoneAvailable, checkEmailAvailable } from "@/api/profiles/profiles";
import { sendOtp, verifyOtp, checkVerified } from "@/api/auth/otp";
import { adminSignUp } from "@/api/auth/signup";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { Mail, Lock, User, Phone, Eye, EyeOff, Loader2, ShieldCheck, RotateCw } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign In — Najla Cosmetics" }] }),
  component: AuthPage,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISRAELI_PHONE_RE = /^05\d{8}$/;
const HAS_LETTER = /[\p{L}]/u;

const OTP_ERROR_MAP: Record<string, string> = {
  INVALID_OTP: "err_otp_invalid",
  OTP_COOLDOWN: "err_otp_cooldown",
  OTP_RATE_LIMITED: "err_otp_rate_limited",
  RATE_LIMITED: "err_rate_limited",
  VERIFICATION_REQUIRED: "err_verification_required",
  SIGNUP_FAILED: "err_signup_failed",
  VERIFICATION_FAILED: "err_verification_failed",
};

function AuthPage() {
  const { t, dir, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [pendingSignup, setPendingSignup] = useState<{
    email: string;
    password: string;
    name: string;
    phone: string;
  } | null>(null);

  useEffect(() => {
    if (user && !otpEmail) navigate({ to: "/profile" });
  }, [user, otpEmail, navigate]);

  const clearErrors = () => setErrors({});

  const validateSignIn = (): boolean => {
    const e: Record<string, string> = {};
    if (!siEmail.trim()) e.email = t("err_email_required");
    else if (!EMAIL_RE.test(siEmail)) e.email = t("err_email_invalid");
    if (!siPassword) e.password = t("err_password_required");
    else if (siPassword.length < 6) e.password = t("err_password_short");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateSignUp = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t("err_name_required");
    else if (!HAS_LETTER.test(name)) e.name = t("err_name_letters");
    const cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone) e.phone = t("err_phone_required");
    else if (!ISRAELI_PHONE_RE.test(cleanPhone)) e.phone = t("err_phone_invalid");
    if (!suEmail.trim()) e.email = t("err_email_required");
    else if (!EMAIL_RE.test(suEmail)) e.email = t("err_email_invalid");
    if (!suPassword) e.password = t("err_password_required");
    else if (suPassword.length < 6) e.password = t("err_password_short");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const triggerOtp = async (email: string) => {
    await sendOtp({ data: { email, lang } });
    setOtpEmail(email);
    setOtpDigits(["", "", "", "", "", ""]);
    setOtpError("");
  };

  const signIn = async () => {
    if (!validateSignIn()) return;
    setBusy(true);
    const email = siEmail.trim().toLowerCase();
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password: siPassword,
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }

    try {
      const { verified } = await checkVerified({ data: { userId: authData.user.id } });
      if (!verified) {
        try {
          await triggerOtp(email);
        } catch (otpErr: unknown) {
          // A code may already be pending (cooldown) — the existing
          // code is still valid, so show the entry screen anyway.
          const message = getErrorMessage(otpErr);
          if (message === "OTP_COOLDOWN") {
            setOtpEmail(email);
            setOtpDigits(["", "", "", "", "", ""]);
            setOtpError("");
          } else {
            toast.error(t(OTP_ERROR_MAP[message] ?? "err_verification_failed"));
          }
        }
        setBusy(false);
        return;
      }
    } catch {
      /* proceed */
    }

    setBusy(false);
    navigate({ to: "/profile" });
  };

  const signUp = async () => {
    if (!validateSignUp()) return;
    setBusy(true);
    const cleanPhone = phone.replace(/\D/g, "");
    const emailLower = suEmail.trim().toLowerCase();

    try {
      const [phoneCheck, emailCheck] = await Promise.all([
        checkPhoneAvailable({ data: { phone: cleanPhone } }),
        checkEmailAvailable({ data: { email: emailLower } }),
      ]);
      const newErrors: Record<string, string> = {};
      if (!phoneCheck.available) newErrors.phone = t("err_phone_taken");
      if (!emailCheck.available) newErrors.email = t("err_email_taken");
      if (Object.keys(newErrors).length > 0) {
        setErrors((prev) => ({ ...prev, ...newErrors }));
        setBusy(false);
        return;
      }
    } catch {
      /* proceed */
    }

    try {
      setPendingSignup({
        email: emailLower,
        password: suPassword,
        name: name.trim(),
        phone: cleanPhone,
      });
      await triggerOtp(emailLower);
    } catch (e: unknown) {
      setPendingSignup(null);
      toast.error(t(OTP_ERROR_MAP[getErrorMessage(e)] ?? "err_verification_failed"));
    }
    setBusy(false);
  };

  const submitOtp = async () => {
    const code = otpDigits.join("");
    if (code.length !== 6) {
      setOtpError(t("err_otp_incomplete"));
      return;
    }
    setOtpBusy(true);
    setOtpError("");
    try {
      const { verificationToken } = await verifyOtp({ data: { email: otpEmail!, otp: code } });

      if (pendingSignup) {
        await adminSignUp({
          data: {
            email: pendingSignup.email,
            password: pendingSignup.password,
            full_name: pendingSignup.name,
            phone: pendingSignup.phone,
            verification_token: verificationToken,
          },
        });
        const { error } = await supabase.auth.signInWithPassword({
          email: pendingSignup.email,
          password: pendingSignup.password,
        });
        if (error) {
          setOtpBusy(false);
          toast.error(error.message);
          return;
        }
        setPendingSignup(null);
      }

      toast.success(t("otp_verified"));
      setOtpEmail(null);
      navigate({ to: "/profile" });
    } catch (e: unknown) {
      setOtpError(t(OTP_ERROR_MAP[getErrorMessage(e)] ?? "err_verification_failed"));
    }
    setOtpBusy(false);
  };

  const resendOtpEmail = async () => {
    if (!otpEmail) return;
    setResending(true);
    try {
      await sendOtp({ data: { email: otpEmail, lang } });
      toast.success(t("verify_resent"));
      setOtpDigits(["", "", "", "", "", ""]);
      setOtpError("");
    } catch (e: unknown) {
      toast.error(t(OTP_ERROR_MAP[getErrorMessage(e)] ?? "err_verification_failed"));
    }
    setResending(false);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const d = [...otpDigits];
    d[index] = value.slice(-1);
    setOtpDigits(d);
    setOtpError("");
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0)
      inputRefs.current[index - 1]?.focus();
    if (e.key === "Enter") submitOtp();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const d = [...otpDigits];
    for (let i = 0; i < 6; i++) d[i] = pasted[i] || "";
    setOtpDigits(d);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (tab === "signin") signIn();
      else signUp();
    }
  };

  const fieldClass = (field: string) =>
    `h-11 ps-10 rounded-xl border transition-colors ${errors[field] ? "border-destructive bg-destructive/5 focus:border-destructive" : "border-border/60 bg-surface/50 focus:bg-card focus:border-foreground/30"}`;

  // ── OTP Screen ──
  if (otpEmail) {
    return (
      <section
        className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-background px-4 py-12"
        dir={dir}
      >
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="font-display text-[32px] italic text-foreground tracking-tight">
              Najla Cosmetics
            </h1>
          </div>
          <div
            className="rounded-2xl border border-border/30 bg-card p-6 sm:p-8 text-center"
            style={{ boxShadow: "0 30px 40px -10px rgba(45, 45, 45, 0.05)" }}
          >
            <div className="grid h-16 w-16 mx-auto place-items-center rounded-full bg-cream mb-5">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <h2 className="font-display text-xl text-foreground">{t("otp_title")}</h2>
            <p className="mt-2 text-[13px] text-muted-foreground">{t("otp_sent_to")}</p>
            <p className="text-[14px] font-semibold text-foreground mt-1" dir="ltr">
              {otpEmail}
            </p>

            <fieldset className="mt-6" dir="ltr" onPaste={handleOtpPaste}>
              <legend className="sr-only">{t("otp_title")}</legend>
              <div className="flex justify-center gap-2.5">
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    autoFocus={i === 0}
                    aria-label={`${t("otp_digit")} ${i + 1}`}
                    aria-invalid={otpError ? true : undefined}
                    aria-describedby={otpError ? "otp-error" : undefined}
                    className={`h-12 w-10 sm:h-14 sm:w-12 text-center text-xl font-bold rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${otpError ? "border-destructive bg-destructive/5" : digit ? "border-foreground/30 bg-card" : "border-border/60 bg-surface/50"}`}
                  />
                ))}
              </div>
            </fieldset>
            {otpError && (
              <p id="otp-error" role="alert" className="mt-3 text-[12px] text-destructive">
                {otpError}
              </p>
            )}
            <p className="mt-4 text-[11px] text-muted-foreground/70">{t("otp_expires")}</p>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={submitOtp}
                disabled={otpBusy || otpDigits.join("").length !== 6}
                aria-busy={otpBusy}
                className="w-full h-[48px] rounded-full bg-foreground text-background text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {otpBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                )}{" "}
                {t("otp_verify")}
              </button>
              <button
                type="button"
                onClick={resendOtpEmail}
                disabled={resending}
                aria-busy={resending}
                className="w-full h-[40px] rounded-full border border-border/40 text-foreground text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-surface transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {resending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}{" "}
                {t("verify_resend")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpEmail(null);
                  setPendingSignup(null);
                  if (!pendingSignup) supabase.auth.signOut();
                }}
                className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                {t("verify_back")}
              </button>
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground/60">{t("verify_check_spam")}</p>
          </div>
        </div>
      </section>
    );
  }

  // ── Main Auth Screen ──
  return (
    <section
      className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-background px-4 py-12"
      dir={dir}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-[32px] italic text-foreground tracking-tight">
            Najla Cosmetics
          </h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            {tab === "signin" ? t("auth_welcome_back") : t("auth_create_account")}
          </p>
        </div>
        <div
          className="rounded-2xl border border-border/30 bg-card p-6 sm:p-8"
          style={{ boxShadow: "0 30px 40px -10px rgba(45, 45, 45, 0.05)" }}
        >
          <div
            role="tablist"
            aria-label={`${t("sign_in")} / ${t("sign_up")}`}
            className="grid grid-cols-2 h-11 rounded-xl bg-surface p-1 mb-6"
          >
            <button
              type="button"
              role="tab"
              id="tab-signin"
              aria-selected={tab === "signin"}
              aria-controls="panel-signin"
              tabIndex={tab === "signin" ? 0 : -1}
              onClick={() => {
                setTab("signin");
                clearErrors();
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  setTab("signup");
                  clearErrors();
                  document.getElementById("tab-signup")?.focus();
                }
              }}
              className={`rounded-lg text-[13px] font-medium transition-all ${tab === "signin" ? "bg-card text-foreground soft-shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t("sign_in")}
            </button>
            <button
              type="button"
              role="tab"
              id="tab-signup"
              aria-selected={tab === "signup"}
              aria-controls="panel-signup"
              tabIndex={tab === "signup" ? 0 : -1}
              onClick={() => {
                setTab("signup");
                clearErrors();
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  setTab("signin");
                  clearErrors();
                  document.getElementById("tab-signin")?.focus();
                }
              }}
              className={`rounded-lg text-[13px] font-medium transition-all ${tab === "signup" ? "bg-card text-foreground soft-shadow" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t("sign_up")}
            </button>
          </div>
          <div onKeyDown={handleKeyDown}>
            {tab === "signin" && (
              <div
                className="space-y-4"
                role="tabpanel"
                id="panel-signin"
                aria-labelledby="tab-signin"
              >
                <div>
                  <Label
                    htmlFor="si-email"
                    className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground"
                  >
                    {t("email")}
                  </Label>
                  <div className="relative mt-1.5">
                    <Mail
                      aria-hidden="true"
                      className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    />
                    <Input
                      id="si-email"
                      type="email"
                      value={siEmail}
                      onChange={(e) => {
                        setSiEmail(e.target.value);
                        if (errors.email) setErrors((p) => ({ ...p, email: "" }));
                      }}
                      placeholder="you@example.com"
                      className={fieldClass("email")}
                      autoComplete="username"
                      aria-invalid={errors.email ? true : undefined}
                      aria-describedby={errors.email ? "si-email-error" : undefined}
                      dir="ltr"
                    />
                  </div>
                  {errors.email && (
                    <p
                      id="si-email-error"
                      role="alert"
                      className="mt-1 text-[12px] text-destructive"
                    >
                      {errors.email}
                    </p>
                  )}
                </div>
                <div>
                  <Label
                    htmlFor="si-password"
                    className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground"
                  >
                    {t("password")}
                  </Label>
                  <div className="relative mt-1.5">
                    <Lock
                      aria-hidden="true"
                      className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    />
                    <Input
                      id="si-password"
                      type={showPw ? "text" : "password"}
                      value={siPassword}
                      onChange={(e) => {
                        setSiPassword(e.target.value);
                        if (errors.password) setErrors((p) => ({ ...p, password: "" }));
                      }}
                      placeholder="••••••••"
                      className={`${fieldClass("password")} pe-10`}
                      autoComplete="current-password"
                      aria-invalid={errors.password ? true : undefined}
                      aria-describedby={errors.password ? "si-password-error" : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      aria-label={showPw ? t("hide_password") : t("show_password")}
                      aria-pressed={showPw}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPw ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p
                      id="si-password-error"
                      role="alert"
                      className="mt-1 text-[12px] text-destructive"
                    >
                      {errors.password}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={signIn}
                  disabled={busy}
                  aria-busy={busy}
                  className="w-full bg-foreground text-background h-[48px] rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity disabled:opacity-40 mt-2 flex items-center justify-center gap-2"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{" "}
                  {t("sign_in")}
                </button>
              </div>
            )}
            {tab === "signup" && (
              <div
                className="space-y-4"
                role="tabpanel"
                id="panel-signup"
                aria-labelledby="tab-signup"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label
                      htmlFor="su-name"
                      className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground"
                    >
                      {t("full_name")}
                    </Label>
                    <div className="relative mt-1.5">
                      <User
                        aria-hidden="true"
                        className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                      />
                      <Input
                        id="su-name"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (errors.name) setErrors((p) => ({ ...p, name: "" }));
                        }}
                        className={fieldClass("name")}
                        autoComplete="name"
                        aria-invalid={errors.name ? true : undefined}
                        aria-describedby={errors.name ? "su-name-error" : undefined}
                      />
                    </div>
                    {errors.name && (
                      <p
                        id="su-name-error"
                        role="alert"
                        className="mt-1 text-[12px] text-destructive"
                      >
                        {errors.name}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label
                      htmlFor="su-phone"
                      className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground"
                    >
                      {t("phone")}
                    </Label>
                    <div className="relative mt-1.5">
                      <Phone
                        aria-hidden="true"
                        className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                      />
                      <Input
                        id="su-phone"
                        type="tel"
                        inputMode="tel"
                        value={phone}
                        maxLength={10}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                          setPhone(v);
                          if (errors.phone) setErrors((p) => ({ ...p, phone: "" }));
                        }}
                        placeholder="05XXXXXXXX"
                        className={fieldClass("phone")}
                        autoComplete="tel"
                        aria-invalid={errors.phone ? true : undefined}
                        aria-describedby={errors.phone ? "su-phone-error" : undefined}
                        dir="ltr"
                      />
                    </div>
                    {errors.phone && (
                      <p
                        id="su-phone-error"
                        role="alert"
                        className="mt-1 text-[12px] text-destructive"
                      >
                        {errors.phone}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <Label
                    htmlFor="su-email"
                    className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground"
                  >
                    {t("email")}
                  </Label>
                  <div className="relative mt-1.5">
                    <Mail
                      aria-hidden="true"
                      className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    />
                    <Input
                      id="su-email"
                      type="email"
                      value={suEmail}
                      onChange={(e) => {
                        setSuEmail(e.target.value);
                        if (errors.email) setErrors((p) => ({ ...p, email: "" }));
                      }}
                      placeholder="you@example.com"
                      className={fieldClass("email")}
                      autoComplete="off"
                      aria-invalid={errors.email ? true : undefined}
                      aria-describedby={errors.email ? "su-email-error" : undefined}
                      dir="ltr"
                    />
                  </div>
                  {errors.email && (
                    <p
                      id="su-email-error"
                      role="alert"
                      className="mt-1 text-[12px] text-destructive"
                    >
                      {errors.email}
                    </p>
                  )}
                </div>
                <div>
                  <Label
                    htmlFor="su-password"
                    className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground"
                  >
                    {t("password")}
                  </Label>
                  <div className="relative mt-1.5">
                    <Lock
                      aria-hidden="true"
                      className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    />
                    <Input
                      id="su-password"
                      type={showPw ? "text" : "password"}
                      value={suPassword}
                      onChange={(e) => {
                        setSuPassword(e.target.value);
                        if (errors.password) setErrors((p) => ({ ...p, password: "" }));
                      }}
                      placeholder="••••••••"
                      className={`${fieldClass("password")} pe-10`}
                      autoComplete="new-password"
                      aria-invalid={errors.password ? true : undefined}
                      aria-describedby={errors.password ? "su-password-error" : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      aria-label={showPw ? t("hide_password") : t("show_password")}
                      aria-pressed={showPw}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPw ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p
                      id="su-password-error"
                      role="alert"
                      className="mt-1 text-[12px] text-destructive"
                    >
                      {errors.password}
                    </p>
                  )}
                  {suPassword.length > 0 && suPassword.length < 6 && !errors.password && (
                    <div className="mt-2 flex gap-1" aria-hidden="true">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${suPassword.length >= i ? "bg-foreground" : "bg-border"}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={signUp}
                  disabled={busy}
                  aria-busy={busy}
                  className="w-full bg-foreground text-background h-[48px] rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity disabled:opacity-40 mt-2 flex items-center justify-center gap-2"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{" "}
                  {t("sign_up")}
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="mt-5 text-center text-[11px] text-muted-foreground">© 2026 Najla Cosmetics</p>
      </div>
    </section>
  );
}
