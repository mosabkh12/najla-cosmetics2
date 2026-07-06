import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "../admin/middleware";

const MAX_QTY_PER_ITEM = 100;
const MAX_UNIQUE_PRODUCTS = 50;
const MAX_NAME_LENGTH = 100;
const MAX_PHONE_LENGTH = 30;
const MAX_NOTES_LENGTH = 1000;
// The only delivery methods the app actually offers today (checkout.tsx
// only ever sends "pickup"). Must match the CHECK constraint on
// public.orders.delivery_method.
const ALLOWED_DELIVERY_METHODS = ["pickup"];
// Prefixes the create_order() RPC raises on validation failure — mapped
// to clean, translatable codes so raw Postgres error text never reaches
// the browser.
const ORDER_ERROR_CODES = ["OUT_OF_STOCK", "PRODUCT_NOT_AVAILABLE", "INVALID_ORDER"];

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// The browser may only ever specify WHAT it wants (product_id + quantity)
// and its own customer details. Prices, product names, subtotal/total,
// and order status are computed inside the create_order() database
// function from products.price — never trusted from the client.
export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      customer_name: string;
      customer_phone: string;
      notes: string | null;
      delivery_method: string;
      items: { product_id: string; quantity: number }[];
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const customerName = (data.customer_name ?? "").trim();
    const customerPhone = (data.customer_phone ?? "").trim();
    if (!customerName || !customerPhone) throw new Error("INVALID_ORDER");
    if (customerName.length > MAX_NAME_LENGTH || customerPhone.length > MAX_PHONE_LENGTH) {
      throw new Error("INVALID_ORDER");
    }

    const notes = data.notes?.trim() || null;
    if (notes && notes.length > MAX_NOTES_LENGTH) throw new Error("INVALID_ORDER");

    const deliveryMethod = data.delivery_method || "pickup";
    if (!ALLOWED_DELIVERY_METHODS.includes(deliveryMethod)) throw new Error("INVALID_ORDER");

    if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("INVALID_ORDER");

    const items = data.items.map((it) => {
      const productId = typeof it.product_id === "string" ? it.product_id.trim() : "";
      const quantity = Number(it.quantity);
      if (!productId) throw new Error("INVALID_ORDER");
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QTY_PER_ITEM) {
        throw new Error("INVALID_ORDER");
      }
      return { product_id: productId, quantity };
    });

    // Duplicate product_id lines are merged authoritatively inside the
    // create_order() RPC; this is just a fast, cheap upper-bound check
    // on distinct products so an oversized payload fails before the
    // round trip.
    const uniqueProductIds = new Set(items.map((it) => it.product_id));
    if (uniqueProductIds.size > MAX_UNIQUE_PRODUCTS) throw new Error("INVALID_ORDER");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: orderId, error } = await supabaseAdmin.rpc("create_order", {
      p_user_id: context.userId,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_notes: notes,
      p_delivery_method: deliveryMethod,
      p_items: items,
    });

    if (error || !orderId) {
      const code = ORDER_ERROR_CODES.find((c) => error?.message?.startsWith(c));
      if (code) throw new Error(code);
      console.error("[createOrder] failed for user", context.userId, error);
      throw new Error("ORDER_CREATION_FAILED");
    }

    return { success: true, orderId };
  });

export const getUserOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const getAdminOrders = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const getOrderItems = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator((d: { orderId: string }) => d)
  .handler(async ({ data: { orderId } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);
    if (error) throw error;
    return data ?? [];
  });

// Admin may move an order to ANY status from ANY status, including back out
// of "completed"/"cancelled" — those are no longer terminal (see the
// accompanying migration that dropped the DB-level transition trigger for
// orders). This is intentionally unrestricted: this function is only ever
// reachable through requireAdmin + supabaseAdmin, and direct client writes
// to orders remain fully revoked (see secure_order_creation.sql) — a
// customer can never reach this regardless of the status graph, so the
// only thing the old transition allowlist was protecting against was an
// admin's own mistake, which is exactly what it needs to be possible to
// undo (e.g. accidentally marking an order completed and wanting it back
// to pending).
export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string; status: string }) => d)
  .handler(async ({ data: { id, status } }) => {
    if (!ORDER_STATUSES.includes(status as OrderStatus)) throw new Error("INVALID_STATUS");
    const nextStatus = status as OrderStatus;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // completed_at only ever reflects the CURRENT completion, not history —
    // set on every (re-)entry into completed, cleared the moment it isn't.
    const patch = {
      status: nextStatus,
      completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
    };

    const { data, error } = await supabaseAdmin
      .from("orders")
      .update(patch)
      .eq("id", id)
      .select("id");
    if (error) {
      console.error("[updateOrderStatus] failed for order", id, error);
      throw new Error("STATUS_UPDATE_FAILED");
    }
    if (!data || data.length === 0) throw new Error("ORDER_NOT_FOUND");

    return { success: true };
  });
