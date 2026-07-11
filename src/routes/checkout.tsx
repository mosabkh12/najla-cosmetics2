import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getProfile } from "@/api/profiles/profiles";
import { createOrder } from "@/api/orders/orders";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useI18n } from "@/lib/i18n";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — Najla Cosmetics" }] }),
  component: CheckoutPage,
});

const ORDER_ERROR_MAP: Record<string, string> = {
  OUT_OF_STOCK: "out_of_stock",
  PRODUCT_NOT_AVAILABLE: "order_product_unavailable",
  INVALID_ORDER: "order_invalid",
  ORDER_CREATION_FAILED: "order_creation_failed",
};

function CheckoutPage() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const { items, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [delivery, setDelivery] = useState("pickup");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

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
    const e: { name?: string; phone?: string } = {};
    if (!name.trim()) e.name = t("err_name_required");
    if (!phone.trim()) e.phone = t("err_phone_required");
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    try {
      await createOrder({
        data: {
          customer_name: name,
          customer_phone: phone,
          notes: notes || null,
          delivery_method: delivery,
          items: items.map((it) => ({
            product_id: it.product_id,
            quantity: it.quantity,
          })),
        },
      });
      toast.success(t("order_success"));
      clear();
      navigate({ to: "/profile" });
    } catch (e: unknown) {
      const key = ORDER_ERROR_MAP[getErrorMessage(e)];
      toast.error(key ? t(key) : t("order_creation_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-10 grid gap-8 lg:grid-cols-[1fr_380px]">
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
          <Label id="delivery-label" className="text-xs mb-2 block">
            {t("delivery_pickup")}
          </Label>
          <RadioGroup
            value={delivery}
            onValueChange={setDelivery}
            aria-labelledby="delivery-label"
            className="grid grid-cols-2 gap-2"
          >
            <label
              htmlFor="delivery-pickup"
              className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer text-sm ${delivery === "pickup" ? "border-primary bg-surface" : "border-border"}`}
            >
              <RadioGroupItem id="delivery-pickup" value="pickup" /> {t("delivery_pickup")}
            </label>
          </RadioGroup>
        </div>
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
        <div className="rounded-lg border border-border/60 bg-surface p-3 text-sm">
          <p className="font-medium text-foreground">{t("pay_at_store")}</p>
          <p className="text-xs text-muted-foreground mt-1">Online payments coming soon.</p>
        </div>
      </div>
      <div
        className="rounded-2xl border border-border/30 bg-card p-6 h-fit"
        style={{ boxShadow: "0 20px 40px -15px rgba(45, 45, 45, 0.06)" }}
      >
        <h2 className="font-display text-[22px] text-foreground">{t("cart")}</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((i) => (
            <li key={i.product_id} className="flex justify-between">
              <span className="text-secondary-foreground truncate me-2">
                {i.name} × {i.quantity}
              </span>
              <span className="font-medium">₪{(i.price * i.quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 pt-3 border-t flex justify-between">
          <span className="text-secondary-foreground">{t("total")}</span>
          <span className="font-semibold text-foreground text-lg">₪{subtotal.toFixed(2)}</span>
        </div>
        <button
          type="button"
          onClick={placeOrder}
          disabled={busy}
          aria-busy={busy}
          className="w-full bg-foreground text-background h-[48px] rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity disabled:opacity-40 mt-4"
        >
          {t("place_order")}
        </button>
      </div>
    </section>
  );
}
