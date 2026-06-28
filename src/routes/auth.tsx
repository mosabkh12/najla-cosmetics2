import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkPhoneAvailable, checkEmailAvailable } from "@/api/profiles/profiles";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Mail, Lock, User, Phone, Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign In — Najla Cosmetics" }] }),
  component: AuthPage,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISRAELI_PHONE_RE = /^05\d{8}$/;
const HAS_LETTER = /[\p{L}]/u;

function AuthPage() {
  const { t, dir } = useI18n();
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
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => { if (user) navigate({ to: "/profile" }); }, [user, navigate]);

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

  const signIn = async () => {
    if (!validateSignIn()) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: siEmail.trim().toLowerCase(), password: siPassword });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      navigate({ to: "/profile" });
    }
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
      // If checks fail, proceed — Supabase will catch duplicates
    }

    const { error } = await supabase.auth.signUp({
      email: emailLower,
      password: suPassword,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: name.trim(), phone: cleanPhone },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      setPendingEmail(emailLower);
    }
  };

  const resendVerification = async () => {
    if (!pendingEmail) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: window.location.origin },
    });
    setResending(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t("verify_resent"));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      tab === "signin" ? signIn() : signUp();
    }
  };

  const fieldClass = (field: string) =>
    `h-11 ps-10 rounded-xl border transition-colors ${
      errors[field]
        ? "border-destructive bg-destructive/5 focus:border-destructive"
        : "border-border/60 bg-surface/50 focus:bg-card focus:border-foreground/30"
    }`;

  if (pendingEmail) {
    return (
      <section className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-background px-4 py-12" dir={dir}>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="font-display text-[32px] italic text-foreground tracking-tight">Najla Cosmetics</h1>
          </div>

          <div className="rounded-2xl border border-border/30 bg-card p-6 sm:p-8 text-center"
            style={{ boxShadow: "0 30px 40px -10px rgba(45, 45, 45, 0.05)" }}
          >
            <div className="grid h-16 w-16 mx-auto place-items-center rounded-full bg-emerald-50 mb-5">
              <Mail className="h-7 w-7 text-emerald-600" />
            </div>

            <h2 className="font-display text-xl text-foreground">{t("verify_title")}</h2>

            <p className="mt-3 text-[14px] text-muted-foreground leading-relaxed">{t("verify_body")}</p>
            <p className="mt-1 text-[14px] font-semibold text-foreground" dir="ltr">{pendingEmail}</p>
            <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">{t("verify_body2")}</p>

            <div className="mt-6 space-y-3">
              <button
                onClick={resendVerification}
                disabled={resending}
                className="w-full h-[44px] rounded-full border border-border/40 text-foreground text-[11px] font-semibold uppercase tracking-[0.1em] hover:bg-surface transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                {t("verify_resend")}
              </button>

              <button
                onClick={() => { setPendingEmail(null); setTab("signin"); clearErrors(); }}
                className="w-full h-[44px] rounded-full bg-foreground text-background text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                {t("verify_back")}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="mt-5 text-[11px] text-muted-foreground/70">{t("verify_check_spam")}</p>
          </div>

          <p className="mt-5 text-center text-[11px] text-muted-foreground">© 2026 Najla Cosmetics</p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-background px-4 py-12" dir={dir}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-[32px] italic text-foreground tracking-tight">Najla Cosmetics</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            {tab === "signin" ? t("auth_welcome_back") : t("auth_create_account")}
          </p>
        </div>

        <div className="rounded-2xl border border-border/30 bg-card p-6 sm:p-8"
          style={{ boxShadow: "0 30px 40px -10px rgba(45, 45, 45, 0.05)" }}
        >
          <div className="grid grid-cols-2 h-11 rounded-xl bg-surface p-1 mb-6">
            <button
              onClick={() => { setTab("signin"); clearErrors(); }}
              className={`rounded-lg text-[13px] font-medium transition-all ${
                tab === "signin" ? "bg-card text-foreground soft-shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >{t("sign_in")}</button>
            <button
              onClick={() => { setTab("signup"); clearErrors(); }}
              className={`rounded-lg text-[13px] font-medium transition-all ${
                tab === "signup" ? "bg-card text-foreground soft-shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >{t("sign_up")}</button>
          </div>

          <div onKeyDown={handleKeyDown}>
            {tab === "signin" && (
              <div className="space-y-4">
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">{t("email")}</Label>
                  <div className="relative mt-1.5">
                    <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="email" value={siEmail} onChange={(e) => { setSiEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: "" })); }} placeholder="you@example.com" className={fieldClass("email")} autoComplete="username" dir="ltr" />
                  </div>
                  {errors.email && <p className="mt-1 text-[12px] text-destructive">{errors.email}</p>}
                </div>
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">{t("password")}</Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type={showPw ? "text" : "password"} value={siPassword} onChange={(e) => { setSiPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: "" })); }} placeholder="••••••••" className={`${fieldClass("password")} pe-10`} autoComplete="current-password" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-[12px] text-destructive">{errors.password}</p>}
                </div>
                <button onClick={signIn} disabled={busy} className="w-full bg-foreground text-background h-[48px] rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity disabled:opacity-40 mt-2 flex items-center justify-center gap-2">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("sign_in")}
                </button>
              </div>
            )}

            {tab === "signup" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">{t("full_name")}</Label>
                    <div className="relative mt-1.5">
                      <User className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input value={name} onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: "" })); }} className={fieldClass("name")} autoComplete="name" />
                    </div>
                    {errors.name && <p className="mt-1 text-[12px] text-destructive">{errors.name}</p>}
                  </div>
                  <div>
                    <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">{t("phone")}</Label>
                    <div className="relative mt-1.5">
                      <Phone className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="tel" value={phone} maxLength={10} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 10); setPhone(v); if (errors.phone) setErrors((p) => ({ ...p, phone: "" })); }} placeholder="05XXXXXXXX" className={fieldClass("phone")} autoComplete="tel" dir="ltr" />
                    </div>
                    {errors.phone && <p className="mt-1 text-[12px] text-destructive">{errors.phone}</p>}
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">{t("email")}</Label>
                  <div className="relative mt-1.5">
                    <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="email" value={suEmail} onChange={(e) => { setSuEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: "" })); }} placeholder="you@example.com" className={fieldClass("email")} autoComplete="off" dir="ltr" />
                  </div>
                  {errors.email && <p className="mt-1 text-[12px] text-destructive">{errors.email}</p>}
                </div>
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">{t("password")}</Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type={showPw ? "text" : "password"} value={suPassword} onChange={(e) => { setSuPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: "" })); }} placeholder="••••••••" className={`${fieldClass("password")} pe-10`} autoComplete="new-password" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-[12px] text-destructive">{errors.password}</p>}
                  {suPassword.length > 0 && suPassword.length < 6 && !errors.password && (
                    <div className="mt-2 flex gap-1">
                      {[1,2,3,4,5,6].map((i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${suPassword.length >= i ? "bg-foreground" : "bg-border"}`} />
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={signUp} disabled={busy} className="w-full bg-foreground text-background h-[48px] rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity disabled:opacity-40 mt-2 flex items-center justify-center gap-2">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
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
