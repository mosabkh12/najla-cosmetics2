import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

// REAL Postgres/Supabase integration tests — nothing in this file is
// mocked. Requires a local, disposable Supabase stack (Docker) started
// via `npx supabase start` against supabase/config.toml. If that stack
// isn't reachable, every test in this file is skipped (not failed, not
// silently passed) — see the console warning below.
//
// This function had NO test coverage at all (mocked or real) before
// Phase 9 — which is exactly how its enum-assignment bug (see the
// accompanying migration 20260801100000_fix_update_order_status_enum_cast.sql)
// went undetected: every existing caller-side test mocked the Supabase
// client, so real Postgres type-checking never actually ran.
//
// Never connects to production Supabase. Defaults below are the fixed,
// publicly-documented Supabase CLI local-dev demo keys/URL — every local
// Supabase stack anywhere uses this exact key set by default; they are
// not a real project's secrets. Overridable via SUPABASE_TEST_URL /
// SUPABASE_TEST_SERVICE_ROLE_KEY for a machine whose local stack runs on
// non-default ports.
const LOCAL_URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function isLocalStackUp(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_URL}/rest/v1/`, { headers: { apikey: SERVICE_ROLE_KEY } });
    if (!res.ok) return false;
    const body = await res.text();
    return body.includes("google_calendar_sync_error");
  } catch {
    return false;
  }
}

const stackUp = await isLocalStackUp();
if (!stackUp) {
  console.warn(
    `[phase9-integration] Local Supabase stack not reachable at ${LOCAL_URL} — ` +
      "skipping all real-database tests in this file. Run `npx supabase start` " +
      "first (see supabase/config.toml) to exercise them. Stock restoration/" +
      "deduction and the enum-cast fix are NOT verified when these are skipped.",
  );
}

describe.skipIf(!stackUp)("Phase 9 — update_order_status (real Postgres)", () => {
  const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  let userId: string;
  const createdOrderIds: string[] = [];
  const createdProductIds: string[] = [];

  async function seedProduct(stock: number): Promise<string> {
    const { data, error } = await admin
      .from("products")
      .insert({ name: "Phase 9 Test Product", category: "test", price: 10, stock_quantity: stock })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to seed product: ${error?.message}`);
    createdProductIds.push(data.id);
    return data.id;
  }

  async function seedOrder(
    productId: string,
    quantity: number,
    status: "pending" | "confirmed" | "preparing" | "completed" | "cancelled" = "pending",
  ): Promise<string> {
    const { data: order, error } = await admin
      .from("orders")
      .insert({
        user_id: userId,
        customer_name: "Integration Test Customer",
        customer_phone: "0500000000",
        delivery_method: "pickup",
        subtotal: 10 * quantity,
        total: 10 * quantity,
        status,
      })
      .select("id")
      .single();
    if (error || !order) throw new Error(`Failed to seed order: ${error?.message}`);
    createdOrderIds.push(order.id);

    const { error: itemError } = await admin.from("order_items").insert({
      order_id: order.id,
      product_id: productId,
      product_name: "Phase 9 Test Product",
      quantity,
      unit_price: 10,
      total_price: 10 * quantity,
    });
    if (itemError) throw new Error(`Failed to seed order item: ${itemError.message}`);
    return order.id;
  }

  async function stockOf(productId: string): Promise<number> {
    const { data } = await admin
      .from("products")
      .select("stock_quantity")
      .eq("id", productId)
      .single();
    return data!.stock_quantity;
  }

  async function callUpdateStatus(orderId: string, status: string) {
    return admin.rpc("update_order_status", { p_order_id: orderId, p_next_status: status });
  }

  beforeAll(async () => {
    const email = `phase9-${Date.now()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "Test1234!Test1234!",
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Failed to seed user: ${error?.message}`);
    userId = data.user.id;
  });

  afterEach(async () => {
    if (createdOrderIds.length > 0) {
      await admin.from("order_items").delete().in("order_id", createdOrderIds);
      await admin.from("orders").delete().in("id", createdOrderIds);
      createdOrderIds.length = 0;
    }
    if (createdProductIds.length > 0) {
      await admin.from("products").delete().in("id", createdProductIds);
      createdProductIds.length = 0;
    }
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("1. cancellation restores stock exactly once", async () => {
    const productId = await seedProduct(5);
    const orderId = await seedOrder(productId, 2, "pending");

    const { data, error } = await callUpdateStatus(orderId, "cancelled");
    expect(error).toBeNull();
    expect(data).toBe("pending"); // returns the PREVIOUS status

    expect(await stockOf(productId)).toBe(7); // 5 + 2

    const { data: order } = await admin.from("orders").select("status").eq("id", orderId).single();
    expect(order?.status).toBe("cancelled");
  });

  it("2. repeated cancellation (re-saving the same status) does not restore stock twice", async () => {
    const productId = await seedProduct(5);
    const orderId = await seedOrder(productId, 2, "pending");

    await callUpdateStatus(orderId, "cancelled");
    expect(await stockOf(productId)).toBe(7);

    const { data, error } = await callUpdateStatus(orderId, "cancelled");
    expect(error).toBeNull();
    expect(data).toBe("cancelled"); // already cancelled — same-status no-op branch
    expect(await stockOf(productId)).toBe(7); // unchanged, not credited again
  });

  it("3. reopening (moving out of cancelled) deducts stock safely", async () => {
    const productId = await seedProduct(5);
    const orderId = await seedOrder(productId, 2, "cancelled");
    // Cancelled orders never held a stock debit against them in this
    // fixture (they start pre-cancelled), so bring stock to a known
    // baseline first exactly like a real cancel would have.
    await admin.from("products").update({ stock_quantity: 7 }).eq("id", productId);

    const { data, error } = await callUpdateStatus(orderId, "confirmed");
    expect(error).toBeNull();
    expect(data).toBe("cancelled");
    expect(await stockOf(productId)).toBe(5); // 7 - 2, re-deducted

    const { data: order } = await admin.from("orders").select("status").eq("id", orderId).single();
    expect(order?.status).toBe("confirmed");
  });

  it("4. insufficient stock blocks reopening, and the order stays cancelled", async () => {
    const productId = await seedProduct(1); // only 1 left
    const orderId = await seedOrder(productId, 2, "cancelled"); // order wants 2

    const { error } = await callUpdateStatus(orderId, "confirmed");
    expect(error).not.toBeNull();
    expect(error?.message).toContain("OUT_OF_STOCK");

    expect(await stockOf(productId)).toBe(1); // untouched
    const { data: order } = await admin.from("orders").select("status").eq("id", orderId).single();
    expect(order?.status).toBe("cancelled"); // unchanged — the failed call didn't partially apply
  });

  it("5. an invalid status value fails safely without touching the order or stock", async () => {
    const productId = await seedProduct(5);
    const orderId = await seedOrder(productId, 2, "pending");

    const { error } = await callUpdateStatus(orderId, "teleported");
    expect(error).not.toBeNull();
    expect(error?.message).toContain("INVALID_STATUS");

    expect(await stockOf(productId)).toBe(5);
    const { data: order } = await admin.from("orders").select("status").eq("id", orderId).single();
    expect(order?.status).toBe("pending");
  });

  it("6. concurrent status changes on the same order remain consistent (row lock serializes them)", async () => {
    const productId = await seedProduct(5);
    const orderId = await seedOrder(productId, 2, "pending");

    // Both requests race to cancel the same order — the row-level
    // FOR UPDATE lock inside update_order_status() must serialize them,
    // so stock is credited exactly once (not zero, not twice) no matter
    // which call "wins" the race.
    const [resA, resB] = await Promise.all([
      callUpdateStatus(orderId, "cancelled"),
      callUpdateStatus(orderId, "cancelled"),
    ]);

    expect(resA.error).toBeNull();
    expect(resB.error).toBeNull();
    // Exactly one call saw "pending" (the real transition); the other
    // saw "cancelled" (the same-status no-op branch, serialized after).
    const prevStatuses = [resA.data, resB.data].sort();
    expect(prevStatuses).toEqual(["cancelled", "pending"]);

    expect(await stockOf(productId)).toBe(7); // credited exactly once
  });

  it("7. concurrent opposite transitions on independent orders never cross-contaminate stock", async () => {
    const productId = await seedProduct(5);
    const orderA = await seedOrder(productId, 2, "pending");
    const orderB = await seedOrder(productId, 1, "cancelled");
    await admin.from("products").update({ stock_quantity: 6 }).eq("id", productId); // baseline as if B's 1 unit was already credited back

    const [resA, resB] = await Promise.all([
      callUpdateStatus(orderA, "cancelled"), // credits +2
      callUpdateStatus(orderB, "confirmed"), // debits -1
    ]);

    expect(resA.error).toBeNull();
    expect(resB.error).toBeNull();
    expect(await stockOf(productId)).toBe(7); // 6 + 2 - 1, both applied exactly once
  });
});
