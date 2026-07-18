import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Heart,
  Minus,
  Plus,
  Truck,
  Sparkles,
  ShieldCheck,
  Award,
  Star,
  ChevronLeft,
} from "lucide-react";
import { getProductById, getProductImages, getRelatedProducts } from "@/api/products/products";
import { checkFavorite, toggleFavorite } from "@/api/favorites/favorites";
import { useI18n } from "@/lib/i18n";
import { pickLocalized } from "@/lib/pick-localized";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { ProductCard, type Product } from "@/components/products/ProductCard";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/products/$id")({
  // Warms the product + its images before the route finishes navigating,
  // so the SSR HTML already shows the real product instead of a loading
  // state that only fills in once the client re-fetches post-hydration.
  // Favorite status and related products are deliberately left as
  // client-only queries — the former needs the logged-in user's session
  // (not available in the loader), the latter cascades off the product's
  // category and is below-the-fold, secondary content.
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["product", params.id],
        queryFn: () => getProductById({ data: { id: params.id } }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["product-images", params.id],
        queryFn: () => getProductImages({ data: { productId: params.id } }),
      }),
    ]);
  },
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { id } = Route.useParams();
  const { t, lang } = useI18n();
  const { add } = useCart();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  // No staleTime anywhere below: a newly-uploaded product photo (or any
  // other admin change) must show up immediately, not stay cached for
  // minutes — keeps refetching per default (staleTime: 0), same as the
  // user-specific favorite check below always did.
  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: () => getProductById({ data: { id } }),
  });

  const { data: images = [] } = useQuery({
    queryKey: ["product-images", id],
    queryFn: () => getProductImages({ data: { productId: id } }),
  });

  const { data: fav } = useQuery({
    queryKey: ["favorite", id, user?.id],
    enabled: !!user,
    queryFn: () => checkFavorite({ data: { productId: id } }),
  });

  const { data: relatedProducts = [] } = useQuery({
    queryKey: ["related-products", id, product?.category],
    enabled: !!product,
    queryFn: async () =>
      (await getRelatedProducts({ data: { id, category: product!.category } })) as Product[],
  });

  const favMutation = useMutation({
    mutationFn: () => toggleFavorite({ data: { productId: id } }),
    onMutate: async () => {
      if (!user) return;
      const favKey = ["favorite", id, user.id];
      const listKey = ["favorites", user.id];
      await Promise.all([
        qc.cancelQueries({ queryKey: favKey }),
        qc.cancelQueries({ queryKey: listKey }),
      ]);

      const prevFav = qc.getQueryData<boolean>(favKey);
      const prevList = qc.getQueryData<Product[]>(listKey);
      const nextFav = !prevFav;

      qc.setQueryData(favKey, nextFav);
      if (product) {
        qc.setQueryData<Product[]>(listKey, (old = []) =>
          nextFav ? [...old, product] : old.filter((p) => p.id !== id),
        );
      }

      return { prevFav, prevList, favKey, listKey };
    },
    onError: (e: unknown, _vars, ctx) => {
      if (ctx) {
        qc.setQueryData(ctx.favKey, ctx.prevFav);
        qc.setQueryData(ctx.listKey, ctx.prevList);
      }
      toast.error(getErrorMessage(e));
    },
    onSettled: () => {
      if (!user) return;
      qc.invalidateQueries({ queryKey: ["favorite", id, user.id] });
      qc.invalidateQueries({ queryKey: ["favorites", user.id] });
    },
  });

  const toggleFav = () => {
    if (!user) {
      toast.info(t("sign_in"));
      return;
    }
    favMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-[60vh] grid place-items-center text-center px-4">
        <div>
          <p className="text-lg text-muted-foreground mb-4">{t("product_not_found")}</p>
          <Link
            to="/products"
            className="inline-block bg-foreground text-background px-8 py-3 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em]"
          >
            {t("shop_products")}
          </Link>
        </div>
      </div>
    );
  }

  const name = pickLocalized(lang, product.name, product.name_ar, product.name_en);
  const desc = pickLocalized(
    lang,
    product.description,
    product.description_ar,
    product.description_en,
  );
  const outOfStock = product.stock_quantity <= 0;

  const allImages = [
    ...(product.image_url ? [product.image_url] : []),
    ...images.map((img) => img.image_url),
  ];

  const addToCart = () => {
    add(
      {
        product_id: product.id,
        name,
        price: product.price,
        image_url: product.image_url,
        stock: product.stock_quantity,
      },
      qty,
    );
    toast.success(t("add_to_cart"));
  };

  const buyNow = () => {
    add(
      {
        product_id: product.id,
        name,
        price: product.price,
        image_url: product.image_url,
        stock: product.stock_quantity,
      },
      qty,
    );
    navigate({ to: "/checkout" });
  };

  return (
    <section className="min-h-screen bg-background">
      <div key={id} className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto pt-6 pb-16">
        {/* ═══════════ Product Layout ═══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-10 lg:gap-16 items-start">
          {/* ── Left: Image Gallery ── */}
          <div className="flex gap-4 lg:sticky lg:top-24 animate-in fade-in slide-in-from-start-10 duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]">
            {/* Thumbnail strip */}
            <div className="hidden sm:flex flex-col gap-3 w-[80px] shrink-0">
              {(allImages.length > 0 ? allImages : [null]).map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  aria-label={`${name} ${i + 1}`}
                  aria-pressed={activeImage === i}
                  className={`aspect-square rounded-2xl overflow-hidden border-2 transition-all bg-surface ${
                    activeImage === i
                      ? "border-primary shadow-md"
                      : "border-border/20 hover:border-border/60"
                  }`}
                >
                  {url ? (
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center">
                      <Sparkles className="h-4 w-4 text-muted-foreground/20" aria-hidden="true" />
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Main Image */}
            <div
              className="flex-1 relative rounded-2xl overflow-hidden bg-surface"
              style={{
                aspectRatio: "4/5",
                maxHeight: "680px",
                boxShadow: "0 20px 40px -15px rgba(45, 45, 45, 0.08)",
              }}
            >
              {allImages.length > 0 ? (
                <img
                  src={allImages[activeImage] || allImages[0]}
                  alt={name}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center">
                  <Sparkles className="h-14 w-14 text-muted-foreground/10" aria-hidden="true" />
                </div>
              )}

              {product.stock_quantity > 0 &&
                product.stock_quantity <= product.low_stock_threshold && (
                  <span className="absolute top-5 start-5 bg-primary text-primary-foreground px-4 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.1em]">
                    {t("low_stock")}
                  </span>
                )}
            </div>
          </div>

          {/* ── Right: Product Info ── */}
          <div className="flex flex-col pt-0 lg:pt-2 animate-in fade-in slide-in-from-end-10 duration-700 delay-150 fill-mode-backwards ease-[cubic-bezier(0.22,1,0.36,1)]">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              <Link to="/products" className="hover:text-foreground transition-colors">
                {t("shop_products")}
              </Link>
              <span>/</span>
              <span className="text-foreground">{product.category}</span>
            </nav>

            {/* Product Name */}
            <h1 className="mt-4 font-display text-[32px] sm:text-[38px] md:text-[44px] leading-[1.1] text-foreground">
              {name}
            </h1>

            {/* Star Rating */}
            <div className="mt-3 flex items-center gap-1.5">
              {[1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-4 w-4 fill-primary text-primary" />
              ))}
              <Star className="h-4 w-4 fill-primary/30 text-primary/30" />
              <span className="text-[13px] text-muted-foreground ms-2">{t("product_rating")}</span>
            </div>

            {/* Price */}
            <p className="mt-6 font-display text-[32px] sm:text-[36px] text-foreground leading-none">
              ₪{product.price}
            </p>

            {/* Description */}
            {desc && (
              <p className="mt-6 text-[16px] text-secondary-foreground leading-[1.7] max-w-lg">
                {desc}
              </p>
            )}

            {/* ── Quantity + Add to Bag + Fav ── */}
            <div className="mt-10 flex items-center gap-3">
              {/* Quantity selector */}
              <div className="flex items-center border border-border/40 rounded-full h-[52px] px-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  aria-label={t("decrease_quantity")}
                  className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface transition-colors"
                >
                  <Minus className="h-4 w-4 text-foreground" aria-hidden="true" />
                </button>
                <span
                  className="w-8 text-center text-[16px] font-medium text-foreground select-none"
                  aria-live="polite"
                >
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(Math.min(product.stock_quantity, qty + 1))}
                  aria-label={t("increase_quantity")}
                  className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface transition-colors"
                >
                  <Plus className="h-4 w-4 text-foreground" aria-hidden="true" />
                </button>
              </div>

              {/* Add to Bag */}
              <button
                type="button"
                disabled={outOfStock}
                onClick={addToCart}
                className="flex-1 bg-foreground text-background h-[52px] rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {t("add_to_cart")}
              </button>

              {/* Favorite */}
              <button
                type="button"
                onClick={toggleFav}
                aria-label={fav ? t("remove_from_favorites") : t("add_to_favorites")}
                aria-pressed={!!fav}
                className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full border border-border/40 hover:bg-surface transition-colors"
              >
                <Heart
                  aria-hidden="true"
                  className={`h-5 w-5 transition-colors ${fav ? "fill-primary text-primary" : "text-foreground/40"}`}
                />
              </button>
            </div>

            {/* Buy Now */}
            <button
              type="button"
              disabled={outOfStock}
              onClick={buyNow}
              className="mt-3 w-full bg-primary text-primary-foreground h-[52px] rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {t("buy_now")}
            </button>

            {/* ── Trust Badges ── */}
            <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-5">
              {[
                { icon: <Truck className="h-[22px] w-[22px]" />, label: t("free_shipping") },
                { icon: <Sparkles className="h-[22px] w-[22px]" />, label: t("vegan_ethical") },
                {
                  icon: <ShieldCheck className="h-[22px] w-[22px]" />,
                  label: t("dermatology_approved"),
                },
                { icon: <Award className="h-[22px] w-[22px]" />, label: t("salon_professional") },
              ].map((badge) => (
                <div key={badge.label} className="flex items-center gap-3">
                  <span className="text-primary shrink-0" aria-hidden="true">
                    {badge.icon}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {badge.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Related Products ── */}
        {relatedProducts.length > 0 && (
          <div className="mt-20 pt-12 border-t border-border/20">
            <h2 className="font-display text-[24px] sm:text-[28px] text-foreground text-center">
              {t("products_title")}
            </h2>
            <p className="mt-2 text-[14px] text-muted-foreground text-center">
              {t("products_sub")}
            </p>
            <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-x-5 sm:gap-x-8 gap-y-10">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}

        {/* ── Back link ── */}
        <div className="mt-16 pt-10 border-t border-border/20">
          <Link
            to="/products"
            className="inline-flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {t("continue_shopping")}
          </Link>
        </div>
      </div>
    </section>
  );
}
