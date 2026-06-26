import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { CalendarDays, ShoppingCart, DollarSign, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: Overview,
});

function Overview() {
  const { lang } = useI18n();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);

  const { data } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [appts, orders, revenue, lowStock] = await Promise.all([
        supabase.from("appointments").select("id,status,appointment_date,customer_name", { count: "exact" }).gte("appointment_date", today).order("appointment_date").limit(5),
        supabase.from("orders").select("id,status,total,order_number,created_at,customer_name", { count: "exact" }).order("created_at", { ascending: false }).limit(5),
        supabase.from("orders").select("total").eq("status", "completed"),
        supabase.from("products").select("id,name,name_ar,stock_quantity,low_stock_threshold").eq("is_active", true),
      ]);
      const rev = (revenue.data ?? []).reduce((s, r) => s + Number(r.total), 0);
      const low = (lowStock.data ?? []).filter((p) => p.stock_quantity <= (p.low_stock_threshold ?? 5));
      return {
        upcomingAppts: appts.data ?? [],
        upcomingApptCount: appts.count ?? 0,
        recentOrders: orders.data ?? [],
        orderCount: orders.count ?? 0,
        revenue: rev,
        lowStock: low,
      };
    },
  });

  const stat = (icon: React.ReactNode, label: string, value: string) => (
    <div className="rounded-2xl border border-border/60 bg-card p-4 soft-shadow">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-secondary-foreground">{label}</div>
        <div className="text-primary">{icon}</div>
      </div>
      <div className="mt-2 font-display text-2xl text-foreground">{value}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-foreground">{L("סקירה כללית", "نظرة عامة", "Overview")}</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stat(<CalendarDays className="h-4 w-4" />, L("תורים קרובים", "المواعيد القادمة", "Upcoming Appointments"), String(data?.upcomingApptCount ?? 0))}
        {stat(<ShoppingCart className="h-4 w-4" />, L("הזמנות", "الطلبات", "Orders"), String(data?.orderCount ?? 0))}
        {stat(<DollarSign className="h-4 w-4" />, L("הכנסות", "الإيرادات", "Revenue"), `₪${(data?.revenue ?? 0).toFixed(0)}`)}
        {stat(<AlertTriangle className="h-4 w-4" />, L("מלאי נמוך", "مخزون منخفض", "Low Stock"), String(data?.lowStock.length ?? 0))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border/60 bg-card p-5 soft-shadow">
          <h2 className="font-display text-lg mb-3">{L("תורים קרובים", "المواعيد القادمة", "Upcoming Appointments")}</h2>
          <div className="space-y-2">
            {(data?.upcomingAppts ?? []).map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm border-b border-border/40 pb-2 last:border-0">
                <div>
                  <div className="font-medium">{a.customer_name}</div>
                  <div className="text-[11px] text-secondary-foreground">{a.appointment_date}</div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface">{a.status}</span>
              </div>
            ))}
            {(!data?.upcomingAppts || data.upcomingAppts.length === 0) && <div className="text-sm text-secondary-foreground">—</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-5 soft-shadow">
          <h2 className="font-display text-lg mb-3">{L("הזמנות אחרונות", "أحدث الطلبات", "Recent Orders")}</h2>
          <div className="space-y-2">
            {(data?.recentOrders ?? []).map((o) => (
              <div key={o.id} className="flex items-center justify-between text-sm border-b border-border/40 pb-2 last:border-0">
                <div>
                  <div className="font-medium">{o.customer_name}</div>
                  <div className="text-[11px] text-secondary-foreground">#{o.order_number}</div>
                </div>
                <div className="text-end">
                  <div className="text-sm">₪{Number(o.total).toFixed(0)}</div>
                  <span className="text-[11px] text-secondary-foreground">{o.status}</span>
                </div>
              </div>
            ))}
            {(!data?.recentOrders || data.recentOrders.length === 0) && <div className="text-sm text-secondary-foreground">—</div>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-5 soft-shadow">
        <h2 className="font-display text-lg mb-3">{L("מוצרים במלאי נמוך", "منتجات بمخزون منخفض", "Low Stock Products")}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(data?.lowStock ?? []).map((p) => (
            <div key={p.id} className="flex justify-between text-sm border border-border/60 rounded-lg px-3 py-2">
              <span>{lang === "ar" ? p.name_ar || p.name : p.name}</span>
              <span className="text-primary font-medium">{p.stock_quantity}</span>
            </div>
          ))}
          {(!data?.lowStock || data.lowStock.length === 0) && <div className="text-sm text-secondary-foreground">—</div>}
        </div>
      </div>
    </div>
  );
}
