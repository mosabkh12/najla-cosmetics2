import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "./middleware";

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);
    const [appts, orders, revenue, lowStock] = await Promise.all([
      supabaseAdmin.from("appointments").select("id,status,appointment_date,customer_name", { count: "exact" }).gte("appointment_date", today).order("appointment_date").limit(5),
      supabaseAdmin.from("orders").select("id,status,total,order_number,created_at,customer_name", { count: "exact" }).order("created_at", { ascending: false }).limit(5),
      supabaseAdmin.from("orders").select("total").eq("status", "completed"),
      supabaseAdmin.from("products").select("id,name,name_ar,stock_quantity,low_stock_threshold").eq("is_active", true),
    ]);
    const rev = (revenue.data ?? []).reduce((s: number, r: any) => s + Number(r.total), 0);
    const low = (lowStock.data ?? []).filter((p: any) => p.stock_quantity <= (p.low_stock_threshold ?? 5));
    return {
      upcomingAppts: appts.data ?? [],
      upcomingApptCount: appts.count ?? 0,
      recentOrders: orders.data ?? [],
      orderCount: orders.count ?? 0,
      revenue: rev,
      lowStock: low,
    };
  });
