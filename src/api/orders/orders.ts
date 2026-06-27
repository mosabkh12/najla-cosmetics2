import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "../admin/middleware";

export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { customer_name: string; customer_phone: string; notes: string | null; delivery_method: string; subtotal: number; items: { product_id: string; product_name: string; quantity: number; unit_price: number; total_price: number }[] }) => d)
  .handler(async ({ data, context }) => {
    const { data: order, error: oErr } = await context.supabase.from("orders").insert({
      user_id: context.userId,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      notes: data.notes,
      delivery_method: data.delivery_method,
      payment_method: "pay_at_store",
      subtotal: data.subtotal,
      total: data.subtotal,
      status: "pending",
    }).select().single();
    if (oErr || !order) throw oErr ?? new Error("Order creation failed");
    const itemsPayload = data.items.map((it) => ({ order_id: order.id, ...it }));
    const { error: iErr } = await context.supabase.from("order_items").insert(itemsPayload);
    if (iErr) throw iErr;
    return { success: true, orderId: order.id };
  });

export const getUserOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("orders").select("*, order_items(*)").eq("user_id", context.userId).order("created_at", { ascending: false });
    return data ?? [];
  });

export const getAdminOrders = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("orders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getOrderItems = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator((d: { orderId: string }) => d)
  .handler(async ({ data: { orderId } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("order_items").select("*").eq("order_id", orderId);
    if (error) throw error;
    return data ?? [];
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string; status: string }) => d)
  .handler(async ({ data: { id, status } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = { status };
    if (status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from("orders").update(patch).eq("id", id);
    if (error) throw error;
    return { success: true };
  });
