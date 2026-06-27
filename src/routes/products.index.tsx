import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type Product } from "@/components/products/ProductCard";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { StaggerGrid } from "@/components/ScrollReveal";

export const Route = createFileRoute("/products/")({
  head: () => ({ meta: [{ title: "Products — Najla Cosmetics" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("newest");
  const [showFilters, setShowFilters] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("is_active", true);
      return (data ?? []) as Product[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: async () => (await supabase.from("business_settings").select("*").maybeSingle()).data,
  });

  const categories = useMemo(() => ["all", ...Array.from(new Set(products.map((p) => p.category)))], [products]);
  const filtered = useMemo(() => {
    let r = products;
    if (cat !== "all") r = r.filter((p) => p.category === cat);
    if (q.trim()) r = r.filter((p) => (p.name + " " + (p.name_ar ?? "")).toLowerCase().includes(q.toLowerCase()));
    if (sort === "price_asc") r = [...r].sort((a, b) => a.price - b.price);
    else if (sort === "price_desc") r = [...r].sort((a, b) => b.price - a.price);
    return r;
  }, [products, q, cat, sort]);

  return (
    <section className="min-h-screen bg-background -mt-20">

      {/* ═══════════ Hero Banner ═══════════ */}
      <div className="relative h-[400px] sm:h-[550px] md:h-[680px] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={settings?.hero_image_url ?? "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1800&q=85"}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-background/40 to-background" />
        </div>
        <div className="relative z-10 w-full px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto">
          <div className="max-w-xl pt-20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary mb-4 animate-[fadeSlideUp_0.8s_0.2s_both]">Najla Cosmetics</p>
            <h1 className="font-display text-[32px] sm:text-[40px] md:text-[48px] leading-[1.1] tracking-tight text-foreground animate-[fadeSlideUp_0.8s_0.4s_both]">
              {t("products_title")}
            </h1>
            <p className="mt-4 text-[15px] sm:text-base text-secondary-foreground leading-[1.6] max-w-lg animate-[fadeSlideUp_0.8s_0.6s_both]">
              {t("products_sub")}
            </p>
            <div className="mt-8 flex gap-4">
              <Link to="/services">
                <button className="bg-foreground text-background px-10 py-4 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity">
                  {t("book_appointment")}
                </button>
              </Link>
              <Link to="/products">
                <button className="bg-card/50 backdrop-blur-md border border-border/30 text-foreground px-10 py-4 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:bg-card transition-colors">
                  {t("shop_products")}
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ Category Tabs ═══════════ */}
      <div className="border-b border-border/30">
        <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto">
          <div className="flex items-end justify-between pt-12 pb-0 overflow-x-auto">
            <div className="flex gap-8 sm:gap-10 min-w-max">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`pb-4 text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.12em] transition-colors whitespace-nowrap ${
                    cat === c
                      ? "text-foreground border-b-[2px] border-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c === "all" ? t("all_categories") : c}
                </button>
              ))}
            </div>
            <span className="pb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hidden md:block whitespace-nowrap ps-8">
              {filtered.length} {t("products_title").split(" ")[0]}
            </span>
          </div>
        </div>
      </div>

      {/* ═══════════ Main: Sidebar + Grid ═══════════ */}
      <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-12 sm:py-16 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">

          {/* ─── Sidebar ─── */}
          <aside className="lg:col-span-3 lg:pe-4">
            {/* Mobile toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="lg:hidden w-full flex items-center justify-between py-3 border-b border-border/40 mb-6"
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground">{t("sort")}</span>
              <span className={`text-muted-foreground text-xs transition-transform ${showFilters ? "rotate-180" : ""}`}>▾</span>
            </button>

            <div className={`space-y-12 ${showFilters ? "block" : "hidden"} lg:block`}>

              {/* Sort By */}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground mb-6">{t("sort")}</h3>
                <div className="space-y-4">
                  {([
                    ["newest", t("sort_newest")],
                    ["price_asc", t("sort_price_asc")],
                    ["price_desc", t("sort_price_desc")],
                  ] as const).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-3 cursor-pointer group">
                      <span className={`grid h-4 w-4 place-items-center rounded-full border-[1.5px] transition-colors ${
                        sort === val ? "border-primary" : "border-border group-hover:border-muted-foreground"
                      }`}>
                        {sort === val && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      <span className={`text-[15px] transition-colors ${
                        sort === val ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                      }`}>{label}</span>
                      <input type="radio" name="sort" value={val} checked={sort === val} onChange={() => setSort(val)} className="sr-only" />
                    </label>
                  ))}
                </div>
              </div>

              {/* Categories */}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground mb-6">{t("category")}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {categories.filter((c) => c !== "all").map((c) => (
                    <button
                      key={c}
                      onClick={() => setCat(cat === c ? "all" : c)}
                      className={`px-4 py-2.5 border rounded-lg text-[14px] transition-all ${
                        cat === c
                          ? "border-primary text-primary"
                          : "border-border/50 text-muted-foreground hover:border-primary hover:text-primary"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search */}
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground mb-6">{t("search")}</h3>
                <div className="relative">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("search")}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="h-10 ps-9 border-border/40 bg-transparent text-sm focus:border-primary rounded-lg"
                  />
                </div>
              </div>

              {/* Consultation CTA */}
              <div className="pt-2">
                <div className="aspect-[3/4] overflow-hidden rounded-2xl mb-5">
                  <img
                    src={settings?.about_image_url ?? "https://images.unsplash.com/photo-1607779097040-26e80aa78e66?w=600&q=85"}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="font-display text-[22px] italic text-center mb-2">{t("book_appointment")}?</p>
                <p className="text-[14px] text-muted-foreground text-center mb-5 leading-relaxed">{t("services_sub")}</p>
                <Link to="/services" className="block">
                  <button className="w-full py-3.5 rounded-full border border-foreground text-foreground text-[11px] font-semibold uppercase tracking-[0.1em] hover:bg-foreground hover:text-background transition-all">
                    {t("book_appointment")}
                  </button>
                </Link>
              </div>

            </div>
          </aside>

          {/* ─── Product Grid ─── */}
          <div className="lg:col-span-9">
            <StaggerGrid className="grid grid-cols-2 xl:grid-cols-3 gap-x-5 sm:gap-x-8 gap-y-10 sm:gap-y-16">
              {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
            </StaggerGrid>

            {filtered.length === 0 && (
              <div className="py-24 text-center">
                <p className="text-[15px] text-muted-foreground">{t("empty_cart")}</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  );
}
