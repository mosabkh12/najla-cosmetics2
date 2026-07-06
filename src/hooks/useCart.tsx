import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CartItem {
  product_id: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  stock: number;
}
interface CartCtx {
  items: CartItem[];
  add: (i: Omit<CartItem, "quantity">, qty?: number) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
  open: boolean;
  setOpen: (b: boolean) => void;
  subtotal: number;
  count: number;
}
const Ctx = createContext<CartCtx | null>(null);
const KEY = "najla:cart";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch (e) {
      // Corrupted cart JSON, or localStorage unavailable (e.g. private
      // browsing) — safe to ignore: `items` simply stays at its initial
      // empty array either way, which is the correct fallback.
      console.warn("[cart] failed to load saved cart", e);
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch (e) {
      // Storage quota exceeded, or unavailable (e.g. private browsing) —
      // the cart still works for the rest of this session, it just won't
      // persist across a reload. Not worth surfacing to the user.
      console.warn("[cart] failed to persist cart", e);
    }
  }, [items]);

  const value = useMemo<CartCtx>(
    () => ({
      items,
      open,
      setOpen,
      add: (it, qty = 1) =>
        setItems((prev) => {
          const e = prev.find((p) => p.product_id === it.product_id);
          if (e)
            return prev.map((p) =>
              p.product_id === it.product_id
                ? { ...p, quantity: Math.min(it.stock, p.quantity + qty) }
                : p,
            );
          return [...prev, { ...it, quantity: Math.min(it.stock, qty) }];
        }),
      remove: (id) => setItems((p) => p.filter((x) => x.product_id !== id)),
      setQty: (id, qty) =>
        setItems((p) =>
          p.map((x) =>
            x.product_id === id ? { ...x, quantity: Math.max(1, Math.min(x.stock, qty)) } : x,
          ),
        ),
      clear: () => setItems([]),
      subtotal: items.reduce((s, x) => s + x.price * x.quantity, 0),
      count: items.reduce((s, x) => s + x.quantity, 0),
    }),
    [items, open],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart requires CartProvider");
  return c;
}
