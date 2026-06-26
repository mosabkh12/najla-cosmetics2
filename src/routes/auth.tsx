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
    <section className="container-page py-12 flex justify-center">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-6 soft-shadow">
        <h1 className="font-display text-2xl text-center text-foreground">Najla Cosmetics</h1>
        <Tabs defaultValue="signin" className="mt-5">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">{t("sign_in")}</TabsTrigger>
            <TabsTrigger value="signup">{t("sign_up")}</TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="space-y-3 mt-4">
            <div><Label className="text-xs">{t("email")}</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-10" /></div>
            <div><Label className="text-xs">{t("password")}</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-10" /></div>
            <Button onClick={signIn} disabled={busy} className="btn-gold w-full h-10">{t("sign_in")}</Button>
          </TabsContent>
          <TabsContent value="signup" className="space-y-3 mt-4">
            <div><Label className="text-xs">{t("full_name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-10" /></div>
            <div><Label className="text-xs">{t("phone")}</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-10" /></div>
            <div><Label className="text-xs">{t("email")}</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-10" /></div>
            <div><Label className="text-xs">{t("password")}</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-10" /></div>
            <Button onClick={signUp} disabled={busy} className="btn-gold w-full h-10">{t("sign_up")}</Button>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
