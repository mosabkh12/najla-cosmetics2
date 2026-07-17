import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "@/api/profiles/profiles";
import { createOrder } from "@/api/orders/orders";
import { getDeliveryAreas } from "@/api/delivery-areas/delivery-areas";
import { getProductsByIds } from "@/api/products/products";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { pickLocalized } from "@/lib/pick-localized";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  Store,
  Truck,
  Banknote,
  CreditCard,
  ShoppingBag,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Reveal } from "@/components/ScrollReveal";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — Najla Cosmetics" }] }),
  component: CheckoutPage,
});

const ORDER_ERROR_MAP: Record<string, string> = {
  OUT_OF_STOCK: "out_of_stock",
  PRODUCT_NOT_AVAILABLE: "order_product_unavailable",
  DELIVERY_AREA_UNAVAILABLE: "order_delivery_area_unavailable",
  INVALID_ORDER: "order_invalid",
  ORDER_CREATION_FAILED: "order_creation_failed",
  RATE_LIMITED: "err_rate_limited",
};

// OUT_OF_STOCK/PRODUCT_NOT_AVAILABLE come back as "CODE|product name" (see
// create_order()'s RAISE EXCEPTION calls) so the customer can be told
// exactly which item to fix instead of a generic "something in your cart"
// message. The name is empty for the rare case there truly isn't one
// (product deleted outright), which falls back to the generic message.
const ORDER_ERROR_NAMED_MAP: Record<string, string> = {
  OUT_OF_STOCK: "order_out_of_stock_named",
  PRODUCT_NOT_AVAILABLE: "order_product_unavailable_named",
};

type CartMismatch =
  | { type: "unavailable"; product_id: string; name: string }
  | { type: "out_of_stock"; product_id: string; name: string; available: number }
  | { type: "price_changed"; product_id: string; name: string; oldPrice: number; newPrice: number };

