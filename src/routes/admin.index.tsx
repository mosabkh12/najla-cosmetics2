import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAdminOverview } from "@/api/admin/overview";
import { useI18n } from "@/lib/i18n";
import { CalendarDays, ShoppingCart, DollarSign, AlertTriangle, ArrowUpRight, TrendingUp, Clock, Package } from "lucide-react";
import { Reveal, StaggerGrid } from "@/components/ScrollReveal";

export const Route = createFileRoute("/admin/")({
  component: Overview,
});

const statusColor: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-blue-50 text-blue-700 border-blue-200",
  preparing: "bg-purple-50 text-purple-700 border-purple-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
};
const statusDot: Record<string, string> = {
  pending: "bg-amber-500",
  confirmed: "bg-blue-500",
  preparing: "bg-purple-500",
  completed: "bg-emerald-500",
  cancelled: "bg-red-500",
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
      bg: "bg-blue-50",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      link: "/admin/appointments",
    },
    {
      icon: <ShoppingCart className="h-5 w-5" />,
      label: L("הזמנות", "الطلبات", "Orders"),
      value: String(data?.orderCount ?? 0),
      bg: "bg-purple-50",
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
      link: "/admin/orders",
    },
    {
      icon: <DollarSign className="h-5 w-5" />,
      label: L("הכנסות", "الإيرادات", "Revenue"),
      value: `₪${(data?.revenue ?? 0).toLocaleString("en", { maximumFractionDigits: 0 })}`,
      bg: "bg-emerald-50",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      link: "/admin/orders",
    },
    {
      icon: <AlertTriangle className="h-5 w-5" />,
      label: L("מלאי נמוך", "مخزون منخفض", "Low Stock"),
      value: String(data?.lowStock.length ?? 0),
      bg: "bg-amber-50",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      link: "/admin/products",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <Reveal direction="up">
        <div>
          <h1 className="font-display text-[26px] sm:text-[32px] text-foreground">
            {L("שלום, מנהל", "مرحباً، مدير", "Welcome back")} <span className="text-primary">&#10045;</span>
          </h1>
          <p className="text-[14px] text-muted-foreground mt-1.5">
            {L("הנה סיכום העסק שלך להיום", "إليك ملخص عملك اليوم", "Here's your business overview for today")}
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
                <div className={`grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-xl ${s.iconBg} ${s.iconColor}`}>
                  {s.icon}
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
              <div className="mt-4">
                <div className="font-display text-[28px] sm:text-[32px] text-foreground leading-none">{s.value}</div>
                <div className="text-[12px] text-muted-foreground mt-1.5 font-medium">{s.label}</div>
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
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50">
                  <CalendarDays className="h-4 w-4 text-blue-600" />
                </div>
                <h2 className="font-display text-[16px] text-foreground">{L("תורים קרובים", "المواعيد القادمة", "Upcoming Appointments")}</h2>
              </div>
              <Link to="/admin/appointments" className="text-[11px] font-semibold text-primary hover:underline">
                {L("הכל", "الكل", "View all")}
              </Link>
            </div>
            <div className="divide-y divide-border/10">
              {(data?.upcomingAppts ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-surface/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-surface text-[12px] font-semibold text-foreground shrink-0">
                      {(a.customer_name ?? "?")[0]}
                    </div>
                    <div>
                      <div className="text-[13px] font-medium text-foreground">{a.customer_name}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {a.appointment_date}
                      </div>
                    </div>
                  </div>
                  <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${statusColor[a.status] ?? "bg-surface text-muted-foreground border-border/30"}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full me-1.5 ${statusDot[a.status] ?? "bg-muted-foreground"}`} />
                    {a.status}
                  </span>
                </div>
              ))}
              {(!data?.upcomingAppts || data.upcomingAppts.length === 0) && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CalendarDays className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <div className="text-[13px] text-muted-foreground">{L("אין תורים קרובים", "لا مواعيد قادمة", "No upcoming appointments")}</div>
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
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-purple-50">
                  <ShoppingCart className="h-4 w-4 text-purple-600" />
                </div>
                <h2 className="font-display text-[16px] text-foreground">{L("הזמנות אחרונות", "أحدث الطلبات", "Recent Orders")}</h2>
              </div>
              <Link to="/admin/orders" className="text-[11px] font-semibold text-primary hover:underline">
                {L("הכל", "الكل", "View all")}
              </Link>
            </div>
            <div className="divide-y divide-border/10">
              {(data?.recentOrders ?? []).map((o) => (
                <div key={o.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-surface/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-surface text-[12px] font-semibold text-foreground shrink-0">
                      {(o.customer_name ?? "?")[0]}
                    </div>
                    <div>
                      <div className="text-[13px] font-medium text-foreground">{o.customer_name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">#{o.order_number}</div>
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="text-[14px] font-semibold text-foreground">₪{Number(o.total).toFixed(0)}</div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 mt-0.5 ${statusColor[o.status] ?? "bg-surface text-muted-foreground border-border/30"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDot[o.status] ?? "bg-muted-foreground"}`} />
                      {o.status}
                    </span>
                  </div>
                </div>
              ))}
              {(!data?.recentOrders || data.recentOrders.length === 0) && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <ShoppingCart className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <div className="text-[13px] text-muted-foreground">{L("אין הזמנות עדיין", "لا طلبات بعد", "No orders yet")}</div>
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
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <h2 className="font-display text-[16px] text-foreground">{L("מוצרים במלאי נמוך", "منتجات بمخزون منخفض", "Low Stock Products")}</h2>
            </div>
            <Link to="/admin/products" className="text-[11px] font-semibold text-primary hover:underline">
              {L("כל המוצרים", "جميع المنتجات", "All products")}
            </Link>
          </div>
          {(data?.lowStock ?? []).length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border/10">
              {(data?.lowStock ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3.5 bg-card hover:bg-surface/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 shrink-0">
                      <Package className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <span className="text-[13px] font-medium text-foreground">{lang === "ar" ? p.name_ar || p.name : p.name}</span>
                  </div>
                  <span className="text-[13px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg">{p.stock_quantity}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Package className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <div className="text-[13px] text-muted-foreground">{L("כל המוצרים במלאי", "جميع المنتجات متوفرة", "All products in stock")}</div>
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}
