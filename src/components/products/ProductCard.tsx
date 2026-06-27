import { Heart, ShoppingBag } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useI18n, pickLocalized } from "@/lib/i18n";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { checkFavorite, toggleFavorite } from "@/api/favorites/favorites";
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

export function ProductCard({ product }: { product: Product }) {
  const { t, lang } = useI18n();
  const { add } = useCart();
  const { user } = useAuth();
  const qc = useQueryClient();
  const name = pickLocalized(lang, product.name, product.name_ar);
  const desc = pickLocalized(lang, product.description, product.description_ar);
  const outOfStock = product.stock_quantity <= 0;
  const lowStock = !outOfStock && product.stock_quantity <= product.low_stock_threshold;

  const { data: fav } = useQuery({
    queryKey: ["favorite", product.id, user?.id],
    enabled: !!user,
    queryFn: () => checkFavorite({ data: { productId: product.id } }),
  });

  const toggleFav = async () => {
    if (!user) { toast.info(t("sign_in")); return; }
    try {
      await toggleFavorite({ data: { productId: product.id } });
    } catch (e: any) {
      toast.error(e.message);
    }
    qc.invalidateQueries({ queryKey: ["favorite", product.id, user.id] });
    qc.invalidateQueries({ queryKey: ["favorites", user.id] });
  };

  const addToCart = () => {
    add({ product_id: product.id, name, price: product.price, image_url: product.image_url, stock: product.stock_quantity });
    toast.success(t("add_to_cart"));
  };

  return (
    <article className="group relative flex flex-col">
      {/* ── Image ── */}
      <div
        className="relative aspect-[4/5] rounded-2xl overflow-hidden mb-6 cursor-pointer transition-shadow duration-500 hover:shadow-xl"
        style={{ boxShadow: "0 20px 40px -15px rgba(45, 45, 45, 0.06)" }}
      >
        {/* Clickable image area */}
        <Link to="/products/$id" params={{ id: product.id }} className="absolute inset-0 z-0">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={name}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="w-full h-full grid place-items-center bg-surface-2">
              <ShoppingBag className="h-12 w-12 text-muted-foreground/10" />
            </div>
          )}
        </Link>

        {/* Badge top-start */}
        {outOfStock && (
          <span className="absolute top-4 start-4 z-10 bg-card/90 backdrop-blur-md text-foreground px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.1em]">
            {t("out_of_stock")}
          </span>
        )}
        {lowStock && !outOfStock && (
          <span className="absolute top-4 start-4 z-10 bg-primary text-primary-foreground px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.1em]">
            {t("low_stock")}
          </span>
        )}

        {/* Favorite */}
        <button
          onClick={toggleFav}
          aria-label="Favorite"
          className="absolute top-4 end-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-card/90 backdrop-blur-md transition-all hover:scale-110"
        >
          <Heart className={`h-4 w-4 transition-colors ${fav ? "fill-primary text-primary" : "text-foreground/40"}`} />
        </button>

        {/* Hover overlay buttons */}
        <div className="absolute bottom-5 start-4 end-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-400">
          <button
            disabled={outOfStock}
            onClick={addToCart}
            className="flex-1 bg-foreground/90 backdrop-blur-md text-background py-3 rounded-full text-[10px] font-semibold uppercase tracking-[0.06em] hover:bg-foreground transition-colors disabled:opacity-40"
          >
            {t("add_to_cart")}
          </button>
        </div>
      </div>

      {/* ── Text content ── */}
      <div className="px-1">
        {/* Name */}
        <Link to="/products/$id" params={{ id: product.id }}>
          <h3 className="font-display text-[16px] sm:text-[18px] leading-[1.4] text-foreground group-hover:text-primary transition-colors line-clamp-1">
            {name}
          </h3>
        </Link>

        {/* Description */}
        {desc && (
          <p className="mt-1 text-[13px] sm:text-[14px] text-muted-foreground leading-[1.6] line-clamp-2">
            {desc}
          </p>
        )}

        {/* Price */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[15px] sm:text-[16px] font-semibold text-foreground">₪{product.price}</span>
        </div>
      </div>
    </article>
  );
}
