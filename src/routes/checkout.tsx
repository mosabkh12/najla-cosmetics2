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
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — Najla Cosmetics" }] }),
  component: CheckoutPage,
});

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

  useEffect(() => { if (!loading && !user) navigate({ to: "/auth" }); }, [loading, user, navigate]);
  useEffect(() => {
    if (user) getProfile().then((data) => {
      if (data) { setName(data.full_name ?? ""); setPhone(data.phone ?? ""); }
    });
  }, [user]);

  if (!user) return null;
  if (items.length === 0) return (
    <section className="container-page py-16 text-center">
      <h1 className="font-display text-2xl">{t("empty_cart")}</h1>
      <Link to="/products"><Button className="btn-gold mt-4">{t("continue_shopping")}</Button></Link>
    </section>
  );

  const placeOrder = async () => {
    if (!name || !phone) { toast.error("Required fields missing"); return; }
    setBusy(true);
    try {
      await createOrder({
        data: {
          customer_name: name,
          customer_phone: phone,
          notes: notes || null,
          delivery_method: delivery,
          subtotal,
          items: items.map((it) => ({
            product_id: it.product_id,
            product_name: it.name,
            quantity: it.quantity,
            unit_price: it.price,
            total_price: it.price * it.quantity,
          })),
        },
      });
      toast.success(t("order_success"));
      clear();
      navigate({ to: "/profile" });
    } catch (e: any) {
      toast.error(e.message ?? "Order failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="container-page py-10 grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="rounded-2xl border border-border/60 bg-card p-5 soft-shadow space-y-4">
        <h1 className="font-display text-2xl text-foreground">{t("checkout")}</h1>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">{t("full_name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-10" /></div>
          <div><Label className="text-xs">{t("phone")}</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-10" /></div>
        </div>
        <div>
          <Label className="text-xs mb-2 block">{t("delivery_pickup")}</Label>
          <RadioGroup value={delivery} onValueChange={setDelivery} className="grid grid-cols-2 gap-2">
            <label className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer text-sm ${delivery === "pickup" ? "border-primary bg-surface" : "border-border"}`}>
              <RadioGroupItem value="pickup" /> {t("delivery_pickup")}
            </label>
          </RadioGroup>
        </div>
        <div>
          <Label className="text-xs">{t("notes_optional")}</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" />
        </div>
        <div className="rounded-lg border border-border/60 bg-surface p-3 text-sm">
          <p className="font-medium text-foreground">{t("pay_at_store")}</p>
          <p className="text-xs text-muted-foreground mt-1">Online payments coming soon.</p>
        </div>
      </div>
      <div className="rounded-2xl border border-border/60 bg-card p-5 soft-shadow h-fit">
        <h2 className="font-display text-lg text-foreground">{t("cart")}</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((i) => <li key={i.product_id} className="flex justify-between"><span className="text-secondary-foreground truncate me-2">{i.name} × {i.quantity}</span><span className="font-medium">₪{(i.price * i.quantity).toFixed(2)}</span></li>)}
        </ul>
        <div className="mt-4 pt-3 border-t flex justify-between"><span className="text-secondary-foreground">{t("total")}</span><span className="font-semibold text-foreground text-lg">₪{subtotal.toFixed(2)}</span></div>
        <Button onClick={placeOrder} disabled={busy} className="btn-gold w-full h-11 mt-4">{t("place_order")}</Button>
      </div>
    </section>
  );
}
