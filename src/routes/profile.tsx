import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Edit2, LogOut, CalendarDays, ShoppingBag, Clock, Phone, Mail, User, X, CalendarClock, Info, Trash2 } from "lucide-react";

import { getProfile, updateProfile } from "@/api/profiles/profiles";
import { getUserAppointments, cancelAppointment, deleteAppointment, clearAppointmentHistory } from "@/api/appointments/appointments";
import { getUserOrders } from "@/api/orders/orders";
import { getUserFavorites } from "@/api/favorites/favorites";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, pickLocalized } from "@/lib/i18n";
import type { Product } from "@/components/products/ProductCard";
import { toast } from "sonner";
import { Reveal, StaggerGrid } from "@/components/ScrollReveal";
import { RescheduleDialog, type RescheduleTarget } from "@/components/services/RescheduleDialog";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "My Account — Najla Cosmetics" }] }),
  component: ProfilePage,
});

const STATUS_STYLE: Record<string, { bg: string; dot: string }> = {
  pending: { bg: "bg-surface-2 text-foreground", dot: "bg-muted-foreground" },
  confirmed: { bg: "bg-surface-3 text-foreground", dot: "bg-foreground" },
  completed: { bg: "bg-surface text-muted-foreground", dot: "bg-muted-foreground" },
  cancelled: { bg: "bg-[#FFDAD6]/50 text-[#93000A]", dot: "bg-[#BA1A1A]" },
  preparing: { bg: "bg-surface-2 text-foreground", dot: "bg-muted-foreground" },
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
  const [reschedulingAppt, setReschedulingAppt] = useState<RescheduleTarget | null>(null);

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id], enabled: !!user,
    queryFn: () => getProfile(),
  });
  useEffect(() => { if (profile) { setName(profile.full_name ?? ""); setPhone(profile.phone ?? ""); } }, [profile]);

  const { data: appts = [] } = useQuery({
    queryKey: ["appointments", user?.id], enabled: !!user,
    queryFn: () => getUserAppointments(),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["orders", user?.id], enabled: !!user,
    queryFn: () => getUserOrders(),
  });

  const { data: favs = [] } = useQuery({
    queryKey: ["favorites", user?.id], enabled: !!user,
    queryFn: async () => (await getUserFavorites()) as Product[],
  });

  if (!user) return null;

  const saveProfile = async () => {
    try {
      await updateProfile({ data: { full_name: name, phone } });
      toast.success(t("save"));
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["profile", user.id] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const cancelAppt = async (apptId: string) => {
    try {
      await cancelAppointment({ data: { id: apptId } });
    } catch (e: any) {
      toast.error(e.message);
    }
    qc.invalidateQueries({ queryKey: ["appointments", user.id] });
  };

  const deleteAppt = async (apptId: string) => {
    if (!confirm(t("delete_appointment_confirm"))) return;
    try {
      await deleteAppointment({ data: { id: apptId } });
      toast.success(t("appointment_deleted"));
    } catch (e: any) {
      toast.error(e.message);
    }
    qc.invalidateQueries({ queryKey: ["appointments", user.id] });
  };

  const clearHistory = async () => {
    if (!confirm(t("clear_history_confirm"))) return;
    try {
      await clearAppointmentHistory();
      toast.success(t("history_cleared"));
    } catch (e: any) {
      toast.error(e.message);
    }
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
  const hasApptHistory = appts.some((a: any) => ["completed", "cancelled"].includes(a.status));
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
              <div className="grid h-16 w-16 sm:h-20 sm:w-20 shrink-0 place-items-center rounded-full bg-foreground text-background font-display text-2xl sm:text-3xl">
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
            {upcomingCount >= 2 && (
              <Reveal direction="up">
                <div className="mb-5 rounded-2xl bg-cream border border-primary/15 px-4 py-3 flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-[12.5px] text-foreground leading-relaxed">{t("max_appointments_notice")}</p>
                </div>
              </Reveal>
            )}
            <Reveal direction="up" className="mb-5">
              <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1">
                <div className="flex gap-1.5">
                  {([["all", t("all_categories").replace(/כל ה.*/, "הכל").replace(/كل ال.*/, "الكل").replace("All Categories", "All")],
                     ["upcoming", t("upcoming")], ["completed", t("completed")], ["cancelled", t("cancelled")]] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setApptFilter(val)}
                      className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap transition-colors ${
                        apptFilter === val ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:bg-surface-2"
                      }`}
                    >{label}</button>
                  ))}
                </div>
                {hasApptHistory && (
                  <button onClick={clearHistory} className="shrink-0 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-destructive hover:bg-destructive/10 px-3 py-1.5 rounded-full transition-colors">
                    <Trash2 className="h-3 w-3" />{t("clear_history")}
                  </button>
                )}
              </div>
              {hasApptHistory && (
                <p className="mt-2 text-[11px] text-muted-foreground">{t("appointment_auto_delete_notice")}</p>
              )}
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
                      <div className="mt-3 pt-3 border-t border-border/20 flex justify-end gap-2">
                        <button
                          onClick={() => setReschedulingAppt({ id: a.id, service_id: a.service_id, appointment_date: a.appointment_date, appointment_time: String(a.appointment_time).slice(0, 5) })}
                          className="text-[11px] font-semibold uppercase tracking-[0.06em] text-primary hover:bg-primary/10 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                        >
                          <CalendarClock className="h-3 w-3" />{t("reschedule")}
                        </button>
                        <button onClick={() => cancelAppt(a.id)} className="text-[11px] font-semibold uppercase tracking-[0.06em] text-destructive hover:bg-destructive/10 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">
                          <X className="h-3 w-3" />{t("cancel")}
                        </button>
                      </div>
                    )}
                    {["completed", "cancelled"].includes(a.status) && (
                      <div className="mt-3 pt-3 border-t border-border/20 flex justify-end">
                        <button onClick={() => deleteAppt(a.id)} className="text-[11px] font-semibold uppercase tracking-[0.06em] text-destructive hover:bg-destructive/10 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">
                          <Trash2 className="h-3 w-3" />{t("delete")}
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

      <RescheduleDialog
        appointment={reschedulingAppt}
        open={!!reschedulingAppt}
        onOpenChange={(o) => { if (!o) setReschedulingAppt(null); }}
        onDone={() => qc.invalidateQueries({ queryKey: ["appointments", user.id] })}
      />
    </section>
  );
}
