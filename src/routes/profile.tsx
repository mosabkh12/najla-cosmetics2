import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Edit2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n, pickLocalized } from "@/lib/i18n";
import type { Product } from "@/components/products/ProductCard";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "My Account — Najla Cosmetics" }] }),
  component: ProfilePage,
});

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-blush text-gold-deep",
  confirmed: "bg-gold-soft text-gold-deep",
  completed: "bg-surface-3 text-secondary-foreground",
  cancelled: "bg-[#FFDAD6] text-[#93000A]",
  preparing: "bg-cream text-gold-deep",
};

function ProfilePage() {
  const { t, lang } = useI18n();
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id], enabled: !!user,
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data,
  });
  useEffect(() => { if (profile) { setName(profile.full_name ?? ""); setPhone(profile.phone ?? ""); } }, [profile]);

  const { data: appts = [] } = useQuery({
    queryKey: ["appointments", user?.id], enabled: !!user,
    queryFn: async () => (await supabase.from("appointments").select("*, services(name,name_ar,image_url)").eq("user_id", user!.id).order("appointment_date", { ascending: false })).data ?? [],
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["orders", user?.id], enabled: !!user,
    queryFn: async () => (await supabase.from("orders").select("*, order_items(*)").eq("user_id", user!.id).order("created_at", { ascending: false })).data ?? [],
  });

  const { data: favs = [] } = useQuery({
    queryKey: ["favorites", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("favorites").select("products(*)").eq("user_id", user!.id);
      return ((data ?? []).map((r: any) => r.products).filter(Boolean)) as Product[];
    },
  });

  if (!user) return null;

  const saveProfile = async () => {
    const { error } = await supabase.from("profiles").update({ full_name: name, phone }).eq("id", user.id);
    if (error) toast.error(error.message);
    else { toast.success(t("save")); setEditing(false); qc.invalidateQueries({ queryKey: ["profile", user.id] }); }
  };

  const cancelAppt = async (id: string) => {
    await supabase.from("appointments").update({ status: "cancelled" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["appointments", user.id] });
  };

  const upcoming = appts.filter((a: any) => ["pending", "confirmed"].includes(a.status));
  const doneAppt = appts.filter((a: any) => a.status === "completed");
  const cancAppt = appts.filter((a: any) => a.status === "cancelled");
  const activeOrders = orders.filter((o: any) => !["completed", "cancelled"].includes(o.status));
  const doneOrders = orders.filter((o: any) => o.status === "completed");
  const cancOrders = orders.filter((o: any) => o.status === "cancelled");

  return (
    <section className="container-page py-10">
      {/* Profile card */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 soft-shadow flex items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-blush text-primary font-display text-xl">{(name || user.email || "?").charAt(0).toUpperCase()}</div>
        <div className="flex-1 min-w-0">
          {!editing ? (
            <>
              <p className="font-display text-lg text-foreground truncate">{name || user.email}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email} {phone && `· ${phone}`}</p>
            </>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              <div><Label className="text-[10px]">{t("full_name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" /></div>
              <div><Label className="text-[10px]">{t("phone")}</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9" /></div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {!editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Edit2 className="h-3.5 w-3.5 me-1" />{t("edit_profile")}</Button>
          ) : (
            <div className="flex gap-1.5"><Button size="sm" onClick={saveProfile} className="btn-gold">{t("save")}</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("cancel")}</Button></div>
          )}
          <Button size="sm" variant="ghost" onClick={signOut} className="text-muted-foreground"><LogOut className="h-3.5 w-3.5 me-1" />{t("sign_out")}</Button>
        </div>
      </div>

      {/* Appointments */}
      <h2 className="mt-8 font-display text-xl text-foreground">{t("appointments")}</h2>
      <Tabs defaultValue="up" className="mt-3">
        <TabsList><TabsTrigger value="up">{t("upcoming")}</TabsTrigger><TabsTrigger value="done">{t("completed")}</TabsTrigger><TabsTrigger value="canc">{t("cancelled")}</TabsTrigger></TabsList>
        {[{k:"up",arr:upcoming,cancel:true},{k:"done",arr:doneAppt,cancel:false},{k:"canc",arr:cancAppt,cancel:false}].map(({k,arr,cancel}) => (
          <TabsContent key={k} value={k} className="space-y-2.5 mt-3">
            {arr.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">{t("no_appointments")}</p>}
            {arr.map((a: any) => (
              <div key={a.id} className="rounded-xl border border-border/60 bg-card p-3.5 flex items-center gap-3 soft-shadow">
                {a.services?.image_url && <img src={a.services.image_url} className="h-14 w-14 rounded-lg object-cover" alt="" />}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground">{pickLocalized(lang, a.services?.name, a.services?.name_ar)}</p>
                  <p className="text-xs text-muted-foreground">{a.appointment_date} · {String(a.appointment_time).slice(0,5)} · ₪{a.total_price}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${STATUS_COLOR[a.status]}`}>{t(`status_${a.status}`)}</span>
                {cancel && <Button size="sm" variant="ghost" onClick={() => cancelAppt(a.id)} className="text-destructive">{t("cancel")}</Button>}
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      {/* Orders */}
      <h2 className="mt-8 font-display text-xl text-foreground">{t("orders")}</h2>
      <Tabs defaultValue="active" className="mt-3">
        <TabsList><TabsTrigger value="active">{t("active")}</TabsTrigger><TabsTrigger value="done">{t("completed")}</TabsTrigger><TabsTrigger value="canc">{t("cancelled")}</TabsTrigger></TabsList>
        {[{k:"active",arr:activeOrders},{k:"done",arr:doneOrders},{k:"canc",arr:cancOrders}].map(({k,arr}) => (
          <TabsContent key={k} value={k} className="space-y-2.5 mt-3">
            {arr.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">{t("no_orders")}</p>}
            {arr.map((o: any) => (
              <div key={o.id} className="rounded-xl border border-border/60 bg-card p-3.5 soft-shadow">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("order_number")} {o.order_number}</p>
                    <p className="text-sm text-foreground mt-0.5 truncate">{(o.order_items ?? []).map((i: any) => `${i.product_name} x${i.quantity}`).join(", ")}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${STATUS_COLOR[o.status]}`}>{t(`status_${o.status}`)}</span>
                </div>
                <div className="mt-2 flex justify-between text-sm"><span className="text-secondary-foreground">{new Date(o.created_at).toLocaleDateString()}</span><span className="font-semibold text-foreground">₪{Number(o.total).toFixed(2)}</span></div>
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      {/* Favorites */}
      <h2 className="mt-8 font-display text-xl text-foreground flex items-center gap-2"><Heart className="h-5 w-5 text-primary" />{t("favorites")}</h2>
      <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {favs.length === 0 && <p className="col-span-full text-sm text-muted-foreground py-6 text-center">{t("no_favorites")}</p>}
        {favs.map((p) => (
          <Link key={p.id} to="/products" className="block rounded-xl border border-border/60 bg-card p-2.5 soft-shadow">
            <div className="aspect-square overflow-hidden rounded-lg bg-surface">
              {p.image_url && <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />}
            </div>
            <p className="mt-2 text-xs font-medium text-foreground truncate">{pickLocalized(lang, p.name, p.name_ar)}</p>
            <p className="text-xs text-primary font-semibold">₪{p.price}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
