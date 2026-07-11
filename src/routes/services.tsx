import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { getServices } from "@/api/services/services";
import { getSettings } from "@/api/settings/settings";
import { ServiceCard, type Service } from "@/components/services/ServiceCard";
import { BookingDialog } from "@/components/services/BookingDialog";
import { useI18n } from "@/lib/i18n";
import { Reveal, StaggerGrid } from "@/components/ScrollReveal";

export const Route = createFileRoute("/services")({
  head: () => ({ meta: [{ title: "Services — Najla Cosmetics" }] }),
  component: ServicesPage,
});

function ServicesPage() {
  const { t } = useI18n();
  const [active, setActive] = useState<Service | null>(null);
  const [cat, setCat] = useState<string>("all");

  // Same key/staleTime as index.tsx's identical getServices() call, so both
  // pages share one cache entry instead of fetching/caching it twice.
  const { data: services = [] } = useQuery({
    queryKey: ["services", "active"],
    queryFn: async () => (await getServices()) as Service[],
    staleTime: 120_000,
  });

  // No staleTime: branding content (hero image, etc.) should reflect an
  // admin's change on the next page load, not stay cached for minutes.
  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: () => getSettings(),
  });

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(services.map((s) => s.category)))],
    [services],
  );
  const filtered = cat === "all" ? services : services.filter((s) => s.category === cat);

  return (
    <section className="min-h-screen bg-background -mt-20">
      {/* ═══════════ Hero ═══════════ */}
      <div className="relative h-[320px] sm:h-[420px] md:h-[520px] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={settings?.hero_image_url ?? "/images/brand/services-hero.png"}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/20" />
        </div>
        <div className="relative z-10 w-full flex justify-center text-center px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto">
          <div className="max-w-2xl pt-20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70 mb-4 animate-[fadeSlideUp_0.2s_0.05s_both]">
              Najla Cosmetics
            </p>
            <h1 className="font-display text-[36px] sm:text-[52px] md:text-[64px] leading-[1.05] tracking-tight text-white animate-[fadeSlideUp_0.2s_0.1s_both]">
              {t("services_title")}
            </h1>
            <p className="mt-4 text-[15px] sm:text-[17px] text-white/80 max-w-lg mx-auto leading-[1.7] animate-[fadeSlideUp_0.2s_0.15s_both]">
              {t("services_sub")}
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════ Category Tabs ═══════════ */}
      <div className="border-b border-border/30">
        <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto">
          <div className="flex items-end justify-between pt-10 pb-0 overflow-x-auto">
            <div className="flex gap-8 sm:gap-10 min-w-max">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={cat === c}
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
              {filtered.length} {t("services_title").split(" ")[0]}
            </span>
          </div>
        </div>
      </div>

      {/* ═══════════ Service Grid ═══════════ */}
      <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-12 sm:py-16">
        <StaggerGrid className="grid grid-cols-2 lg:grid-cols-3 gap-x-5 sm:gap-x-8 gap-y-10 sm:gap-y-14">
          {filtered.map((s) => (
            <ServiceCard key={s.id} service={s} onBook={setActive} />
          ))}
        </StaggerGrid>

        {filtered.length === 0 && (
          <div className="py-24 text-center">
            <p className="text-[15px] text-muted-foreground">{t("no_appointments")}</p>
          </div>
        )}
      </div>

      {/* ═══════════ First Visit Guide ═══════════ */}
      <div className="bg-surface">
        <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-16 sm:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center overflow-x-hidden">
            <Reveal direction="start">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary mb-4">
                  {t("about_eyebrow")}
                </p>
                <h2 className="font-display text-[28px] sm:text-[36px] leading-[1.15] text-foreground italic">
                  {t("about_title")}
                </h2>

                <div className="mt-10 space-y-8">
                  {[
                    {
                      num: "1",
                      title: "הגיעי 15 דקות מוקדם",
                      desc: "הגיעי 15 דקות לפני התור כדי למלא את פרופיל היופי האישי שלך.",
                    },
                    {
                      num: "2",
                      title: "בחירת טיפול",
                      desc: "לא בטוחה מה מתאים? מומלץ להתחיל עם ייעוץ אישי כדי להתאים את הטיפול למטרות שלך.",
                    },
                    {
                      num: "3",
                      title: "טיפוח עור ושיער",
                      desc: "לאיפור או טיפולי פנים — הגיעי עם פנים נקיות. לטיפולי שיער — שתפי את היסטוריית המוצרים האחרונה שלך.",
                    },
                  ].map((step) => (
                    <div key={step.num} className="flex gap-5">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-primary/40 text-primary font-display text-[18px]">
                        {step.num}
                      </div>
                      <div>
                        <h3 className="font-display text-[17px] sm:text-[19px] text-foreground">
                          {step.title}
                        </h3>
                        <p className="mt-1.5 text-[14px] text-muted-foreground leading-[1.7]">
                          {step.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal direction="end" delay={2}>
              <div className="relative">
                <div
                  className="aspect-[3/4] rounded-3xl overflow-hidden"
                  style={{ boxShadow: "0 30px 60px -15px rgba(45, 45, 45, 0.12)" }}
                >
                  <img
                    src={settings?.about_image_url ?? "/images/brand/serum.png"}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <div
                    className="absolute bottom-6 start-6 end-6 bg-card/95 backdrop-blur-md rounded-2xl px-6 py-4"
                    style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.15)" }}
                  >
                    <p className="font-display text-[20px] italic text-foreground">
                      Najla Cosmetics
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mt-0.5">
                      {t("footer_tagline")}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* ═══════════ CTA Strip ═══════════ */}
      <Reveal direction="scale">
        <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-16 sm:py-20 text-center">
          <Sparkles className="h-7 w-7 mx-auto text-primary" />
          <h2 className="mt-4 font-display text-[26px] sm:text-[34px] text-foreground">
            {t("hero_title")}
          </h2>
          <p className="mt-3 text-[15px] text-muted-foreground max-w-md mx-auto leading-relaxed">
            {t("hero_sub")}
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              to="/products"
              className="bg-foreground text-background px-10 py-4 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity hover:scale-[1.02] active:scale-[0.98] transform"
            >
              {t("shop_products")}
            </Link>
            <Link
              to="/location"
              className="bg-card/50 border border-border/30 text-foreground px-10 py-4 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:bg-surface transition-colors hover:scale-[1.02] active:scale-[0.98] transform"
            >
              {t("get_directions")}
            </Link>
          </div>
        </div>
      </Reveal>

      <BookingDialog service={active} open={!!active} onOpenChange={(b) => !b && setActive(null)} />
    </section>
  );
}
