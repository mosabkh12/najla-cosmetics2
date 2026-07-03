import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2, ShoppingBag, ChevronLeft, Truck, ShieldCheck } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { useI18n } from "@/lib/i18n";
import { Reveal } from "@/components/ScrollReveal";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Cart — Najla Cosmetics" }] }),
  component: CartPage,
});

function CartPage() {
  const { items, remove, setQty, subtotal, count } = useCart();
  const { t } = useI18n();

  if (items.length === 0) {
    return (
      <section className="min-h-[calc(100vh-160px)] bg-background">
        <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-20 sm:py-32 text-center">
          <div className="animate-[fadeSlideUp_0.8s_0.2s_both]">
            <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/20" />
          </div>
          <h1 className="mt-6 font-display text-[28px] sm:text-[36px] text-foreground animate-[fadeSlideUp_0.8s_0.4s_both]">{t("empty_cart")}</h1>
          <p className="mt-3 text-[15px] text-muted-foreground animate-[fadeSlideUp_0.8s_0.5s_both]">{t("products_sub")}</p>
          <div className="animate-[fadeSlideUp_0.8s_0.6s_both]">
            <Link to="/products">
              <button className="mt-8 bg-foreground text-background px-10 py-4 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity hover:scale-[1.02] active:scale-[0.98] transform">
                {t("continue_shopping")}
              </button>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen bg-background">
      <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-8 sm:py-12">

        {/* Header */}
        <Reveal direction="up">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h1 className="font-display text-[30px] sm:text-[40px] text-foreground">{t("cart")}</h1>
              <p className="mt-1 text-[14px] text-muted-foreground">{count} {t("products_title").split(" ")[0]}</p>
            </div>
            <Link to="/products" className="inline-flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" />
              {t("continue_shopping")}
            </Link>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 lg:gap-16 items-start">

          {/* ── Cart Items ── */}
          <div className="overflow-x-hidden">
          <Reveal direction="start">
            <div>
              {/* Table header */}
              <div className="hidden sm:grid grid-cols-[1fr_140px_140px_40px] gap-4 pb-4 border-b border-border/30 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                <span>{t("products_title")}</span>
                <span className="text-center">{t("quantity")}</span>
                <span className="text-end">{t("total")}</span>
                <span />
              </div>

              {/* Items */}
              <div className="divide-y divide-border/20">
                {items.map((it) => (
                  <div key={it.product_id} className="py-6 sm:grid sm:grid-cols-[1fr_140px_140px_40px] sm:gap-4 sm:items-center">
                    {/* Product info */}
                    <div className="flex gap-4">
                      <div className="h-[100px] w-[80px] sm:h-[120px] sm:w-[96px] shrink-0 overflow-hidden rounded-xl bg-surface">
                        {it.image_url ? (
                          <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full grid place-items-center"><ShoppingBag className="h-6 w-6 text-muted-foreground/15" /></div>
                        )}
                      </div>
                      <div className="flex flex-col justify-center min-w-0">
                        <h3 className="font-display text-[16px] sm:text-[18px] text-foreground truncate">{it.name}</h3>
                        <p className="mt-1 text-[14px] text-muted-foreground">₪{it.price}</p>
                      </div>
                    </div>

                    {/* Quantity */}
                    <div className="flex justify-center mt-3 sm:mt-0">
                      <div className="flex items-center border border-border/40 rounded-full h-10 px-1">
                        <button onClick={() => setQty(it.product_id, it.quantity - 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface transition-colors">
                          <Minus className="h-3.5 w-3.5 text-foreground" />
                        </button>
                        <span className="w-8 text-center text-[14px] font-medium text-foreground select-none">{it.quantity}</span>
                        <button onClick={() => setQty(it.product_id, it.quantity + 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface transition-colors">
                          <Plus className="h-3.5 w-3.5 text-foreground" />
                        </button>
                      </div>
                    </div>

                    {/* Line total */}
                    <div className="hidden sm:block text-end">
                      <span className="text-[16px] font-semibold text-foreground">₪{(it.price * it.quantity).toFixed(2)}</span>
                    </div>

                    {/* Remove */}
                    <div className="hidden sm:flex justify-center">
                      <button onClick={() => remove(it.product_id)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface transition-colors text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Mobile: total + remove */}
                    <div className="flex sm:hidden items-center justify-between mt-3">
                      <span className="text-[15px] font-semibold text-foreground">₪{(it.price * it.quantity).toFixed(2)}</span>
                      <button onClick={() => remove(it.product_id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          </div>

          {/* ── Order Summary ── */}
          <Reveal direction="end" delay={2}>
            <div className="lg:sticky lg:top-24">
              <div className="rounded-2xl border border-border/30 bg-card p-6 sm:p-8"
                style={{ boxShadow: "0 20px 40px -15px rgba(45, 45, 45, 0.06)" }}
              >
                <h2 className="font-display text-[22px] text-foreground mb-6">{t("subtotal")}</h2>

                <div className="space-y-3 pb-5 border-b border-border/20">
                  {items.map((it) => (
                    <div key={it.product_id} className="flex justify-between text-[14px]">
                      <span className="text-muted-foreground truncate me-3">{it.name} × {it.quantity}</span>
                      <span className="text-foreground font-medium shrink-0">₪{(it.price * it.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center mt-5 mb-8">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("total")}</span>
                  <span className="font-display text-[28px] text-foreground">₪{subtotal.toFixed(2)}</span>
                </div>

                <Link to="/checkout" className="block">
                  <button className="w-full bg-foreground text-background h-[52px] rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity hover:scale-[1.01] active:scale-[0.99] transform">
                    {t("checkout")}
                  </button>
                </Link>

                <Link to="/products" className="block mt-3">
                  <button className="w-full bg-primary text-primary-foreground h-[52px] rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity hover:scale-[1.01] active:scale-[0.99] transform">
                    {t("continue_shopping")}
                  </button>
                </Link>

                <div className="mt-8 pt-6 border-t border-border/20 grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-muted-foreground">FREE SHIPPING</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.06em] text-muted-foreground">SECURE CHECKOUT</span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

        </div>
      </div>
    </section>
  );
}
