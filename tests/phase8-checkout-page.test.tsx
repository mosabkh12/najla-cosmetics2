// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CartProvider, useCart, type CartItem } from "@/hooks/useCart";

// Full component-level tests of Phase 8's checkout idempotency
// persistence, on top of the real CheckoutPage component — everything
// external (routing, auth, i18n, the server functions) is mocked; the
// cart is the real CartProvider (pure localStorage, no network) and
// the checkout page's own state/effects are real.

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

// Uses IntersectionObserver (not available in jsdom) purely for a
// scroll-in animation, unrelated to anything Phase 8 touches.
vi.mock("@/components/ScrollReveal", () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => children,
  StaggerGrid: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/api/profiles/profiles", () => ({
  getProfile: vi.fn(async () => ({ full_name: "Jane Doe", phone: "0501234567" })),
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
    {
      id: PRODUCT_ID,
      name: "Test Product",
      price: 50,
      stock_quantity: 10,
      is_active: true,
    },
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

const STORAGE_KEY = "najla:checkout-idempotency";

function readPersisted(): { key: string; fingerprint: string } | null {
  const raw = localStorage.getItem(STORAGE_KEY);
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

function renderCheckout(CheckoutPage: React.ComponentType) {
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

async function loadCheckoutPage() {
  const { Route } = (await import("@/routes/checkout")) as unknown as {
    Route: { options: { component: React.ComponentType } };
  };
  return Route.options.component;
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

describe("Phase 8 — CheckoutPage idempotency lifecycle", () => {
  it("11. a network failure preserves the active persisted key", async () => {
    const { createOrder } = await import("@/api/orders/orders");
    vi.mocked(createOrder).mockRejectedValueOnce(new Error("ORDER_CREATION_FAILED"));

    const CheckoutPage = await loadCheckoutPage();
    renderCheckout(CheckoutPage);

    await waitFor(() => expect(readPersisted()).not.toBeNull());
    const before = readPersisted();

    const submit = await screen.findByRole("button", { name: /place_order/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() => expect(createOrder).toHaveBeenCalledTimes(1));
    const after = readPersisted();
    expect(after).toEqual(before);
  });

  it("12. a confirmed successful order clears the persisted attempt", async () => {
    const CheckoutPage = await loadCheckoutPage();
    renderCheckout(CheckoutPage);

    await waitFor(() => expect(readPersisted()).not.toBeNull());

    const submit = await screen.findByRole("button", { name: /place_order/i });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() => expect(readPersisted()).toBeNull());
  });

  it("13. an intentional reset (cart emptied) clears the persisted attempt", async () => {
    const CheckoutPage = await loadCheckoutPage();
    renderCheckout(CheckoutPage);

    await waitFor(() => expect(readPersisted()).not.toBeNull());
    await waitFor(() => expect(cartHandle).not.toBeNull());

    act(() => {
      cartHandle!.remove(PRODUCT_ID);
    });

    await waitFor(() => expect(readPersisted()).toBeNull());
  });

  it("14. an unrelated display-only cart correction (price/stock sync) does not rotate the key", async () => {
    const CheckoutPage = await loadCheckoutPage();
    renderCheckout(CheckoutPage);

    await waitFor(() => expect(readPersisted()).not.toBeNull());
    const before = readPersisted();
    await waitFor(() => expect(cartHandle).not.toBeNull());

    // Same shape as checkout.tsx's own syncCart(): corrects price/stock
    // in place without touching product_id/quantity — never material to
    // the fingerprint.
    act(() => {
      cartHandle!.updateItem(PRODUCT_ID, { price: 55, stock: 8 });
    });

    // Give the fingerprint-recompute effect a chance to run (it does,
    // since `items` changes reference) and settle.
    await waitFor(() => {});
    const after = readPersisted();
    expect(after).toEqual(before);
  });
});
