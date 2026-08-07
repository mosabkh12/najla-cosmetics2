import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "./middleware";

// Aggregates are computed here (not via a DB view/RPC) by fetching the
// three tables in parallel and reducing in memory — this business's data
// volume (customers/orders/appointments) is small enough that this is both
// simpler to reason about and simpler to change than introducing a new SQL
// view or RPC just for one admin screen.
type CustomerAgg = {
  orderCount: number;
  completedOrderTotal: number;
  lastOrderAt: string | null;
  appointmentCount: number;
  completedAppointmentTotal: number;
  lastAppointmentAt: string | null;
  favoriteCount: number;
};

function newAgg(): CustomerAgg {
  return {
    orderCount: 0,
    completedOrderTotal: 0,
    lastOrderAt: null,
    appointmentCount: 0,
    completedAppointmentTotal: 0,
    lastAppointmentAt: null,
    favoriteCount: 0,
  };
}

function latest(a: string | null, b: string): string {
  return !a || b > a ? b : a;
}

export const getAdminCustomers = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { data: profiles, error: profilesError },
      { data: orders },
      { data: appointments },
      { data: favorites },
    ] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(
          "id, full_name, phone, email, email_verified, role, language, avatar_url, created_at",
        )
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("orders").select("user_id, status, total, created_at"),
      supabaseAdmin.from("appointments").select("user_id, status, total_price, created_at"),
      supabaseAdmin.from("favorites").select("user_id"),
    ]);
    if (profilesError) throw profilesError;

    const aggByUser = new Map<string, CustomerAgg>();
    const agg = (userId: string): CustomerAgg => {
      let a = aggByUser.get(userId);
      if (!a) {
        a = newAgg();
        aggByUser.set(userId, a);
      }
      return a;
    };

    // "Completed" mirrors how admin-overview.ts already defines revenue —
    // pending/preparing/cancelled orders and appointments aren't realized
    // value yet, so they count toward activity totals but not spend.
    for (const o of orders ?? []) {
      const a = agg(o.user_id);
      a.orderCount += 1;
      if (o.status === "completed") a.completedOrderTotal += Number(o.total);
      a.lastOrderAt = latest(a.lastOrderAt, o.created_at);
    }
    for (const ap of appointments ?? []) {
      const a = agg(ap.user_id);
      a.appointmentCount += 1;
      if (ap.status === "completed") a.completedAppointmentTotal += Number(ap.total_price);
      a.lastAppointmentAt = latest(a.lastAppointmentAt, ap.created_at);
    }
    for (const f of favorites ?? []) {
      agg(f.user_id).favoriteCount += 1;
    }

    return (profiles ?? []).map((p) => {
      const a = aggByUser.get(p.id);
      const lastActivityAt =
        a?.lastOrderAt && a?.lastAppointmentAt
          ? latest(a.lastOrderAt, a.lastAppointmentAt)
          : (a?.lastOrderAt ?? a?.lastAppointmentAt ?? null);
      return {
        ...p,
        orderCount: a?.orderCount ?? 0,
        appointmentCount: a?.appointmentCount ?? 0,
        favoriteCount: a?.favoriteCount ?? 0,
        lifetimeValue: (a?.completedOrderTotal ?? 0) + (a?.completedAppointmentTotal ?? 0),
        lastActivityAt,
      };
    });
  });

export const getAdminCustomerDetail = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator((d: { userId: string }) => d)
  .handler(async ({ data: { userId } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { data: profile, error: profileError },
      { data: orders },
      { data: appointments },
      { data: favorites },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabaseAdmin
        .from("orders")
        .select("*, order_items(*, products(image_url, thumbnail_url))")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("appointments")
        .select("*, service:services(name, name_ar, image_url, thumbnail_url)")
        .eq("user_id", userId)
        .order("appointment_date", { ascending: false })
        .order("appointment_time", { ascending: false }),
      supabaseAdmin
        .from("favorites")
        .select("product_id, created_at, products(name, name_ar, image_url, thumbnail_url, price)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);
    if (profileError) throw profileError;
    if (!profile) throw new Error("CUSTOMER_NOT_FOUND");

    return {
      profile,
      orders: orders ?? [],
      appointments: appointments ?? [],
      favorites: favorites ?? [],
    };
  });
