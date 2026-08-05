// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CartProvider, useCart, type CartItem } from "@/hooks/useCart";

// Proves the exact recovery flow this reopened phase targets: a lost
// server response followed by a full page reload must not silently
// mint a fresh idempotency key. Before this fix, checkout.tsx's
// fingerprint effect ran against empty/default form state on every
// fresh mount (before profile prefill resolved), which overwrote the
// persisted attempt with a key computed from that empty state — losing
// the original key before the user ever got a chance to restore their
// real input. The fix: a persisted "checkout draft" (see
// checkout-idempotency.ts) is restored BEFORE the fingerprint effect is
// ever allowed to run (gated on a `hydrated` flag), so the first
// fingerprint computed after a reload is already computed against the
// restored — not empty — payload.

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (k: string) => k, lang: "en" }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/ScrollReveal", () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => children,
  StaggerGrid: ({ children }: { children: React.ReactNode }) => children,
}));

// No saved profile — isolates restoration behavior to the draft, and
// (for test 12) lets a specific test override this per-call to prove
// the draft-vs-profile precedence rule.
vi.mock("@/api/profiles/profiles", () => ({
  getProfile: vi.fn(async () => null),
}));

vi.mock("@/api/orders/orders", () => ({
  createOrder: vi.fn(async () => ({ success: true, orderId: "order-1" })),
}));

vi.mock("@/api/delivery-areas/delivery-areas", () => ({
  getDeliveryAreas: vi.fn(async () => []),
}));

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

vi.mock("@/api/products/products", () => ({
  getProductsByIds: vi.fn(async () => [
    { id: PRODUCT_ID, name: "Test Product", price: 50, stock_quantity: 10, is_active: true },
  ]),
}));

const CART_ITEM: CartItem = {
  product_id: PRODUCT_ID,
  name: "Test Product",
  price: 50,
  image_url: null,
  quantity: 1,
  stock: 10,
};

const ATTEMPT_KEY = "najla:checkout-idempotency";
const DRAFT_KEY = "najla:checkout-draft";

function readAttempt(): { key: string; fingerprint: string } | null {
  const raw = localStorage.getItem(ATTEMPT_KEY);
  return raw ? JSON.parse(raw) : null;
}

function readDraftRaw(): unknown {
  const raw = localStorage.getItem(DRAFT_KEY);
  return raw ? JSON.parse(raw) : null;
}

let cartHandle: ReturnType<typeof useCart> | null = null;

function CartHandleCapture() {
  const cart = useCart();
  const ref = useRef(cart);
  ref.current = cart;
  useEffect(() => {
    cartHandle = ref.current;
  });
  return null;
}

async function loadCheckoutPage() {
  const { Route } = (await import("@/routes/checkout")) as unknown as {
    Route: { options: { component: React.ComponentType } };
  };
  return Route.options.component;
}

// Renders a fresh CheckoutPage instance inside a fresh QueryClient —
// used both for the initial render and to simulate a full page reload
// (unmount + remount discards all React state exactly like a real
// reload would; only localStorage — the real browser mechanism a
// reload can't erase — carries over).
async function mountCheckout() {
  const CheckoutPage = await loadCheckoutPage();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CartProvider>
        <CartHandleCapture />
        <CheckoutPage />
      </CartProvider>
    </QueryClientProvider>,
  );
}

function fillForm(name: string, phone: string) {
  fireEvent.change(screen.getByLabelText(/full_name/i), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: phone } });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("najla:cart", JSON.stringify([CART_ITEM]));
  cartHandle = null;
});

afterEach(() => {
  cleanup();
});

