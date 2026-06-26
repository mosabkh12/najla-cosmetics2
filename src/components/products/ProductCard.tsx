import { Heart, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n, pickLocalized } from "@/lib/i18n";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface Product {
  id: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  category: string;
  price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  image_url: string | null;
}

export function ProductCard({ product, onView }: { product: Product; onView?: (p: Product) => void }) {
  const { t, lang } = useI18n();
  const { add, setOpen } = useCart();
  const { user } = useAuth();
  const qc = useQueryClient();
  const name = pickLocalized(lang, product.name, product.name_ar);
  const outOfStock = product.stock_quantity <= 0;
  const lowStock = !outOfStock && product.stock_quantity <= product.low_stock_threshold;

  const { data: fav } = useQuery({
    queryKey: ["favorite", product.id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("favorites").select("id").eq("user_id", user!.id).eq("product_id", product.id).maybeSingle();
      return !!data;
    },
  });

  const toggleFav = async () => {
    if (!user) { toast.info(t("sign_in")); return; }
    if (fav) await supabase.from("favorites").delete().eq("user_id", user.id).eq("product_id", product.id);
    else await supabase.from("favorites").insert({ user_id: user.id, product_id: product.id });
    qc.invalidateQueries({ queryKey: ["favorite", product.id, user.id] });
    qc.invalidateQueries({ queryKey: ["favorites", user.id] });
  };

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-card border border-border/60 soft-shadow transition-all hover:border-primary/40">
      <div className="relative aspect-square overflow-hidden bg-surface">
        {product.image_url && (
          <img src={product.image_url} alt={name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        )}
        <button onClick={toggleFav} aria-label="Favorite" className="absolute top-2.5 end-2.5 grid h-8 w-8 place-items-center rounded-full bg-card/90 backdrop-blur transition-colors hover:bg-card">
          <Heart className={`h-4 w-4 ${fav ? "fill-primary text-primary" : "text-muted-foreground"}`} />
        </button>
        {outOfStock && (
          <span className="absolute bottom-2.5 start-2.5 rounded-full bg-destructive/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive-foreground">{t("out_of_stock")}</span>
        )}
        {lowStock && (
          <span className="absolute bottom-2.5 start-2.5 rounded-full bg-blush px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold-deep">{t("low_stock")}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-primary">{product.category}</span>
        <h3 className="mt-1 font-display text-[15px] leading-snug text-foreground line-clamp-1">{name}</h3>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-base font-semibold text-foreground">₪{product.price}</span>
          <Button size="sm" disabled={outOfStock} onClick={() => { add({ product_id: product.id, name, price: product.price, image_url: product.image_url, stock: product.stock_quantity }); setOpen(true); }} className="btn-gold h-8 px-3 text-xs disabled:opacity-50">
            <ShoppingBag className="h-3.5 w-3.5 me-1" />{t("add_to_cart")}
          </Button>
        </div>
      </div>
    </article>
  );
}
