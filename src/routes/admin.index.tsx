import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAdminOverview } from "@/api/admin/overview";
import { useI18n } from "@/lib/i18n";
import { CalendarDays, ShoppingCart, DollarSign, AlertTriangle } from "lucide-react";
import { Reveal, StaggerGrid } from "@/components/ScrollReveal";

export const Route = createFileRoute("/admin/")({
  component: Overview,
});

function Overview() {
  const { lang } = useI18n();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);

  const { data } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => getAdminOverview(),
  });

  const stats = [
    { icon: <CalendarDays className="h-5 w-5" />, label: L("תורים קרובים", "المواعيد القادمة", "Upcoming Appointments"), value: String(data?.upcomingApptCount ?? 0) },
    { icon: <ShoppingCart className="h-5 w-5" />, label: L("הזמנות", "الطلبات", "Orders"), value: String(data?.orderCount ?? 0) },
    { icon: <DollarSign className="h-5 w-5" />, label: L("הכנסות", "الإيرادات", "Revenue"), value: `₪${(data?.revenue ?? 0).toFixed(0)}` },
    { icon: <AlertTriangle className="h-5 w-5" />, label: L("מלאי נמוך", "مخزون منخفض", "Low Stock"), value: String(data?.lowStock.length ?? 0) },
  ];

  return (
    <div className="space-y-6">
      <Reveal direction="up">
        <h1 className="font-display text-[26px] sm:text-[30px] text-foreground">{L("סקירה כללית", "نظرة عامة", "Overview")}</h1>
      </Reveal>

      <StaggerGrid className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-card p-4 transition-all hover:shadow-md"
            style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}
          >
            <div className="flex items-center justify-between">
              <div className="text-[12px] text-muted-foreground">{s.label}</div>
              <div className="text-primary">{s.icon}</div>
            </div>
            <div className="mt-2 font-display text-2xl text-foreground">{s.value}</div>
          </div>
        ))}
      </StaggerGrid>

      <div className="grid lg:grid-cols-2 gap-4">
        <Reveal direction="start">
          <div className="rounded-2xl bg-card p-5"
            style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}
          >
            <h2 className="font-display text-lg mb-3">{L("תורים קרובים", "المواعيد القادمة", "Upcoming Appointments")}</h2>
            <div className="space-y-2">
              {(data?.upcomingAppts ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm border-b border-border/20 pb-2 last:border-0">
                  <div>
                    <div className="font-medium">{a.customer_name}</div>
                    <div className="text-[11px] text-muted-foreground">{a.appointment_date}</div>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface">{a.status}</span>
                </div>
              ))}
              {(!data?.upcomingAppts || data.upcomingAppts.length === 0) && <div className="text-sm text-muted-foreground">—</div>}
            </div>
          </div>
        </Reveal>

        <Reveal direction="end" delay={1}>
          <div className="rounded-2xl bg-card p-5"
            style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}
          >
            <h2 className="font-display text-lg mb-3">{L("הזמנות אחרונות", "أحدث الطلبات", "Recent Orders")}</h2>
            <div className="space-y-2">
              {(data?.recentOrders ?? []).map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm border-b border-border/20 pb-2 last:border-0">
                  <div>
                    <div className="font-medium">{o.customer_name}</div>
                    <div className="text-[11px] text-muted-foreground">#{o.order_number}</div>
                  </div>
                  <div className="text-end">
                    <div className="text-sm">₪{Number(o.total).toFixed(0)}</div>
                    <span className="text-[11px] text-muted-foreground">{o.status}</span>
                  </div>
                </div>
              ))}
              {(!data?.recentOrders || data.recentOrders.length === 0) && <div className="text-sm text-muted-foreground">—</div>}
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal direction="up">
        <div className="rounded-2xl bg-card p-5"
          style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}
        >
          <h2 className="font-display text-lg mb-3">{L("מוצרים במלאי נמוך", "منتجات بمخزون منخفض", "Low Stock Products")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {(data?.lowStock ?? []).map((p) => (
              <div key={p.id} className="flex justify-between text-sm border border-border/20 rounded-xl px-3 py-2.5">
                <span>{lang === "ar" ? p.name_ar || p.name : p.name}</span>
                <span className="text-primary font-medium">{p.stock_quantity}</span>
              </div>
            ))}
            {(!data?.lowStock || data.lowStock.length === 0) && <div className="text-sm text-muted-foreground">—</div>}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
