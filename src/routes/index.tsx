import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, MapPin, Phone, Clock, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ServiceCard, type Service } from "@/components/services/ServiceCard";
import { ProductCard, type Product } from "@/components/products/ProductCard";
import { BookingDialog } from "@/components/services/BookingDialog";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Najla Cosmetics — בית" }] }),
  component: Home,
});

function Home() {
  const { t } = useI18n();
  const [bookingService, setBookingService] = useState<Service | null>(null);

  const { data: services = [] } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("*").eq("is_active", true).order("created_at");
      return (data ?? []) as Service[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", "featured"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("is_active", true).order("created_at").limit(8);
      return (data ?? []) as Product[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("business_settings").select("*").maybeSingle();
      return data;
    },
  });

  return (
    <>
      {/* HERO */}
      <section className="relative min-h-[520px] md:min-h-[600px] overflow-hidden">
        <img src={settings?.hero_image_url ?? "https://images.unsplash.com/photo-1560750588-73207b1ef5b8?w=1800&q=85"} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-background/55 to-background/10" />
        <div className="relative container-page flex min-h-[520px] md:min-h-[600px] items-center py-12">
          <div className="max-w-xl">
            <span className="inline-block rounded-full bg-blush px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-gold-deep">Najla Cosmetics</span>
            <h1 className="mt-4 font-display text-[34px] md:text-[48px] leading-[1.1] text-foreground">{t("hero_title")}</h1>
            <p className="mt-4 text-[15px] md:text-base text-secondary-foreground max-w-md leading-relaxed">{t("hero_sub")}</p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link to="/services"><Button className="btn-gold h-11 px-5 text-sm">{t("book_appointment")}</Button></Link>
              <Link to="/products"><Button variant="outline" className="h-11 px-5 text-sm bg-card/80 backdrop-blur border-border">{t("shop_products")}</Button></Link>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="container-page py-14">
        <div className="mb-8 text-center max-w-2xl mx-auto">
          <h2 className="font-display text-[26px] md:text-[34px] text-foreground">{t("services_title")}</h2>
          <p className="mt-2 text-sm text-secondary-foreground">{t("services_sub")}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.slice(0, 6).map((s) => <ServiceCard key={s.id} service={s} onBook={setBookingService} />)}
        </div>
      </section>

      {/* PRODUCTS */}
      <section className="bg-surface py-14">
        <div className="container-page">
          <div className="mb-8 text-center max-w-2xl mx-auto">
            <h2 className="font-display text-[26px] md:text-[34px] text-foreground">{t("products_title")}</h2>
            <p className="mt-2 text-sm text-secondary-foreground">{t("products_sub")}</p>
          </div>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
          <div className="mt-8 text-center">
            <Link to="/products"><Button variant="outline" className="h-10 px-6 text-sm">{t("view_all_products")} <ArrowRight className="ms-1.5 h-4 w-4" /></Button></Link>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section className="container-page py-14">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div className="relative aspect-[4/5] md:aspect-[5/6] overflow-hidden rounded-2xl">
            <img src={settings?.about_image_url ?? "https://images.unsplash.com/photo-1607779097040-26e80aa78e66?w=1200&q=85"} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="md:ps-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">{t("about_eyebrow")}</span>
            <h2 className="mt-3 font-display text-[28px] md:text-[36px] leading-tight text-foreground">{t("about_title")}</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-secondary-foreground">{t("about_body")}</p>
            <Link to="/about"><Button className="btn-gold mt-6 h-10 px-5">{t("discover_story")}</Button></Link>
          </div>
        </div>
      </section>

      {/* LOCATION */}
      <section className="bg-surface-2 py-14">
        <div className="container-page">
          <h2 className="font-display text-[26px] md:text-[34px] text-foreground text-center">{t("location_title")}</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card aspect-[4/3]">
              <iframe title="Map" src="https://www.google.com/maps?q=Nazareth&output=embed" className="h-full w-full" loading="lazy" />
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-6 soft-shadow space-y-4">
              <div className="flex gap-3"><MapPin className="h-5 w-5 shrink-0 text-primary mt-0.5" /><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("address")}</p><p className="text-sm text-foreground">{settings?.address}</p></div></div>
              <div className="flex gap-3"><Phone className="h-5 w-5 shrink-0 text-primary mt-0.5" /><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("phone")}</p><p className="text-sm text-foreground">{settings?.phone}</p></div></div>
              <div className="flex gap-3"><Clock className="h-5 w-5 shrink-0 text-primary mt-0.5" /><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("working_hours")}</p><p className="text-sm text-foreground">Sun–Thu 09:00–19:00 · Fri 09:00–15:00</p></div></div>
              <div className="flex gap-2 pt-2">
                <a href={`https://wa.me/${(settings?.whatsapp_number ?? "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex-1"><Button variant="outline" className="w-full h-10"><MessageCircle className="me-1.5 h-4 w-4" />{t("whatsapp")}</Button></a>
                <a href={settings?.google_maps_url ?? "#"} target="_blank" rel="noreferrer" className="flex-1"><Button className="btn-gold w-full h-10">{t("get_directions")}</Button></a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <BookingDialog service={bookingService} open={!!bookingService} onOpenChange={(b) => !b && setBookingService(null)} />
    </>
  );
}
