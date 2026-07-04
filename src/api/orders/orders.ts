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

const ORDER_STATUSES = ["pending", "confirmed", "preparing", "completed", "cancelled"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

// Admin-only status transitions. Also enforced at the database level
// (check_order_status_transition trigger) as a backstop beneath this
// allowlist, in case a future bug or service-role call bypasses it.
const ORDER_VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

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
    if (!ORDER_STATUSES.includes(status as OrderStatus)) throw new Error("INVALID_STATUS");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select("status")
      .eq("id", id)
      .single();
    if (fetchError || !current) throw new Error("ORDER_NOT_FOUND");

    const currentStatus = current.status as OrderStatus;
    const nextStatus = status as OrderStatus;
    if (currentStatus !== nextStatus && !ORDER_VALID_TRANSITIONS[currentStatus].includes(nextStatus)) {
      throw new Error("INVALID_STATUS_TRANSITION");
    }

    const patch: { status: OrderStatus; completed_at?: string } = { status: nextStatus };
    // Only stamp completed_at on a genuine transition into completed —
    // never overwrite it on an unrelated update or a repeated no-op.
    if (currentStatus !== "completed" && nextStatus === "completed") {
      patch.completed_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin.from("orders").update(patch).eq("id", id);
    if (error) {
      console.error("[updateOrderStatus] failed for order", id, error);
      throw new Error("STATUS_UPDATE_FAILED");
    }
    return { success: true };
  });
