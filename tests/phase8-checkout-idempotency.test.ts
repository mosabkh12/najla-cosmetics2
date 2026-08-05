// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPersistedAttempt,
  computeCheckoutFingerprint,
  loadPersistedAttempt,
  savePersistedAttempt,
  type CheckoutPayloadForFingerprint,
} from "@/lib/checkout-idempotency";

const BASE_PAYLOAD: CheckoutPayloadForFingerprint = {
  customer_name: "Jane Doe",
  customer_phone: "0501234567",
  notes: null,
  delivery_method: "pickup",
  delivery_area_id: null,
  delivery_street: null,
  items: [
    { product_id: "11111111-1111-1111-1111-111111111111", quantity: 2 },
    { product_id: "22222222-2222-2222-2222-222222222222", quantity: 1 },
  ],
};

beforeEach(() => {
  localStorage.clear();
});

describe("Phase 8 — checkout idempotency persistence (pure)", () => {
  it("1. a first checkout attempt can be generated and persisted, and loads back", async () => {
    const fingerprint = await computeCheckoutFingerprint(BASE_PAYLOAD);
    const key = crypto.randomUUID();
    savePersistedAttempt(key, fingerprint);

    const loaded = loadPersistedAttempt();
    expect(loaded).toEqual({ key, fingerprint });
  });

  it("2. an identical payload after 'reload' (fresh load) produces a matching fingerprint, reusing the key", async () => {
    const fingerprint1 = await computeCheckoutFingerprint(BASE_PAYLOAD);
    const key = crypto.randomUUID();
    savePersistedAttempt(key, fingerprint1);

    // Simulates recomputing the fingerprint after a page reload from the
    // exact same logical payload (a fresh object, same values).
    const fingerprint2 = await computeCheckoutFingerprint({ ...BASE_PAYLOAD });
    const loaded = loadPersistedAttempt();
    expect(loaded?.fingerprint).toBe(fingerprint2);
    expect(loaded?.key).toBe(key);
  });

  it("3. a cart quantity change produces a different fingerprint", async () => {
    const f1 = await computeCheckoutFingerprint(BASE_PAYLOAD);
    const f2 = await computeCheckoutFingerprint({
      ...BASE_PAYLOAD,
      items: [
        { product_id: "11111111-1111-1111-1111-111111111111", quantity: 3 },
        { product_id: "22222222-2222-2222-2222-222222222222", quantity: 1 },
      ],
    });
    expect(f1).not.toBe(f2);
  });

  it("4. adding or removing a product produces a different fingerprint", async () => {
    const f1 = await computeCheckoutFingerprint(BASE_PAYLOAD);
    const added = await computeCheckoutFingerprint({
      ...BASE_PAYLOAD,
      items: [
        ...BASE_PAYLOAD.items,
        { product_id: "33333333-3333-3333-3333-333333333333", quantity: 1 },
      ],
    });
    const removed = await computeCheckoutFingerprint({
      ...BASE_PAYLOAD,
      items: BASE_PAYLOAD.items.slice(0, 1),
    });
    expect(added).not.toBe(f1);
    expect(removed).not.toBe(f1);
  });

  it("5. a delivery method change produces a different fingerprint", async () => {
    const f1 = await computeCheckoutFingerprint(BASE_PAYLOAD);
    const f2 = await computeCheckoutFingerprint({
      ...BASE_PAYLOAD,
      delivery_method: "delivery",
      delivery_area_id: "area-1",
      delivery_street: "123 Main St",
    });
    expect(f1).not.toBe(f2);
  });

  it("6. a delivery area or street change produces a different fingerprint", async () => {
    const delivery = {
      ...BASE_PAYLOAD,
      delivery_method: "delivery",
      delivery_area_id: "area-1",
      delivery_street: "123 Main St",
    };
    const base = await computeCheckoutFingerprint(delivery);
    const differentArea = await computeCheckoutFingerprint({
      ...delivery,
      delivery_area_id: "area-2",
    });
    const differentStreet = await computeCheckoutFingerprint({
      ...delivery,
      delivery_street: "456 Other St",
    });
    expect(differentArea).not.toBe(base);
    expect(differentStreet).not.toBe(base);
  });

  it("7. a material customer-detail change (name/phone/notes) produces a different fingerprint", async () => {
    const base = await computeCheckoutFingerprint(BASE_PAYLOAD);
    const name = await computeCheckoutFingerprint({ ...BASE_PAYLOAD, customer_name: "John Smith" });
    const phone = await computeCheckoutFingerprint({
      ...BASE_PAYLOAD,
      customer_phone: "0509999999",
    });
    const notes = await computeCheckoutFingerprint({ ...BASE_PAYLOAD, notes: "Leave at the door" });
    expect(name).not.toBe(base);
    expect(phone).not.toBe(base);
    expect(notes).not.toBe(base);
  });

  it("8. cart item ordering differences produce the same fingerprint", async () => {
    const forward = await computeCheckoutFingerprint(BASE_PAYLOAD);
    const reversed = await computeCheckoutFingerprint({
      ...BASE_PAYLOAD,
      items: [...BASE_PAYLOAD.items].reverse(),
    });
    expect(forward).toBe(reversed);
  });

  it("8b. duplicate product_id entries are merged before fingerprinting, same as the server does", async () => {
    const merged = await computeCheckoutFingerprint({
      ...BASE_PAYLOAD,
      items: [{ product_id: "11111111-1111-1111-1111-111111111111", quantity: 3 }],
    });
    const split = await computeCheckoutFingerprint({
      ...BASE_PAYLOAD,
      items: [
        { product_id: "11111111-1111-1111-1111-111111111111", quantity: 1 },
        { product_id: "11111111-1111-1111-1111-111111111111", quantity: 2 },
      ],
    });
    expect(merged).toBe(split);
  });

  it("9. corrupt stored data is ignored safely", () => {
    localStorage.setItem("najla:checkout-idempotency", "{not valid json");
    expect(loadPersistedAttempt()).toBeNull();

    localStorage.setItem("najla:checkout-idempotency", JSON.stringify({ unexpected: "shape" }));
    expect(loadPersistedAttempt()).toBeNull();

    localStorage.setItem("najla:checkout-idempotency", JSON.stringify(null));
    expect(loadPersistedAttempt()).toBeNull();
  });

  it("9b. an unrecognized schema version is ignored safely", async () => {
    const fingerprint = await computeCheckoutFingerprint(BASE_PAYLOAD);
    localStorage.setItem(
      "najla:checkout-idempotency",
      JSON.stringify({
        version: 999,
        key: crypto.randomUUID(),
        fingerprint,
        createdAt: Date.now(),
      }),
    );
    expect(loadPersistedAttempt()).toBeNull();
  });

  it("10. an expired attempt is ignored, as if generating a new key were needed", async () => {
    const fingerprint = await computeCheckoutFingerprint(BASE_PAYLOAD);
    const key = crypto.randomUUID();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      savePersistedAttempt(key, fingerprint);
      expect(loadPersistedAttempt()).not.toBeNull();

      // 25 hours later — past the 24h expiry window.
      vi.setSystemTime(new Date("2026-01-02T01:00:00Z"));
      expect(loadPersistedAttempt()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clearPersistedAttempt removes the record entirely", async () => {
    const fingerprint = await computeCheckoutFingerprint(BASE_PAYLOAD);
    savePersistedAttempt(crypto.randomUUID(), fingerprint);
    expect(loadPersistedAttempt()).not.toBeNull();

    clearPersistedAttempt();
    expect(loadPersistedAttempt()).toBeNull();
  });
});
