import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  MapPin,
  Phone,
  Clock,
  MessageCircle,
  Navigation,
  Navigation2,
  Sparkles,
  Star,
  ShieldCheck,
  Award,
} from "lucide-react";
import { getServices } from "@/api/services/services";
import { getFeaturedProducts } from "@/api/products/products";
import { getSettings } from "@/api/settings/settings";
import { getAvailabilitySettings } from "@/api/slots/slots";
import { ServiceCard, type Service } from "@/components/services/ServiceCard";
import { ProductCard, type Product } from "@/components/products/ProductCard";
import { BookingDialog } from "@/components/services/BookingDialog";
import { useI18n } from "@/lib/i18n";
import { Reveal, StaggerGrid } from "@/components/ScrollReveal";
import { getMapEmbedSrc, getGoogleMapsDirectionsUrl, getWazeUrl } from "@/lib/location";
import { formatWeeklyHours } from "@/lib/business-hours";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Najla Cosmetics — בית" }] }),
  component: Home,
});

function Home() {
  const { t, lang } = useI18n();
  const [bookingService, setBookingService] = useState<Service | null>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [heroOffset, setHeroOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (heroRef.current) {
        setHeroOffset(window.scrollY * 0.3);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Query keys here intentionally match services.tsx, products.index.tsx,
  // and products.$id.tsx exactly, so the same public data is shared across
  // pages instead of being fetched and cached separately per route. No
  // staleTime: a newly-uploaded product/service photo (or any other admin
  // change) must show up immediately, not stay cached for minutes.
  const { data: services = [] } = useQuery({
    queryKey: ["services", "active"],
    queryFn: async () => (await getServices()) as Service[],
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", "featured"],
    queryFn: async () => (await getFeaturedProducts()) as Product[],
  });

  // No staleTime: branding content (hero image, address, phone, hours)
  // should reflect an admin's change on the next page load, not stay
  // cached for minutes.
  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: () => getSettings(),
  });

  // The real, bookable weekly hours (same source of truth the Availability
  // admin page edits and the booking flow itself enforces) — never
  // hardcoded, so this can't drift out of sync with what customers can
  // actually book. No staleTime, on purpose: an admin closing/opening a
  // day should show up on this page right away, not minutes later.
  const { data: availability } = useQuery({
    queryKey: ["availability-settings"],
    queryFn: () => getAvailabilitySettings(),
  });
  const hoursLines = availability
    ? formatWeeklyHours(availability.weekly_hours, lang, t("closed"))
    : [];

  return (
    <>
      {/* ═══════════ HERO — parallax ═══════════ */}
      <section
        ref={heroRef}
        className="relative h-[500px] sm:h-[600px] md:h-[85vh] md:max-h-[900px] overflow-hidden -mt-20"
      >
        <div className="absolute inset-0 overflow-hidden">
          <img
            src={settings?.hero_image_url || "/images/brand/hero.png"}
            alt=""
            className="h-[120%] w-full object-cover"
            style={{ transform: `translate3d(0, ${heroOffset}px, 0)` }}
          />
        </div>
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative flex h-full items-center justify-center text-center px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto">
          <div className="max-w-2xl pt-20">
            <h1 className="font-display text-[36px] sm:text-[52px] md:text-[72px] leading-[1.05] tracking-tight text-white animate-[fadeSlideUp_1.2s_0.2s_both]">
              {t("hero_title").split(".")[0]}.{" "}
              <em className="italic">{t("hero_title").split(".")[1] || ""}</em>
            </h1>
            <p className="mt-5 text-[15px] sm:text-[17px] text-white/80 max-w-lg mx-auto leading-[1.7] animate-[fadeSlideUp_1.2s_0.5s_both]">
              {t("hero_sub")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4 animate-[fadeSlideUp_1.2s_0.8s_both]">
              <Link
                to="/services"
                className="bg-foreground text-background px-10 py-4 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity hover:scale-[1.02] active:scale-[0.98] transform"
              >
                {t("book_appointment")}
              </Link>
              <Link
                to="/products"
                className="bg-white/10 backdrop-blur-md border border-white/30 text-white px-10 py-4 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:bg-white/20 transition-colors hover:scale-[1.02] active:scale-[0.98] transform"
              >
                {t("shop_products")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ SERVICES ═══════════ */}
      <section className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-20 sm:py-28">
        <Reveal direction="up">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary mb-3">
                {t("about_eyebrow")}
              </p>
              <h2 className="font-display text-[28px] sm:text-[36px] md:text-[42px] leading-[1.1] text-foreground">
                {t("services_title")}
              </h2>
              <p className="mt-3 text-[15px] text-muted-foreground max-w-lg leading-relaxed">
                {t("services_sub")}
              </p>
            </div>
            <Link
              to="/services"
              className="shrink-0 border border-foreground text-foreground px-8 py-3 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:bg-foreground hover:text-background transition-all hover:scale-[1.02] active:scale-[0.98] transform"
            >
              {t("nav_services")}{" "}
              <ArrowRight className="inline-block ms-2 h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
        <StaggerGrid className="grid grid-cols-2 lg:grid-cols-3 gap-x-5 sm:gap-x-8 gap-y-10 sm:gap-y-14">
          {services.slice(0, 6).map((s) => (
            <ServiceCard key={s.id} service={s} onBook={setBookingService} />
          ))}
        </StaggerGrid>
      </section>

      {/* ═══════════ PRODUCTS ═══════════ */}
      <section className="bg-surface">
        <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-20 sm:py-28">
          <Reveal direction="up">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary mb-3">
                  Najla Cosmetics
                </p>
                <h2 className="font-display text-[28px] sm:text-[36px] md:text-[42px] leading-[1.1] text-foreground">
                  {t("products_title")}
                </h2>
                <p className="mt-3 text-[15px] text-muted-foreground max-w-lg leading-relaxed">
                  {t("products_sub")}
                </p>
              </div>
              <Link
                to="/products"
                className="shrink-0 border border-foreground text-foreground px-8 py-3 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:bg-foreground hover:text-background transition-all hover:scale-[1.02] active:scale-[0.98] transform"
              >
                {t("view_all_products")}{" "}
                <ArrowRight className="inline-block ms-2 h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
          <StaggerGrid className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 sm:gap-x-8 gap-y-10 sm:gap-y-14">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </StaggerGrid>
        </div>
      </section>

      {/* ═══════════ ABOUT ═══════════ */}
      <section className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-20 sm:py-28">
        <div className="grid gap-10 lg:gap-20 md:grid-cols-2 md:items-center overflow-x-hidden">
          <Reveal direction="start">
            <div className="relative">
              <div
                className="aspect-[4/5] max-h-[600px] overflow-hidden rounded-3xl"
                style={{ boxShadow: "0 30px 60px -15px rgba(45, 45, 45, 0.12)" }}
              >
                <img
                  src={settings?.about_image_url ?? "/images/brand/about.png"}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div
                className="absolute -bottom-5 start-5 sm:start-8 bg-card/95 backdrop-blur-md rounded-2xl px-6 py-4"
                style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.15)" }}
              >
                <p className="font-display text-[18px] italic text-foreground">Najla Cosmetics</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mt-0.5">
                  {t("footer_tagline")}
                </p>
              </div>
            </div>
          </Reveal>
          <Reveal direction="end" delay={2}>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary mb-4">
                {t("about_eyebrow")}
              </p>
              <h2 className="font-display text-[28px] sm:text-[36px] md:text-[42px] leading-[1.12] text-foreground italic">
                {t("about_title")}
              </h2>
              <p className="mt-5 text-[16px] text-muted-foreground leading-[1.7] max-w-lg">
                {t("about_body")}
              </p>

              <div className="mt-10 grid grid-cols-2 gap-5">
                {[
                  { icon: <Sparkles className="h-5 w-5" />, label: "Premium Quality" },
                  { icon: <Star className="h-5 w-5" />, label: "Expert Care" },
                  { icon: <ShieldCheck className="h-5 w-5" />, label: "Trusted Brands" },
                  { icon: <Award className="h-5 w-5" />, label: "Certified Professional" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-primary" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-10">
                <Link
                  to="/about"
                  className="inline-block bg-foreground text-background px-10 py-4 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity hover:scale-[1.02] active:scale-[0.98] transform"
                >
                  {t("discover_story")}
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════════ LOCATION ═══════════ */}
      {/* Sized to fit within one screen (viewport minus the fixed 80px
          header) once scrolled into view, so the whole section — map, info,
          and buttons — is visible without extra scrolling inside it. */}
      <section className="bg-surface min-h-[calc(100dvh-80px)] flex items-center">
        <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-8 sm:py-10 w-full">
          <Reveal direction="up">
            <div className="text-center max-w-xl mx-auto mb-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary mb-2">
                Najla Cosmetics
              </p>
              <h2 className="font-display text-[24px] sm:text-[30px] md:text-[34px] text-foreground">
                {t("location_title")}
              </h2>
            </div>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-2 md:items-stretch overflow-x-hidden">
            <Reveal direction="start">
              <div
                className="overflow-hidden rounded-3xl min-h-[260px] h-full"
                style={{ boxShadow: "0 20px 40px -15px rgba(45, 45, 45, 0.08)" }}
              >
                <iframe
                  title="Map"
                  src={getMapEmbedSrc(settings)}
                  className="h-full w-full min-h-[260px]"
                  loading="lazy"
                />
              </div>
            </Reveal>
            <Reveal direction="end" delay={2}>
              <div
                className="rounded-3xl bg-card p-5 sm:p-6 flex flex-col h-full"
                style={{ boxShadow: "0 20px 40px -15px rgba(45, 45, 45, 0.06)" }}
              >
                <div className="space-y-3.5 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-surface">
                      <MapPin className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {t("address")}
                      </p>
                      <p className="text-[14px] text-foreground mt-0.5 leading-snug">
                        {settings?.address || "Nazareth, Israel"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-surface">
                      <Phone className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {t("phone")}
                      </p>
                      <p className="text-[14px] text-foreground mt-0.5 font-medium" dir="ltr">
                        {settings?.phone || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-surface">
                      <Clock className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        {t("working_hours")}
                      </p>
                      <div className="mt-0.5 text-[14px] text-foreground space-y-0.5">
                        {hoursLines.map((line, i) => (
                          <p key={i}>
                            {line.label}: <span className="font-medium">{line.text}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <a
                    href={`https://wa.me/${(settings?.whatsapp_number ?? "").replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 rounded-full border border-border/40 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground hover:bg-surface transition-colors flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    WhatsApp
                  </a>
                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={getGoogleMapsDirectionsUrl(settings)}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2.5 rounded-full bg-foreground text-background text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                    >
                      <Navigation className="h-4 w-4" aria-hidden="true" />
                      {t("get_directions")}
                    </a>
                    <a
                      href={getWazeUrl(settings)}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                      style={{ backgroundColor: "#33CCFF" }}
                    >
                      <Navigation2 className="h-4 w-4" aria-hidden="true" />
                      {t("waze")}
                    </a>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <BookingDialog
        service={bookingService}
        open={!!bookingService}
        onOpenChange={(b) => !b && setBookingService(null)}
      />
    </>
  );
}
