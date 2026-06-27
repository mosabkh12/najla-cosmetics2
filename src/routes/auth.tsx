import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkPhoneAvailable, checkEmailAvailable } from "@/api/profiles/profiles";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Mail, Lock, User, Phone, Eye, EyeOff, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign In — Najla Cosmetics" }] }),
  component: AuthPage,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\d{10}$/;

function AuthPage() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  // Sign in fields
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");
  // Sign up fields
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // Shared
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    const cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone) e.phone = t("err_phone_required");
    else if (cleanPhone.length !== 10) e.phone = t("err_phone_invalid");
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

    try {
      const [phoneCheck, emailCheck] = await Promise.all([
        checkPhoneAvailable({ data: { phone: cleanPhone } }),
        checkEmailAvailable({ data: { email: suEmail.trim().toLowerCase() } }),
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
      email: suEmail.trim().toLowerCase(),
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
      toast.success(t("signup_success"));
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

  return (
    <section className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-background px-4 py-12" dir={dir}>
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="font-display text-[32px] italic text-foreground tracking-tight">Najla Cosmetics</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            {tab === "signin" ? t("auth_welcome_back") : t("auth_create_account")}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border/30 bg-card p-6 sm:p-8"
          style={{ boxShadow: "0 30px 40px -10px rgba(45, 45, 45, 0.05)" }}
        >
          {/* Tab switcher */}
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
            {/* ── Sign In ── */}
            {tab === "signin" && (
              <div className="space-y-4">
                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">{t("email")}</Label>
                  <div className="relative mt-1.5">
                    <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      value={siEmail}
                      onChange={(e) => { setSiEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: "" })); }}
                      placeholder="you@example.com"
                      className={fieldClass("email")}
                      dir="ltr"
                    />
                  </div>
                  {errors.email && <p className="mt-1 text-[12px] text-destructive">{errors.email}</p>}
                </div>

                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">{t("password")}</Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showPw ? "text" : "password"}
                      value={siPassword}
                      onChange={(e) => { setSiPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: "" })); }}
                      placeholder="••••••••"
                      className={`${fieldClass("password")} pe-10`}
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-[12px] text-destructive">{errors.password}</p>}
                </div>

                <button
                  onClick={signIn}
                  disabled={busy}
                  className="w-full bg-foreground text-background h-[48px] rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity disabled:opacity-40 mt-2 flex items-center justify-center gap-2"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("sign_in")}
                </button>
              </div>
            )}

            {/* ── Sign Up ── */}
            {tab === "signup" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">{t("full_name")}</Label>
                    <div className="relative mt-1.5">
                      <User className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={name}
                        onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: "" })); }}
                        className={fieldClass("name")}
                      />
                    </div>
                    {errors.name && <p className="mt-1 text-[12px] text-destructive">{errors.name}</p>}
                  </div>
                  <div>
                    <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">{t("phone")}</Label>
                    <div className="relative mt-1.5">
                      <Phone className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="tel"
                        value={phone}
                        maxLength={10}
                        onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 10); setPhone(v); if (errors.phone) setErrors((p) => ({ ...p, phone: "" })); }}
                        placeholder="05XXXXXXXX"
                        className={fieldClass("phone")}
                        dir="ltr"
                      />
                    </div>
                    {errors.phone && <p className="mt-1 text-[12px] text-destructive">{errors.phone}</p>}
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">{t("email")}</Label>
                  <div className="relative mt-1.5">
                    <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      value={suEmail}
                      onChange={(e) => { setSuEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: "" })); }}
                      placeholder="you@example.com"
                      className={fieldClass("email")}
                      dir="ltr"
                    />
                  </div>
                  {errors.email && <p className="mt-1 text-[12px] text-destructive">{errors.email}</p>}
                </div>

                <div>
                  <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-secondary-foreground">{t("password")}</Label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showPw ? "text" : "password"}
                      value={suPassword}
                      onChange={(e) => { setSuPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: "" })); }}
                      placeholder="••••••••"
                      className={`${fieldClass("password")} pe-10`}
                    />
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

                <button
                  onClick={signUp}
                  disabled={busy}
                  className="w-full bg-foreground text-background h-[48px] rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity disabled:opacity-40 mt-2 flex items-center justify-center gap-2"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("sign_up")}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          © 2026 Najla Cosmetics
        </p>
      </div>
    </section>
  );
}
