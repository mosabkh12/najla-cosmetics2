import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// REAL Postgres/Supabase integration tests — nothing in this file is
// mocked. Requires a local, disposable Supabase stack (Docker) started
// via `npx supabase start` against supabase/config.toml, which uses the
// Supabase CLI's own standard default ports. If that stack isn't
// reachable, every test in this file is skipped (not failed, not
// silently passed) — see the console warning emitted below and the
// Phase 8 report for exactly what this means for concurrency claims.
//
// Never connects to production Supabase. Defaults below are the fixed,
// publicly-documented Supabase CLI local-dev demo keys/URL — every local
// Supabase stack anywhere uses this exact key set by default; they are
// not a real project's secrets. Overridable via SUPABASE_TEST_URL /
// SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY for a machine
// whose local stack runs on non-default ports.
const LOCAL_URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Same reachability check as the Phase 4/5/7 integration suites —
// confirms this is genuinely this project's schema (not just any
// Postgres/PostgREST answering on the default port), so this file skips
// cleanly instead of crashing confusingly if a different local Supabase
// project happens to be running instead.
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
    `[phase8-integration] Local Supabase stack not reachable at ${LOCAL_URL} — ` +
      "skipping all real-database tests in this file. Run `npx supabase start` " +
      "first (see supabase/config.toml) to exercise them. Concurrent-idempotency " +
      "and payload-fingerprint behavior are NOT verified when these are skipped.",
  );
}

