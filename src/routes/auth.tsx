import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Sparkles, Mail, Lock, User, Phone } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign In — Najla Cosmetics" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (user) navigate({ to: "/profile" }); }, [user, navigate]);

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message); else navigate({ to: "/profile" });
  };
  const signUp = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: name, phone } },
    });
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Check your email to confirm.");
  };

  return (
    <section className="min-h-[calc(100vh-160px)] flex items-center justify-center bg-gradient-to-b from-blush/50 via-background to-background px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-gold to-gold-muted soft-shadow">
            <Sparkles className="h-7 w-7 text-gold-foreground" />
          </div>
          <h1 className="font-display text-3xl text-foreground tracking-tight">Najla Cosmetics</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t("hero_sub").slice(0, 60)}...</p>
        </div>

        {/* Auth card */}
        <div className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm p-6 sm:p-8 soft-shadow">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid grid-cols-2 w-full h-11 rounded-xl bg-surface p-1">
              <TabsTrigger value="signin" className="rounded-lg text-sm font-medium data-[state=active]:bg-card data-[state=active]:soft-shadow">{t("sign_in")}</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-lg text-sm font-medium data-[state=active]:bg-card data-[state=active]:soft-shadow">{t("sign_up")}</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6 space-y-4">
              <div>
                <Label className="text-xs font-medium text-secondary-foreground">{t("email")}</Label>
                <div className="relative mt-1.5">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-11 ps-10 rounded-xl border-border/60 bg-surface/50 focus:bg-card transition-colors" />
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium text-secondary-foreground">{t("password")}</Label>
                <div className="relative mt-1.5">
                  <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="h-11 ps-10 rounded-xl border-border/60 bg-surface/50 focus:bg-card transition-colors" />
                </div>
              </div>
              <Button onClick={signIn} disabled={busy} className="btn-gold w-full h-11 rounded-xl text-sm font-semibold mt-2">{t("sign_in")}</Button>
            </TabsContent>

            <TabsContent value="signup" className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium text-secondary-foreground">{t("full_name")}</Label>
                  <div className="relative mt-1.5">
                    <User className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 ps-10 rounded-xl border-border/60 bg-surface/50 focus:bg-card transition-colors" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-secondary-foreground">{t("phone")}</Label>
                  <div className="relative mt-1.5">
                    <Phone className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 ps-10 rounded-xl border-border/60 bg-surface/50 focus:bg-card transition-colors" />
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium text-secondary-foreground">{t("email")}</Label>
                <div className="relative mt-1.5">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="h-11 ps-10 rounded-xl border-border/60 bg-surface/50 focus:bg-card transition-colors" />
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium text-secondary-foreground">{t("password")}</Label>
                <div className="relative mt-1.5">
                  <Lock className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="h-11 ps-10 rounded-xl border-border/60 bg-surface/50 focus:bg-card transition-colors" />
                </div>
              </div>
              <Button onClick={signUp} disabled={busy} className="btn-gold w-full h-11 rounded-xl text-sm font-semibold mt-2">{t("sign_up")}</Button>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer note */}
        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          © 2026 Najla Cosmetics
        </p>
      </div>
    </section>
  );
}
