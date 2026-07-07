import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "./middleware";
import { jerusalemTodayStr } from "@/lib/jerusalem-time";

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Asia/Jerusalem, not the server's own timezone — matches every other
    // "today" calculation in the appointments system (see jerusalem-time.ts).
    const today = jerusalemTodayStr();
    const [appts, orders, revenue, lowStock] = await Promise.all([
      supabaseAdmin
        .from("appointments")
        .select("id,status,appointment_date,customer_name", { count: "exact" })
        .gte("appointment_date", today)
        // "Upcoming" must mean still-actionable appointments — a cancelled
        // or already-completed one dated today/later shouldn't count as
        // something the admin still needs to prepare for.
        .in("status", ["pending", "confirmed"])
        .order("appointment_date")
        .limit(5),
      supabaseAdmin
        .from("orders")
        .select("id,status,total,order_number,created_at,customer_name", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin.from("orders").select("total").eq("status", "completed"),
      supabaseAdmin
        .from("products")
        .select("id,name,name_ar,stock_quantity,low_stock_threshold")
        .eq("is_active", true),
    ]);
    const rev = (revenue.data ?? []).reduce((s, r) => s + Number(r.total), 0);
    const low = (lowStock.data ?? []).filter(
      (p) => p.stock_quantity <= (p.low_stock_threshold ?? 5),
    );
    return {
      upcomingAppts: appts.data ?? [],
      upcomingApptCount: appts.count ?? 0,
      recentOrders: orders.data ?? [],
      orderCount: orders.count ?? 0,
      revenue: rev,
      lowStock: low,
    };
  });