describe.skipIf(!stackUp)("Phase 8 — order payload fingerprint (real Postgres)", () => {
  const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let productId: string;
  let productId2: string;
  let areaId: string;
  let areaId2: string;
  const createdOrderIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createTestUser(): Promise<string> {
    const email = `phase8-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "Test1234!Test1234!",
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Failed to seed user: ${error?.message}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  interface CreateOrderRow {
    order_id: string;
    is_new: boolean;
  }

  function callCreateOrderRpc(
    client: SupabaseClient,
    opts: {
      userId: string;
      items: { product_id: string; quantity: number }[];
      deliveryMethod?: string;
      deliveryAreaId?: string | null;
      deliveryStreet?: string | null;
      name?: string;
      phone?: string;
      notes?: string | null;
      idempotencyKey?: string | null;
    },
  ): Promise<{ data: CreateOrderRow[] | null; error: { message: string } | null }> {
    return admin.rpc("create_order", {
      p_user_id: opts.userId,
      p_customer_name: opts.name ?? "Integration Test Customer",
      p_customer_phone: opts.phone ?? "0500000000",
      p_notes: opts.notes ?? null,
      p_delivery_method: opts.deliveryMethod ?? "pickup",
      p_delivery_area_id: opts.deliveryAreaId ?? null,
      p_delivery_street: opts.deliveryStreet ?? null,
      p_items: opts.items,
      p_idempotency_key: opts.idempotencyKey ?? null,
    }) as unknown as Promise<{ data: CreateOrderRow[] | null; error: { message: string } | null }>;
  }

  function row<T>(res: { data: T[] | null }): T | undefined {
    return res.data?.[0];
  }

  beforeAll(async () => {
    const { data: product, error: productError } = await admin
      .from("products")
      .insert({ name: "Phase 8 Test Product", category: "test", price: 50, stock_quantity: 100 })
      .select("id")
      .single();
    if (productError || !product)
      throw new Error(`Failed to seed product: ${productError?.message}`);
    productId = product.id;

    const { data: product2, error: product2Error } = await admin
      .from("products")
      .insert({ name: "Phase 8 Test Product 2", category: "test", price: 30, stock_quantity: 100 })
      .select("id")
      .single();
    if (product2Error || !product2)
      throw new Error(`Failed to seed second product: ${product2Error?.message}`);
    productId2 = product2.id;

    const { data: area, error: areaError } = await admin
      .from("delivery_areas")
      .insert({ name: "Phase 8 Test Area", price: 15 })
      .select("id")
      .single();
    if (areaError || !area) throw new Error(`Failed to seed delivery area: ${areaError?.message}`);
    areaId = area.id;

    const { data: area2, error: area2Error } = await admin
      .from("delivery_areas")
      .insert({ name: "Phase 8 Test Area 2", price: 25 })
      .select("id")
      .single();
    if (area2Error || !area2)
      throw new Error(`Failed to seed second delivery area: ${area2Error?.message}`);
    areaId2 = area2.id;
  });

  afterAll(async () => {
    if (createdOrderIds.length > 0) {
      await admin.from("order_items").delete().in("order_id", createdOrderIds);
      await admin.from("orders").delete().in("id", createdOrderIds);
    }
    if (productId) await admin.from("products").delete().eq("id", productId);
    if (productId2) await admin.from("products").delete().eq("id", productId2);
    if (areaId) await admin.from("delivery_areas").delete().eq("id", areaId);
    if (areaId2) await admin.from("delivery_areas").delete().eq("id", areaId2);
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("1. same key + same payload returns one order", async () => {
    const userId = await createTestUser();
    const key = crypto.randomUUID();
    const payload = {
      userId,
      items: [{ product_id: productId, quantity: 2 }],
      idempotencyKey: key,
    };

    const first = row(await callCreateOrderRpc(admin, payload))!;
    createdOrderIds.push(first.order_id);
    expect(first.is_new).toBe(true);

    const second = row(await callCreateOrderRpc(admin, payload))!;
    expect(second.order_id).toBe(first.order_id);
    expect(second.is_new).toBe(false);

    const { data: rows } = await admin.from("orders").select("id").eq("user_id", userId);
    expect(rows?.length).toBe(1);
  });

  it("2. same key + different cart is rejected", async () => {
    const userId = await createTestUser();
    const key = crypto.randomUUID();

    const first = row(
      await callCreateOrderRpc(admin, {
        userId,
        items: [{ product_id: productId, quantity: 1 }],
        idempotencyKey: key,
      }),
    )!;
    createdOrderIds.push(first.order_id);

    const second = await callCreateOrderRpc(admin, {
      userId,
      items: [{ product_id: productId, quantity: 2 }],
      idempotencyKey: key,
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.message).toContain("IDEMPOTENCY_PAYLOAD_MISMATCH");

    const third = await callCreateOrderRpc(admin, {
      userId,
      items: [{ product_id: productId2, quantity: 1 }],
      idempotencyKey: key,
    });
    expect(third.error).not.toBeNull();
    expect(third.error?.message).toContain("IDEMPOTENCY_PAYLOAD_MISMATCH");

    const { data: rows } = await admin.from("orders").select("id").eq("user_id", userId);
    expect(rows?.length).toBe(1); // rejected retries created nothing
  });

  it("3. same key + different delivery details is rejected", async () => {
    const userId = await createTestUser();
    const key = crypto.randomUUID();
    const items = [{ product_id: productId, quantity: 1 }];

    const first = row(
      await callCreateOrderRpc(admin, {
        userId,
        items,
        deliveryMethod: "delivery",
        deliveryAreaId: areaId,
        deliveryStreet: "123 Main St",
        idempotencyKey: key,
      }),
    )!;
    createdOrderIds.push(first.order_id);

    const differentArea = await callCreateOrderRpc(admin, {
      userId,
      items,
      deliveryMethod: "delivery",
      deliveryAreaId: areaId2,
      deliveryStreet: "123 Main St",
      idempotencyKey: key,
    });
    expect(differentArea.error?.message).toContain("IDEMPOTENCY_PAYLOAD_MISMATCH");

    const differentStreet = await callCreateOrderRpc(admin, {
      userId,
      items,
      deliveryMethod: "delivery",
      deliveryAreaId: areaId,
      deliveryStreet: "456 Other St",
      idempotencyKey: key,
    });
    expect(differentStreet.error?.message).toContain("IDEMPOTENCY_PAYLOAD_MISMATCH");

    const differentMethod = await callCreateOrderRpc(admin, {
      userId,
      items,
      deliveryMethod: "pickup",
      idempotencyKey: key,
    });
    expect(differentMethod.error?.message).toContain("IDEMPOTENCY_PAYLOAD_MISMATCH");
  });

  it("4. concurrent identical requests create one order", async () => {
    const userId = await createTestUser();
    const key = crypto.randomUUID();
    const payload = {
      userId,
      items: [{ product_id: productId, quantity: 1 }],
      idempotencyKey: key,
    };

    const [resA, resB] = await Promise.all([
      callCreateOrderRpc(admin, payload),
      callCreateOrderRpc(admin, payload),
    ]);

    expect(resA.error).toBeNull();
    expect(resB.error).toBeNull();
    const rowA = row(resA)!;
    const rowB = row(resB)!;
    createdOrderIds.push(rowA.order_id);

    expect(rowA.order_id).toBe(rowB.order_id);
    expect([rowA.is_new, rowB.is_new].filter(Boolean).length).toBe(1);

    const { data: rows } = await admin.from("orders").select("id").eq("user_id", userId);
    expect(rows?.length).toBe(1);
  });

  it("5. different users may use the same key independently", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const sharedKey = crypto.randomUUID();

    const resA = row(
      await callCreateOrderRpc(admin, {
        userId: userA,
        items: [{ product_id: productId, quantity: 1 }],
        idempotencyKey: sharedKey,
      }),
    )!;
    const resB = row(
      await callCreateOrderRpc(admin, {
        userId: userB,
        items: [{ product_id: productId, quantity: 1 }],
        idempotencyKey: sharedKey,
      }),
    )!;
    createdOrderIds.push(resA.order_id, resB.order_id);

    expect(resA.is_new).toBe(true);
    expect(resB.is_new).toBe(true);
    expect(resA.order_id).not.toBe(resB.order_id);
  });

  it("6. existing stock locking and idempotency still work together", async () => {
    const { data: scarceProduct, error } = await admin
      .from("products")
      .insert({ name: "Phase 8 Scarce Product", category: "test", price: 20, stock_quantity: 1 })
      .select("id")
      .single();
    if (error || !scarceProduct) throw new Error("failed to seed scarce product");

    try {
      const userA = await createTestUser();
      const userB = await createTestUser();

      const [resA, resB] = await Promise.all([
        callCreateOrderRpc(admin, {
          userId: userA,
          items: [{ product_id: scarceProduct.id, quantity: 1 }],
          idempotencyKey: crypto.randomUUID(),
        }),
        callCreateOrderRpc(admin, {
          userId: userB,
          items: [{ product_id: scarceProduct.id, quantity: 1 }],
          idempotencyKey: crypto.randomUUID(),
        }),
      ]);

      const results = [resA, resB];
      const succeeded = results.filter((r) => !r.error);
      const failed = results.filter((r) => r.error);
      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(1);
      expect(failed[0]!.error?.message).toContain("OUT_OF_STOCK");

      const winner = row(succeeded[0]!)!;
      createdOrderIds.push(winner.order_id);

      const { data: finalProduct } = await admin
        .from("products")
        .select("stock_quantity")
        .eq("id", scarceProduct.id)
        .single();
      expect(finalProduct?.stock_quantity).toBe(0); // decremented exactly once
    } finally {
      await admin.from("products").delete().eq("id", scarceProduct.id);
    }
  });

  it("7. a failed transaction does not permanently consume the key", async () => {
    const userId = await createTestUser();
    const key = crypto.randomUUID();

    // Invalid delivery method — fails validation, the whole transaction
    // (including the order shell INSERT) rolls back, so no row with this
    // key is ever actually committed.
    const failed = await callCreateOrderRpc(admin, {
      userId,
      items: [{ product_id: productId, quantity: 1 }],
      deliveryMethod: "teleport",
      idempotencyKey: key,
    });
    expect(failed.error).not.toBeNull();
    expect(failed.error?.message).toContain("INVALID_ORDER");

    // The exact same key, now with a valid payload, succeeds normally —
    // proving the key was never "used up" by the failed attempt.
    const retry = row(
      await callCreateOrderRpc(admin, {
        userId,
        items: [{ product_id: productId, quantity: 1 }],
        idempotencyKey: key,
      }),
    )!;
    createdOrderIds.push(retry.order_id);
    expect(retry.is_new).toBe(true);
  });

  it("8. the stored fingerprint matches the server-normalized payload (whitespace-insensitive)", async () => {
    const userId = await createTestUser();
    const key = crypto.randomUUID();

    const first = row(
      await callCreateOrderRpc(admin, {
        userId,
        items: [{ product_id: productId, quantity: 1 }],
        name: "  Jane Doe  ",
        phone: " 0501234567 ",
        idempotencyKey: key,
      }),
    )!;
    createdOrderIds.push(first.order_id);

    // Same logical values, already trimmed — the server normalizes both
    // requests (trim) before fingerprinting, so this must still match
    // the first request's stored fingerprint rather than being treated
    // as a different payload.
    const second = row(
      await callCreateOrderRpc(admin, {
        userId,
        items: [{ product_id: productId, quantity: 1 }],
        name: "Jane Doe",
        phone: "0501234567",
        idempotencyKey: key,
      }),
    )!;
    expect(second.order_id).toBe(first.order_id);
    expect(second.is_new).toBe(false);
  });
});
