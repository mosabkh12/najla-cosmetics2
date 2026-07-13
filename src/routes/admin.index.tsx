import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAdminOverview } from "@/api/admin/overview";
import { useI18n } from "@/lib/i18n";
import {
  CalendarDays,
  ShoppingCart,
  DollarSign,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  Clock,
  Package,
  Loader2,
} from "lucide-react";
import { Reveal, StaggerGrid } from "@/components/ScrollReveal";

export const Route = createFileRoute("/admin/")({
  component: Overview,
});

const statusColor: Record<string, string> = {
  pending: "bg-gold-deep/10 text-gold-deep border-gold-deep/20",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  preparing: "bg-terracotta-soft text-terracotta border-terracotta/20",
  completed: "bg-sage-soft text-sage border-sage/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};
const statusDot: Record<string, string> = {
  pending: "bg-gold-deep",
  confirmed: "bg-primary",
  preparing: "bg-terracotta",
  completed: "bg-sage",
  cancelled: "bg-destructive",
};

function Overview() {
  const { lang } = useI18n();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => getAdminOverview(),
  });

  const stats = [
    {
      icon: <CalendarDays className="h-5 w-5" />,
      label: L("תורים קרובים", "المواعيد القادمة", "Upcoming"),
      value: String(data?.upcomingApptCount ?? 0),
      bg: "bg-primary/10",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      link: "/admin/appointments",
    },
    {
      icon: <ShoppingCart className="h-5 w-5" />,
      label: L("הזמנות", "الطلبات", "Orders"),
      value: String(data?.orderCount ?? 0),
      bg: "bg-terracotta-soft",
      iconBg: "bg-terracotta-soft",
      iconColor: "text-terracotta",
      link: "/admin/orders",
    },
    {
      icon: <DollarSign className="h-5 w-5" />,
      label: L("הכנסות", "الإيرادات", "Revenue"),
      value: `₪${(data?.revenue ?? 0).toLocaleString("en", { maximumFractionDigits: 0 })}`,
      bg: "bg-sage-soft",
      iconBg: "bg-sage-soft",
      iconColor: "text-sage",
      link: "/admin/orders",
    },
    {
      icon: <AlertTriangle className="h-5 w-5" />,
      label: L("מלאי נמוך", "مخزون منخفض", "Low Stock"),
      value: String(data?.lowStock.length ?? 0),
      bg: "bg-gold-deep/10",
      iconBg: "bg-gold-deep/10",
      iconColor: "text-gold-deep",
      link: "/admin/products",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <Reveal direction="up">
        <div>
          <h1 className="font-display text-[26px] sm:text-[32px] text-foreground">
            {L("שלום, מנהל", "مرحباً، مدير", "Welcome back")}{" "}
            <span className="text-primary">&#10045;</span>
          </h1>
          <p className="text-[14px] text-muted-foreground mt-1.5">
            {L(
              "הנה סיכום העסק שלך להיום",
              "إليك ملخص عملك اليوم",
              "Here's your business overview for today",
            )}
          </p>
        </div>
      </Reveal>

      {/* Stat cards */}
      <StaggerGrid className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.link}>
            <div
              className="group rounded-2xl bg-card p-4 sm:p-5 transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer border border-border/10"
              style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
            >
              <div className="flex items-start justify-between">
                <div
                  className={`grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-xl ${s.iconBg} ${s.iconColor}`}
                >
                  {s.icon}
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
              <div className="mt-4">
                <div className="font-display text-[28px] sm:text-[32px] text-foreground leading-none">
                  {isLoading ? (
                    <span className="inline-block h-7 w-12 rounded-md bg-surface animate-pulse" />
                  ) : (
                    s.value
                  )}
                </div>
                <div className="text-[12px] text-muted-foreground mt-1.5 font-medium">
                  {s.label}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </StaggerGrid>

      {/* Two-column: Appointments + Orders */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-5">
        {/* Upcoming Appointments */}
        <Reveal direction="up">
          <div
            className="rounded-2xl bg-card border border-border/10 overflow-hidden"
            style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/15">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10">
                  <CalendarDays className="h-4 w-4 text-primary" />
                </div>
                <h2 className="font-display text-[16px] text-foreground">
                  {L("תורים קרובים", "المواعيد القادمة", "Upcoming Appointments")}
                </h2>
              </div>
              <Link
                to="/admin/appointments"
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                {L("הכל", "الكل", "View all")}
              </Link>
            </div>
            <div className="divide-y divide-border/10">
              {isLoading && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
                </div>
              )}
              {!isLoading &&
                (data?.upcomingAppts ?? []).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-surface/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-surface text-[12px] font-semibold text-foreground shrink-0">
                        {(a.customer_name ?? "?")[0]}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium text-foreground">
                          {a.customer_name}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {a.appointment_date}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${statusColor[a.status] ?? "bg-surface text-muted-foreground border-border/30"}`}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full me-1.5 ${statusDot[a.status] ?? "bg-muted-foreground"}`}
                      />
                      {a.status}
                    </span>
                  </div>
                ))}
              {!isLoading && (!data?.upcomingAppts || data.upcomingAppts.length === 0) && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CalendarDays className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <div className="text-[13px] text-muted-foreground">
                    {L("אין תורים קרובים", "لا مواعيد قادمة", "No upcoming appointments")}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Reveal>

        {/* Recent Orders */}
        <Reveal direction="up" delay={1}>
          <div
            className="rounded-2xl bg-card border border-border/10 overflow-hidden"
            style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/15">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-terracotta-soft">
                  <ShoppingCart className="h-4 w-4 text-terracotta" />
                </div>
                <h2 className="font-display text-[16px] text-foreground">
                  {L("הזמנות אחרונות", "أحدث الطلبات", "Recent Orders")}
                </h2>
              </div>
              <Link
                to="/admin/orders"
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                {L("הכל", "الكل", "View all")}
              </Link>
            </div>
            <div className="divide-y divide-border/10">
              {isLoading && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
                </div>
              )}
              {!isLoading &&
                (data?.recentOrders ?? []).map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-surface/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-surface text-[12px] font-semibold text-foreground shrink-0">
                        {(o.customer_name ?? "?")[0]}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium text-foreground">
                          {o.customer_name}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          #{o.order_number}
                        </div>
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-[14px] font-semibold text-foreground">
                        ₪{Number(o.total).toFixed(0)}
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 mt-0.5 ${statusColor[o.status] ?? "bg-surface text-muted-foreground border-border/30"}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${statusDot[o.status] ?? "bg-muted-foreground"}`}
                        />
                        {o.status}
                      </span>
                    </div>
                  </div>
                ))}
              {!isLoading && (!data?.recentOrders || data.recentOrders.length === 0) && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <ShoppingCart className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <div className="text-[13px] text-muted-foreground">
                    {L("אין הזמנות עדיין", "لا طلبات بعد", "No orders yet")}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>

      {/* Low Stock */}
      <Reveal direction="up">
        <div
          className="rounded-2xl bg-card border border-border/10 overflow-hidden"
          style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/15">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-gold-deep/10">
                <AlertTriangle className="h-4 w-4 text-gold-deep" />
              </div>
              <h2 className="font-display text-[16px] text-foreground">
                {L("מוצרים במלאי נמוך", "منتجات بمخزون منخفض", "Low Stock Products")}
              </h2>
            </div>
            <Link
              to="/admin/products"
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              {L("כל המוצרים", "جميع المنتجات", "All products")}
            </Link>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
            </div>
          ) : (data?.lowStock ?? []).length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border/10">
              {(data?.lowStock ?? []).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-5 py-3.5 bg-card hover:bg-surface/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-gold-deep/10 shrink-0">
                      <Package className="h-3.5 w-3.5 text-gold-deep" />
                    </div>
                    <span className="text-[13px] font-medium text-foreground">
                      {lang === "ar" ? p.name_ar || p.name : p.name}
                    </span>
                  </div>
                  <span className="text-[13px] font-bold text-gold-deep bg-gold-deep/10 px-2.5 py-1 rounded-lg">
                    {p.stock_quantity}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Package className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <div className="text-[13px] text-muted-foreground">
                {L("כל המוצרים במלאי", "جميع المنتجات متوفرة", "All products in stock")}
              </div>
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}