describe("Phase 8 (reopened) — reload recovery keeps the original key across a lost response", () => {
  it("1-7. fills a payload, reloads with empty state, restores it, and reuses the original key on retry", async () => {
    // 1. Fill a complete checkout payload and let it persist its key.
    await mountCheckout();
    fillForm("Jane Doe", "0501234567");

    await waitFor(() => expect(readAttempt()).not.toBeNull());
    const originalAttempt = readAttempt()!;
    const originalDraft = readDraftRaw() as { customer_name: string; customer_phone: string };
    expect(originalDraft.customer_name).toBe("Jane Doe");
    expect(originalDraft.customer_phone).toBe("0501234567");

    // 2. Simulate a full page reload — unmount discards all component
    // state (name/phone/hydrated/idempotencyKey all reset), only
    // localStorage survives, exactly like a real browser reload.
    cleanup();

    // 3. Remount with form state starting empty/default again. The
    // fingerprint effect is gated on `hydrated`, which can only become
    // true once the draft-restore-or-profile-prefill pass has run — so
    // it never gets a chance to compute a fingerprint against the
    // still-empty fields and overwrite the persisted attempt.
    await mountCheckout();
    // Confirm restoration actually happened (draft found + applied) —
    // the values now visible are the restored ones, not empty defaults.
    await waitFor(() => {
      expect(screen.getByLabelText(/full_name/i)).toHaveValue("Jane Doe");
      expect(screen.getByLabelText(/phone/i)).toHaveValue("0501234567");
    });

    // The persisted attempt must never have been overwritten during
    // hydration — its key is still exactly what it was before reload.
    await waitFor(() => expect(readAttempt()?.key).toBe(originalAttempt.key));
    const afterReload = readAttempt()!;
    expect(afterReload).toEqual(originalAttempt);

    // 5. The reused idempotency key equals the original.
    expect(afterReload.key).toBe(originalAttempt.key);

    // 6-7. Simulate the original request having actually succeeded on
    // the server but the response never reaching this (fresh) client —
    // from the client's perspective that's indistinguishable from any
    // other failed/lost request, so the mocked createOrder rejects here
    // exactly like a network failure would. Retrying afterward must
    // send the SAME key.
    const { createOrder } = await import("@/api/orders/orders");
    vi.mocked(createOrder).mockRejectedValueOnce(new Error("ORDER_CREATION_FAILED"));

    const submit = await screen.findByRole("button", { name: /place_order/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));

    vi.mocked(createOrder).mockResolvedValueOnce({ success: true, orderId: "order-1" });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(2));

    const firstCallArgs = vi.mocked(createOrder).mock.calls[0]![0];
    const secondCallArgs = vi.mocked(createOrder).mock.calls[1]![0];
    expect(secondCallArgs.data.idempotency_key).toBe(firstCallArgs.data.idempotency_key);
    expect(secondCallArgs.data.idempotency_key).toBe(originalAttempt.key);
  });

  it("8. a deliberate payload change after hydration generates a new key", async () => {
    await mountCheckout();
    fillForm("Jane Doe", "0501234567");
    await waitFor(() => expect(readAttempt()).not.toBeNull());
    const before = readAttempt()!;

    fireEvent.change(screen.getByLabelText(/full_name/i), { target: { value: "John Smith" } });

    await waitFor(() => expect(readAttempt()?.key).not.toBe(before.key));
  });

  it("9. confirmed success clears both the draft and the attempt", async () => {
    await mountCheckout();
    fillForm("Jane Doe", "0501234567");
    await waitFor(() => expect(readAttempt()).not.toBeNull());
    expect(readDraftRaw()).not.toBeNull();

    const submit = await screen.findByRole("button", { name: /place_order/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() => expect(readAttempt()).toBeNull());
    expect(readDraftRaw()).toBeNull();
  });

  it("10. a network failure preserves both the draft and the attempt", async () => {
    const { createOrder } = await import("@/api/orders/orders");
    vi.mocked(createOrder).mockRejectedValueOnce(new Error("ORDER_CREATION_FAILED"));

    await mountCheckout();
    fillForm("Jane Doe", "0501234567");
    await waitFor(() => expect(readAttempt()).not.toBeNull());
    const beforeAttempt = readAttempt();
    const beforeDraft = readDraftRaw();

    const submit = await screen.findByRole("button", { name: /place_order/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));

    expect(readAttempt()).toEqual(beforeAttempt);
    expect(readDraftRaw()).toEqual(beforeDraft);
  });

  it("11. corrupt or expired draft/attempt data is handled safely, falling back to a fresh attempt", async () => {
    localStorage.setItem(DRAFT_KEY, "{not valid json");
    localStorage.setItem(ATTEMPT_KEY, "{not valid json either");

    await mountCheckout();

    // Falls back to empty fields (no usable draft) rather than crashing,
    // and still ends up with a fresh, valid persisted attempt once
    // hydration completes.
    await waitFor(() => expect(screen.getByLabelText(/full_name/i)).toHaveValue(""));
    await waitFor(() => expect(readAttempt()).not.toBeNull());
    expect(readAttempt()!.key).toMatch(/^[0-9a-f-]{36}$/i);

    // Now prove the expiry path specifically: a validly-shaped but
    // expired draft is ignored the same way.
    cleanup();
    localStorage.clear();
    localStorage.setItem("najla:cart", JSON.stringify([CART_ITEM]));
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          version: 1,
          customer_name: "Old Name",
          customer_phone: "0500000000",
          notes: null,
          delivery_method: "pickup",
          delivery_area_id: null,
          delivery_street: null,
          createdAt: Date.now(),
        }),
      );
      vi.setSystemTime(new Date("2026-01-02T01:00:00Z")); // 25h later
      vi.useRealTimers();
      await mountCheckout();
      await waitFor(() => expect(screen.getByLabelText(/full_name/i)).toHaveValue(""));
    } finally {
      vi.useRealTimers();
    }
  });

  it("12. draft restoration takes precedence over profile prefill under a clearly-defined rule (draft wins outright when present)", async () => {
    const { getProfile } = await import("@/api/profiles/profiles");
    vi.mocked(getProfile).mockResolvedValue({
      full_name: "Profile Name",
      phone: "0509999999",
    } as never);

    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 1,
        customer_name: "Draft Name",
        customer_phone: "0501111111",
        notes: null,
        delivery_method: "pickup",
        delivery_area_id: null,
        delivery_street: null,
        createdAt: Date.now(),
      }),
    );

    await mountCheckout();

    await waitFor(() => expect(screen.getByLabelText(/full_name/i)).toHaveValue("Draft Name"));
    expect(screen.getByLabelText(/phone/i)).toHaveValue("0501111111");
    // getProfile is never even called when a valid draft exists — the
    // draft, being specific to this in-progress checkout attempt,
    // supersedes the generic profile default entirely rather than being
    // merged with or overridden by it.
    expect(getProfile).not.toHaveBeenCalled();
  });
});
