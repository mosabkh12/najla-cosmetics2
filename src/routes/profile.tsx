import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Edit2, LogOut, CalendarDays, ShoppingBag, Clock, Phone, Mail, User, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, pickLocalized } from "@/lib/i18n";
import type { Product } from "@/components/products/ProductCard";
import { toast } from "sonner";
import { Reveal, StaggerGrid } from "@/components/ScrollReveal";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "My Account — Najla Cosmetics" }] }),
  component: ProfilePage,
});

const STATUS_STYLE: Record<string, { bg: string; dot: string }> = {
  pending: { bg: "bg-blush/80 text-gold-deep", dot: "bg-gold-muted" },
  confirmed: { bg: "bg-gold-soft/60 text-gold-deep", dot: "bg-gold" },
  completed: { bg: "bg-surface-3 text-secondary-foreground", dot: "bg-muted-foreground" },
  cancelled: { bg: "bg-[#FFDAD6]/70 text-[#93000A]", dot: "bg-[#BA1A1A]" },
  preparing: { bg: "bg-cream text-gold-deep", dot: "bg-gold-muted" },
};

type Section = "appointments" | "orders" | "favorites";

function ProfilePage() {
  const { t, lang } = useI18n();
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [section, setSection] = useState<Section>("appointments");
  const [apptFilter, setApptFilter] = useState<"all" | "upcoming" | "completed" | "cancelled">("all");
  const [orderFilter, setOrderFilter] = useState<"all" | "active" | "completed" | "cancelled">("all");

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

  const filteredAppts = appts.filter((a: any) => {
    if (apptFilter === "upcoming") return ["pending", "confirmed"].includes(a.status);
    if (apptFilter === "completed") return a.status === "completed";
    if (apptFilter === "cancelled") return a.status === "cancelled";
    return true;
  });

  const filteredOrders = orders.filter((o: any) => {
    if (orderFilter === "active") return !["completed", "cancelled"].includes(o.status);
    if (orderFilter === "completed") return o.status === "completed";
    if (orderFilter === "cancelled") return o.status === "cancelled";
    return true;
  });

  const upcomingCount = appts.filter((a: any) => ["pending", "confirmed"].includes(a.status)).length;
  const activeOrderCount = orders.filter((o: any) => !["completed", "cancelled"].includes(o.status)).length;

  const sectionItems: { key: Section; icon: React.ReactNode; label: string; count?: number }[] = [
    { key: "appointments", icon: <CalendarDays className="h-4 w-4" />, label: t("appointments"), count: upcomingCount },
    { key: "orders", icon: <ShoppingBag className="h-4 w-4" />, label: t("orders"), count: activeOrderCount },
    { key: "favorites", icon: <Heart className="h-4 w-4" />, label: t("favorites"), count: favs.length },
  ];

  return (
    <section className="min-h-[calc(100vh-160px)] bg-background">
      <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-8 sm:py-10">

        {/* ── Profile Card ── */}
        <Reveal direction="up">
          <div className="rounded-2xl bg-card p-5 sm:p-6"
            style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.06)" }}
          >
            <div className="flex items-start gap-4">
              <div className="grid h-16 w-16 sm:h-20 sm:w-20 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold/80 to-gold-muted text-gold-foreground font-display text-2xl sm:text-3xl">
                {(name || user.email || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                {!editing ? (
                  <>
                    <h1 className="font-display text-xl sm:text-2xl text-foreground truncate">{name || user.email}</h1>
                    <div className="mt-1.5 space-y-0.5">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground truncate"><Mail className="h-3 w-3 shrink-0" />{user.email}</p>
                      {phone && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3 w-3 shrink-0" />{phone}</p>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => setEditing(true)} className="border border-border/40 text-foreground px-4 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.06em] hover:bg-surface transition-colors flex items-center gap-1.5">
                        <Edit2 className="h-3 w-3" />{t("edit_profile")}
                      </button>
                      <button onClick={signOut} className="text-muted-foreground px-4 py-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.06em] hover:text-destructive hover:bg-surface transition-colors flex items-center gap-1.5">
                        <LogOut className="h-3 w-3" />{t("sign_out")}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[11px] font-bold uppercase tracking-[0.08em]">{t("full_name")}</Label>
                        <div className="relative mt-1">
                          <User className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} className="h-10 ps-9 rounded-lg" />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[11px] font-bold uppercase tracking-[0.08em]">{t("phone")}</Label>
                        <div className="relative mt-1">
                          <Phone className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input value={phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)} className="h-10 ps-9 rounded-lg" />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveProfile} className="bg-foreground text-background px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity">{t("save")}</button>
                      <button onClick={() => setEditing(false)} className="text-muted-foreground px-4 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-surface transition-colors">{t("cancel")}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Reveal>

        {/* ── Section Navigation ── */}
        <Reveal direction="up" delay={1}>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
            {sectionItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap transition-all ${
                  section === item.key
                    ? "bg-foreground text-background"
                    : "bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-2"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {(item.count ?? 0) > 0 && (
                  <span className={`grid h-5 min-w-5 place-items-center rounded-full text-[10px] font-bold ${
                    section === item.key ? "bg-background/20 text-background" : "bg-surface-3 text-muted-foreground"
                  }`}>{item.count}</span>
                )}
              </button>
            ))}
          </div>
        </Reveal>

        {/* ── Appointments Section ── */}
        {section === "appointments" && (
          <div className="mt-6">
            <Reveal direction="up">
              <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
                {([["all", t("all_categories").replace(/כל ה.*/, "הכל").replace(/كل ال.*/, "الكل").replace("All Categories", "All")],
                   ["upcoming", t("upcoming")], ["completed", t("completed")], ["cancelled", t("cancelled")]] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setApptFilter(val)}
                    className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap transition-colors ${
                      apptFilter === val ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:bg-surface-2"
                    }`}
                  >{label}</button>
                ))}
              </div>
            </Reveal>

            {filteredAppts.length === 0 && (
              <Reveal direction="scale">
                <div className="rounded-2xl border border-dashed border-border/40 py-14 text-center">
                  <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground/30" />
                  <p className="mt-3 text-[14px] text-muted-foreground">{t("no_appointments")}</p>
                  <Link to="/services"><button className="mt-4 bg-foreground text-background px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity">{t("book_appointment")}</button></Link>
                </div>
              </Reveal>
            )}

            <StaggerGrid className="space-y-3">
              {filteredAppts.map((a: any) => {
                const st = STATUS_STYLE[a.status] ?? STATUS_STYLE.pending;
                return (
                  <div key={a.id} className="rounded-2xl bg-card p-4 transition-all hover:shadow-md" style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}>
                    <div className="flex items-start gap-3">
                      {a.services?.image_url ? (
                        <img src={a.services.image_url} className="h-14 w-14 rounded-xl object-cover shrink-0" alt="" />
                      ) : (
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-surface"><CalendarDays className="h-5 w-5 text-primary" /></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-display text-[15px] text-foreground leading-tight">{pickLocalized(lang, a.services?.name, a.services?.name_ar)}</h3>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider shrink-0 ${st.bg}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{t(`status_${a.status}`)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{a.appointment_date}</span>
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{String(a.appointment_time).slice(0, 5)}</span>
                          <span className="font-semibold text-foreground">₪{a.total_price}</span>
                        </div>
                      </div>
                    </div>
                    {["pending", "confirmed"].includes(a.status) && (
                      <div className="mt-3 pt-3 border-t border-border/20 flex justify-end">
                        <button onClick={() => cancelAppt(a.id)} className="text-[11px] font-semibold uppercase tracking-[0.06em] text-destructive hover:bg-destructive/10 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">
                          <X className="h-3 w-3" />{t("cancel")}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </StaggerGrid>
          </div>
        )}

        {/* ── Orders Section ── */}
        {section === "orders" && (
          <div className="mt-6">
            <Reveal direction="up">
              <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
                {([["all", t("all_categories").replace(/כל ה.*/, "הכל").replace(/كل ال.*/, "الكل").replace("All Categories", "All")],
                   ["active", t("active")], ["completed", t("completed")], ["cancelled", t("cancelled")]] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setOrderFilter(val)}
                    className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap transition-colors ${
                      orderFilter === val ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:bg-surface-2"
                    }`}
                  >{label}</button>
                ))}
              </div>
            </Reveal>

            {filteredOrders.length === 0 && (
              <Reveal direction="scale">
                <div className="rounded-2xl border border-dashed border-border/40 py-14 text-center">
                  <ShoppingBag className="h-8 w-8 mx-auto text-muted-foreground/30" />
                  <p className="mt-3 text-[14px] text-muted-foreground">{t("no_orders")}</p>
                  <Link to="/products"><button className="mt-4 bg-foreground text-background px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity">{t("shop_products")}</button></Link>
                </div>
              </Reveal>
            )}

            <StaggerGrid className="space-y-3">
              {filteredOrders.map((o: any) => {
                const st = STATUS_STYLE[o.status] ?? STATUS_STYLE.pending;
                return (
                  <div key={o.id} className="rounded-2xl bg-card p-4" style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground font-medium">{t("order_number")} {o.order_number}</p>
                        <p className="text-sm text-foreground mt-1 font-medium">{(o.order_items ?? []).map((i: any) => `${i.product_name} ×${i.quantity}`).join("، ")}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider shrink-0 ${st.bg}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{t(`status_${o.status}`)}
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/20 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</span>
                      <span className="font-display text-lg text-foreground">₪{Number(o.total).toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </StaggerGrid>
          </div>
        )}

        {/* ── Favorites Section ── */}
        {section === "favorites" && (
          <div className="mt-6">
            {favs.length === 0 && (
              <Reveal direction="scale">
                <div className="rounded-2xl border border-dashed border-border/40 py-14 text-center">
                  <Heart className="h-8 w-8 mx-auto text-muted-foreground/30" />
                  <p className="mt-3 text-[14px] text-muted-foreground">{t("no_favorites")}</p>
                  <Link to="/products"><button className="mt-4 bg-foreground text-background px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity">{t("shop_products")}</button></Link>
                </div>
              </Reveal>
            )}

            <StaggerGrid className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {favs.map((p) => (
                <Link key={p.id} to="/products/$id" params={{ id: p.id }} className="group block rounded-2xl bg-card p-2.5 transition-all hover:shadow-md" style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}>
                  <div className="aspect-square overflow-hidden rounded-xl bg-surface">
                    {p.image_url && <img src={p.image_url} alt={p.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />}
                  </div>
                  <p className="mt-2 text-xs font-medium text-foreground truncate">{pickLocalized(lang, p.name, p.name_ar)}</p>
                  <p className="text-xs text-primary font-semibold">₪{p.price}</p>
                </Link>
              ))}
            </StaggerGrid>
          </div>
        )}

      </div>
    </section>
  );
}