function CheckoutPage() {
  const { t, lang } = useI18n();
  const { user, loading } = useAuth();
  const { items, subtotal, clear, remove, updateItem } = useCart();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAreaId, setDeliveryAreaId] = useState<string | null>(null);
  const [street, setStreet] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    phone?: string;
    area?: string;
    street?: string;
  }>({});

  // One key per checkout-page visit (a fresh mount — e.g. navigating away
  // and back — gets a new one), sent unchanged on every submit/retry of
  // this same attempt so the server can recognize and no-op a duplicate
  // order instead of double-charging/double-deducting stock.
  const idempotencyKeyRef = useRef<string | null>(null);
  if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();

  // Belt-and-suspenders alongside disabled={busy}: a ref is synchronous,
  // so it also blocks a second click that lands in the gap before React
  // has re-rendered the button as disabled (state updates are not
  // synchronous), which busy alone cannot guarantee.
  const submittingRef = useRef(false);

  const { data: deliveryAreas = [] } = useQuery({
    queryKey: ["delivery-areas"],
    queryFn: () => getDeliveryAreas(),
    staleTime: 60_000,
  });
  const selectedArea =
    deliveryMethod === "delivery" ? deliveryAreas.find((a) => a.id === deliveryAreaId) : undefined;
  const deliveryFee = selectedArea ? Number(selectedArea.price) : 0;
  const total = subtotal + deliveryFee;
  const cheapestAreaPrice =
    deliveryAreas.length > 0 ? Math.min(...deliveryAreas.map((a) => Number(a.price))) : null;

  // The cart is plain localStorage state that can go stale for a long
  // time (added yesterday, price changed since, someone else bought the
  // last unit) — this fetches the live truth right before checkout so
  // the customer sees a mismatch and can fix it themselves instead of
  // silently over/under-paying, or just hitting a generic error at
  // submit time. The RPC itself remains the actual source of truth /
  // enforcement (see create_order()'s FOR UPDATE checks) — this is purely
  // a "don't let the customer submit against numbers we already know are
  // wrong" UX layer on top of it.
  const productIds = useMemo(() => items.map((i) => i.product_id).sort(), [items]);
  const { data: liveProducts, isLoading: revalidatingInitial } = useQuery({
    queryKey: ["cart-revalidate", productIds],
    queryFn: () => getProductsByIds({ data: { ids: productIds } }),
    enabled: productIds.length > 0,
  });

  const mismatches = useMemo<CartMismatch[]>(() => {
    if (!liveProducts) return [];
    const byId = new Map(liveProducts.map((p) => [p.id, p]));
    const out: CartMismatch[] = [];
    for (const item of items) {
      const live = byId.get(item.product_id);
      if (!live || !live.is_active) {
        out.push({ type: "unavailable", product_id: item.product_id, name: item.name });
      } else if (live.stock_quantity < item.quantity) {
        out.push({
          type: "out_of_stock",
          product_id: item.product_id,
          name: item.name,
          available: live.stock_quantity,
        });
      } else if (Number(live.price) !== item.price) {
        out.push({
          type: "price_changed",
          product_id: item.product_id,
          name: item.name,
          oldPrice: item.price,
          newPrice: Number(live.price),
        });
      }
    }
    return out;
  }, [liveProducts, items]);

  const syncCart = () => {
    if (!liveProducts) return;
    const byId = new Map(liveProducts.map((p) => [p.id, p]));
    for (const item of items) {
      const live = byId.get(item.product_id);
      if (!live || !live.is_active || live.stock_quantity <= 0) {
        remove(item.product_id);
      } else {
        updateItem(item.product_id, {
          price: Number(live.price),
          stock: live.stock_quantity,
          name: live.name,
        });
      }
    }
    toast.success(t("cart_synced"));
  };

  const mismatchByProduct = useMemo(
    () => new Map(mismatches.map((m) => [m.product_id, m])),
    [mismatches],
  );

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);
  useEffect(() => {
    if (user)
      getProfile().then((data) => {
        if (data) {
          setName(data.full_name ?? "");
          setPhone(data.phone ?? "");
        }
      });
  }, [user]);

  if (!user) return null;
  if (items.length === 0)
    return (
      <section className="container-page py-16 text-center">
        <h1 className="font-display text-2xl">{t("empty_cart")}</h1>
        <Button asChild className="btn-gold mt-4">
          <Link to="/products">{t("continue_shopping")}</Link>
        </Button>
      </section>
    );

  const placeOrder = async () => {
    const e: { name?: string; phone?: string; area?: string; street?: string } = {};
    if (!name.trim()) e.name = t("err_name_required");
    if (!phone.trim()) e.phone = t("err_phone_required");
    if (deliveryMethod === "delivery" && !deliveryAreaId) e.area = t("err_delivery_area_required");
    if (deliveryMethod === "delivery" && !street.trim()) e.street = t("err_street_required");
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (mismatches.length > 0) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      await createOrder({
        data: {
          customer_name: name,
          customer_phone: phone,
          notes: notes || null,
          delivery_method: deliveryMethod,
          delivery_area_id: deliveryMethod === "delivery" ? deliveryAreaId : null,
          delivery_street: deliveryMethod === "delivery" ? street : null,
          items: items.map((it) => ({
            product_id: it.product_id,
            quantity: it.quantity,
          })),
          idempotency_key: idempotencyKeyRef.current,
        },
      });
      toast.success(t("order_success"));
      clear();
      navigate({ to: "/profile" });
    } catch (e: unknown) {
      const raw = getErrorMessage(e);
      const [code, productName] = raw.includes("|") ? raw.split("|") : [raw, ""];
      const namedKey = productName ? ORDER_ERROR_NAMED_MAP[code] : undefined;
      if (namedKey) {
        toast.error(t(namedKey).replace("{name}", productName));
      } else {
        const key = ORDER_ERROR_MAP[code];
        toast.error(key ? t(key) : t("order_creation_failed"));
      }
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-10 grid gap-8 lg:grid-cols-[1fr_380px] overflow-x-hidden">
      <Reveal direction="start">
        <div
          className="rounded-2xl border border-border/30 bg-card p-6 space-y-5"
          style={{ boxShadow: "0 20px 40px -15px rgba(45, 45, 45, 0.06)" }}
        >
          <h1 className="font-display text-[28px] italic text-foreground">{t("checkout")}</h1>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="checkout-name" className="text-xs">
                {t("full_name")}
              </Label>
              <Input
                id="checkout-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
                }}
                autoComplete="name"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "checkout-name-error" : undefined}
                className="mt-1 h-10"
              />
              {errors.name && (
                <p
                  id="checkout-name-error"
                  role="alert"
                  className="mt-1 text-[12px] text-destructive"
                >
                  {errors.name}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="checkout-phone" className="text-xs">
                {t("phone")}
              </Label>
              <Input
                id="checkout-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }));
                }}
                autoComplete="tel"
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={errors.phone ? "checkout-phone-error" : undefined}
                className="mt-1 h-10"
              />
              {errors.phone && (
                <p
                  id="checkout-phone-error"
                  role="alert"
                  className="mt-1 text-[12px] text-destructive"
                >
                  {errors.phone}
                </p>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs mb-2 block">{t("delivery_method")}</Label>
            <div className="grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeliveryMethod("pickup")}
                aria-pressed={deliveryMethod === "pickup"}
                className={`text-start rounded-xl border p-4 transition-colors ${deliveryMethod === "pickup" ? "border-primary bg-surface" : "border-border/60 hover:bg-surface/50"}`}
              >
                <Store className="h-5 w-5 text-primary mb-2" aria-hidden="true" />
                <p className="text-sm font-semibold text-foreground">{t("delivery_pickup")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("delivery_pickup_desc")}</p>
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMethod("delivery")}
                aria-pressed={deliveryMethod === "delivery"}
                className={`text-start rounded-xl border p-4 transition-colors ${deliveryMethod === "delivery" ? "border-primary bg-surface" : "border-border/60 hover:bg-surface/50"}`}
              >
                <Truck className="h-5 w-5 text-primary mb-2" aria-hidden="true" />
                <p className="text-sm font-semibold text-foreground">{t("delivery_to_door")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("delivery_to_door_desc")}</p>
                {cheapestAreaPrice !== null && (
                  <p className="text-xs font-medium text-primary mt-1">
                    {t("starting_at")}₪{cheapestAreaPrice.toFixed(0)}
                  </p>
                )}
              </button>
            </div>
          </div>
          {deliveryMethod === "delivery" && (
            <>
              <div>
                <Label htmlFor="delivery-city" className="text-xs">
                  {t("select_delivery_area")}
                </Label>
                <Select
                  value={deliveryAreaId ?? ""}
                  onValueChange={(v) => {
                    setDeliveryAreaId(v);
                    if (errors.area) setErrors((p) => ({ ...p, area: undefined }));
                  }}
                >
                  <SelectTrigger
                    id="delivery-city"
                    className="mt-1 h-10"
                    aria-invalid={errors.area ? true : undefined}
                  >
                    <SelectValue placeholder={t("select_delivery_area")} />
                  </SelectTrigger>
                  <SelectContent>
                    {deliveryAreas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {pickLocalized(lang, area.name, area.name_ar, area.name_en)} · ₪
                        {Number(area.price).toFixed(0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.area && (
                  <p role="alert" className="mt-1 text-[12px] text-destructive">
                    {errors.area}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="checkout-street" className="text-xs">
                  {t("street_address")}
                </Label>
                <Input
                  id="checkout-street"
                  value={street}
                  onChange={(e) => {
                    setStreet(e.target.value);
                    if (errors.street) setErrors((p) => ({ ...p, street: undefined }));
                  }}
                  placeholder={t("street_address_placeholder")}
                  autoComplete="street-address"
                  aria-invalid={errors.street ? true : undefined}
                  aria-describedby={errors.street ? "checkout-street-error" : undefined}
                  className="mt-1 h-10"
                />
                {errors.street && (
                  <p
                    id="checkout-street-error"
                    role="alert"
                    className="mt-1 text-[12px] text-destructive"
                  >
                    {errors.street}
                  </p>
                )}
              </div>
            </>
          )}
          <div>
            <Label htmlFor="checkout-notes" className="text-xs">
              {t("notes_optional")}
            </Label>
            <Textarea
              id="checkout-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs mb-2 block">{t("payment_method")}</Label>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="text-start rounded-xl border border-primary bg-surface p-4">
                <Banknote className="h-5 w-5 text-primary mb-2" aria-hidden="true" />
                <p className="text-sm font-semibold text-foreground">{t("payment_cash")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("payment_cash_desc")}</p>
              </div>
              <div
                aria-disabled="true"
                className="text-start rounded-xl border border-border/40 p-4 opacity-50 cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <CreditCard className="h-5 w-5 text-muted-foreground mb-2" aria-hidden="true" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-surface px-2 py-0.5 rounded-full">
                    {t("coming_soon")}
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground">{t("payment_card")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("payment_card_desc")}</p>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
      <Reveal direction="end" delay={2}>
        <div
          className="rounded-2xl border border-border/30 bg-card p-6 h-fit"
          style={{ boxShadow: "0 20px 40px -15px rgba(45, 45, 45, 0.06)" }}
        >
          <h2 className="font-display text-[22px] text-foreground">{t("cart")}</h2>
          <ul className="mt-4 divide-y divide-border/10">
            {items.map((i) => {
              const mismatch = mismatchByProduct.get(i.product_id);
              return (
                <li
                  key={i.product_id}
                  className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface">
                    {i.image_url ? (
                      <img
                        src={i.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-full w-full grid place-items-center">
                        <ShoppingBag
                          className="h-6 w-6 text-muted-foreground/30"
                          aria-hidden="true"
                        />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-foreground truncate">{i.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      ₪{i.price.toFixed(2)} × {i.quantity}
                    </p>
                    {mismatch && (
                      <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {mismatch.type === "unavailable" && t("cart_item_unavailable_short")}
                        {mismatch.type === "out_of_stock" &&
                          t("cart_item_out_of_stock_short").replace(
                            "{available}",
                            String(mismatch.available),
                          )}
                        {mismatch.type === "price_changed" &&
                          t("cart_item_price_changed_short").replace(
                            "{newPrice}",
                            mismatch.newPrice.toFixed(2),
                          )}
                      </p>
                    )}
                  </div>
                  <span className="text-[15px] font-semibold text-foreground shrink-0">
                    ₪{(i.price * i.quantity).toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 pt-4 border-t space-y-3">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cream text-primary">
                {deliveryMethod === "delivery" ? (
                  <Truck className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Store className="h-4 w-4" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {deliveryMethod === "delivery" ? t("delivery_to_door") : t("delivery_pickup")}
                </p>
                {deliveryMethod === "delivery" && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {[
                      selectedArea &&
                        pickLocalized(
                          lang,
                          selectedArea.name,
                          selectedArea.name_ar,
                          selectedArea.name_en,
                        ),
                      street,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cream text-primary">
                <Banknote className="h-4 w-4" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground">{t("payment_cash")}</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-secondary-foreground">{t("subtotal")}</span>
              <span className="font-medium">₪{subtotal.toFixed(2)}</span>
            </div>
            {deliveryMethod === "delivery" && (
              <div className="flex justify-between">
                <span className="text-secondary-foreground">{t("delivery_fee")}</span>
                <span className="font-medium">₪{deliveryFee.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t">
              <span className="text-secondary-foreground">{t("total")}</span>
              <span className="font-semibold text-foreground text-lg">₪{total.toFixed(2)}</span>
            </div>
          </div>
          {mismatches.length > 0 && (
            <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-semibold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t("cart_stale_title")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{t("cart_stale_desc")}</p>
              <button
                type="button"
                onClick={syncCart}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-full border border-destructive/40 text-destructive text-[11px] font-semibold uppercase tracking-[0.1em] h-10 hover:bg-destructive/10 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {t("sync_cart")}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={placeOrder}
            disabled={busy || mismatches.length > 0 || revalidatingInitial}
            aria-busy={busy}
            className="w-full bg-foreground text-background h-[48px] rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity disabled:opacity-40 mt-4 flex items-center justify-center gap-2"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            {t("place_order")}
          </button>
        </div>
      </Reveal>
    </section>
  );
}
