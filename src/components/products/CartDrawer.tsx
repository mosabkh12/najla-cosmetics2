import { Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/useCart";
import { useI18n } from "@/lib/i18n";

export function CartDrawer() {
  const { items, open, setOpen, remove, setQty, subtotal } = useCart();
  const { t } = useI18n();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-background flex flex-col p-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="font-display text-xl">{t("cart")}</SheetTitle>
          <SheetDescription className="sr-only">{t("cart")}</SheetDescription>
        </SheetHeader>
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-secondary-foreground">{t("empty_cart")}</p>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("continue_shopping")}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {items.map((it) => (
                <div
                  key={it.product_id}
                  className="flex gap-3 rounded-xl border border-border/60 bg-card p-2.5"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface">
                    {it.image_url && (
                      <img src={it.image_url} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{it.name}</p>
                    <p className="text-sm font-semibold text-primary">₪{it.price}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <div className="inline-flex items-center rounded-md border border-border">
                        <button
                          type="button"
                          onClick={() => setQty(it.product_id, it.quantity - 1)}
                          aria-label={`${t("decrease_quantity")}: ${it.name}`}
                          className="grid h-7 w-7 place-items-center hover:bg-surface"
                        >
                          <Minus className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <span className="w-7 text-center text-xs font-medium" aria-live="polite">
                          {it.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty(it.product_id, it.quantity + 1)}
                          aria-label={`${t("increase_quantity")}: ${it.name}`}
                          className="grid h-7 w-7 place-items-center hover:bg-surface"
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(it.product_id)}
                        aria-label={`${t("remove")}: ${it.name}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t px-5 py-4 space-y-3 bg-surface">
              <div className="flex justify-between text-sm">
                <span className="text-secondary-foreground">{t("subtotal")}</span>
                <span className="font-semibold text-foreground">₪{subtotal.toFixed(2)}</span>
              </div>
              <Button asChild className="btn-gold w-full h-10">
                <Link to="/checkout" onClick={() => setOpen(false)}>
                  {t("checkout")}
                </Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
