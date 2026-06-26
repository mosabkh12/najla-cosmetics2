import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type Product } from "@/components/products/ProductCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/products")({
  head: () => ({ meta: [{ title: "Products — Najla Cosmetics" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("newest");

  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("is_active", true);
      return (data ?? []) as Product[];
    },
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
    <section className="container-page py-10">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="font-display text-[30px] md:text-[40px] text-foreground">{t("products_title")}</h1>
        <p className="mt-2 text-sm text-secondary-foreground">{t("products_sub")}</p>
      </div>
      <div className="mt-6 grid gap-2.5 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="h-10 ps-9" />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="h-10 min-w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>{categories.map((c) => <SelectItem key={c} value={c}>{c === "all" ? t("all_categories") : c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-10 min-w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t("sort_newest")}</SelectItem>
            <SelectItem value="price_asc">{t("sort_price_asc")}</SelectItem>
            <SelectItem value="price_desc">{t("sort_price_desc")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="mt-7 grid gap-4 grid-cols-2 lg:grid-cols-4">
        {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}
