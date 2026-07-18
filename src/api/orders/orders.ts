import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "../admin/middleware";
import { enforceRateLimit } from "@/api/rate-limit/rate-limit.server";
import type { Lang } from "@/api/email/appointment-emails";

const MAX_QTY_PER_ITEM = 100;
const MAX_UNIQUE_PRODUCTS = 50;
const MAX_NAME_LENGTH = 100;
const MAX_PHONE_LENGTH = 30;
const MAX_NOTES_LENGTH = 1000;
const MAX_STREET_LENGTH = 200;
// The only delivery methods the app offers. Must match the CHECK
// constraint on public.orders.delivery_method.
const ALLOWED_DELIVERY_METHODS = ["pickup", "delivery"];
// Prefixes the create_order() RPC raises on validation failure — mapped
// to clean, translatable codes so raw Postgres error text never reaches
// the browser.
const ORDER_ERROR_CODES = [
  "OUT_OF_STOCK",
  "PRODUCT_NOT_AVAILABLE",
  "DELIVERY_AREA_UNAVAILABLE",
  "INVALID_ORDER",
];

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
      delivery_area_id: string | null;
      delivery_street: string | null;
      items: { product_id: string; quantity: number }[];
      idempotency_key: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit({
      action: "create_order",
      identifier: context.userId,
      windowSeconds: 60 * 60,
      max: 10,
    });

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

    // A delivery area is only meaningful (and only trusted) when the
    // method is actually "delivery" — pickup always ignores whatever
    // the client sent here, rather than trusting it to already be null.
    const deliveryAreaId =
      deliveryMethod === "delivery" ? (data.delivery_area_id ?? "").trim() : "";
    if (deliveryMethod === "delivery" && !deliveryAreaId) throw new Error("INVALID_ORDER");

    // Same trust boundary as the area id above — pickup never carries a
    // street, and delivery always requires one (the courier needs an
    // actual address, not just a priced zone).
    const deliveryStreet = deliveryMethod === "delivery" ? (data.delivery_street ?? "").trim() : "";
    if (deliveryMethod === "delivery") {
      if (!deliveryStreet) throw new Error("INVALID_ORDER");
      if (deliveryStreet.length > MAX_STREET_LENGTH) throw new Error("INVALID_ORDER");
    }

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

    // Generated client-side once per checkout attempt (see checkout.tsx) and
    // resent unchanged on every retry of that same attempt — lets
    // create_order() recognize and no-op a duplicate submission instead of
    // deducting stock / creating an order twice. A malformed value is
    // treated as "no key" rather than failing the order outright.
    const idempotencyKey =
      typeof data.idempotency_key === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.idempotency_key)
        ? data.idempotency_key
        : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rpcRows, error } = await supabaseAdmin.rpc("create_order", {
      p_user_id: context.userId,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_notes: notes,
      p_delivery_method: deliveryMethod,
      p_delivery_area_id: deliveryAreaId || null,
      p_delivery_street: deliveryStreet || null,
      p_items: items,
      p_idempotency_key: idempotencyKey,
    });
    const result = rpcRows?.[0];

    if (error || !result?.order_id) {
      const code = ORDER_ERROR_CODES.find((c) => error?.message?.startsWith(c));
      // The full message (not just the code) is forwarded to the client —
      // it's entirely our own RAISE EXCEPTION text (never raw Postgres
      // error output), and for OUT_OF_STOCK/PRODUCT_NOT_AVAILABLE it
      // carries a "|"-delimited product name checkout.tsx uses to tell
      // the customer exactly which item the problem is about.
      if (code) throw new Error(error!.message);
      console.error("[createOrder] failed for user", context.userId, error);
      throw new Error("ORDER_CREATION_FAILED");
    }

    const orderId = result.order_id;

    // A retried/duplicate submission (same idempotency key) resolves to the
    // SAME order every time, but only the call that actually created it
    // should trigger the confirmation/admin emails — otherwise a network
    // retry or double-tap would email the customer twice for one order.
    if (!result.is_new) {
      return { success: true, orderId };
    }

    const [{ data: order }, { data: orderItems }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select(
          "order_number, total, delivery_method, delivery_area_name, delivery_fee, delivery_street",
        )
        .eq("id", orderId)
        .maybeSingle(),
      supabaseAdmin
        .from("order_items")
        .select("product_name, quantity, total_price")
        .eq("order_id", orderId),
      supabaseAdmin
        .from("profiles")
        .select("email, language")
        .eq("id", context.userId)
        .maybeSingle(),
    ]);

    if (order && profile?.email) {
      const { sendOrderConfirmation, sendAdminOrderNotification } =
        await import("@/api/email/order-emails");
      const details = {
        customerName,
        customerEmail: profile.email,
        orderNumber: order.order_number,
        items: (orderItems ?? []).map((it) => ({
          productName: it.product_name,
          quantity: it.quantity,
          totalPrice: Number(it.total_price),
        })),
        delivery: {
          method: order.delivery_method as "pickup" | "delivery",
          areaName: order.delivery_area_name,
          fee: Number(order.delivery_fee),
          street: order.delivery_street,
        },
        total: Number(order.total),
        lang: profile.language as Lang,
      };
      // Awaited (each with its own error swallow) rather than a dangling
      // fire-and-forget promise — Vercel's serverless runtime can freeze
      // the function right after the response is sent, which can silently
      // cut off an un-awaited send before it reaches Resend. Running both
      // in parallel means this adds no more latency than the slower of
      // the two, not their sum.
      await Promise.all([
        sendOrderConfirmation(details).catch(console.error),
        sendAdminOrderNotification({ ...details, customerPhone }).catch(console.error),
      ]);
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

// Joins the product's current image purely for display (admin order
// detail view) — best-effort only, never the source of truth for what
// was ordered. product_name/unit_price/total_price already snapshot
// what mattered at order time; the image join simply comes back null
// if the product was since deleted (product_id is ON DELETE SET NULL),
// which the UI falls back to a placeholder icon for.
export const getOrderItems = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator((d: { orderId: string }) => d)
  .handler(async ({ data: { orderId } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("order_items")
      .select("*, products(image_url, thumbnail_url)")
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
// update_order_status() RPC prefixes — mirrors the create_order()
// pattern: raw Postgres exception text never reaches the browser, and
// these two specifically arise only when un-cancelling an order whose
// stock can no longer cover it (see the accompanying migration).
const STATUS_UPDATE_ERROR_CODES = ["OUT_OF_STOCK", "PRODUCT_NOT_AVAILABLE"];

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string; status: string }) => d)
  .handler(async ({ data: { id, status } }) => {
    if (!ORDER_STATUSES.includes(status as OrderStatus)) throw new Error("INVALID_STATUS");
    const nextStatus = status as OrderStatus;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("order_number, user_id")
      .eq("id", id)
      .maybeSingle();
    if (!order) throw new Error("ORDER_NOT_FOUND");

    // Atomically applies the status change AND any stock restore/re-deduct
    // it implies (cancelling <-> any other status) — see
    // update_order_status() for why this can't safely be two separate
    // application-level queries (a customer could place a conflicting
    // order in the gap between reading and writing stock).
    const { data: previousStatus, error } = await supabaseAdmin.rpc("update_order_status", {
      p_order_id: id,
      p_next_status: nextStatus,
    });

    if (error) {
      const code = STATUS_UPDATE_ERROR_CODES.find((c) => error.message?.startsWith(c));
      if (code) throw new Error(code);
      if (error.message?.startsWith("ORDER_NOT_FOUND")) throw new Error("ORDER_NOT_FOUND");
      console.error("[updateOrderStatus] failed for order", id, error);
      throw new Error("STATUS_UPDATE_FAILED");
    }

    // Only notify the customer on a genuine change — re-saving the same
    // status (e.g. a duplicate submit) must not resend the email.
    if (previousStatus !== nextStatus) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email, language")
        .eq("id", order.user_id)
        .maybeSingle();

      if (profile?.email) {
        const { sendOrderStatusUpdateEmail } = await import("@/api/email/order-emails");
        await sendOrderStatusUpdateEmail({
          customerName: profile.full_name ?? "",
          customerEmail: profile.email,
          orderNumber: order.order_number,
          status: nextStatus,
          lang: profile.language as Lang,
        }).catch(console.error);
      }
    }

    return { success: true };
  });
