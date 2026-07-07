import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { getSettings } from "@/api/settings/settings";
import { Sparkles, Heart, Star, CalendarDays, ShieldCheck, Gem, Award } from "lucide-react";
import { Reveal, StaggerGrid } from "@/components/ScrollReveal";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About — Najla Cosmetics" }] }),
  component: AboutPage,
});

function AboutPage() {
  const { t } = useI18n();
  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: () => getSettings(),
  });

  const values = [
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      titleHe: "איכות",
      descHe: "מוצרים איכותיים וטכניקות מקצועיות",
    },
    { icon: <Heart className="h-5 w-5" />, titleHe: "אכפתיות", descHe: "תשומת לב אישית לכל לקוחה" },
    {
      icon: <Gem className="h-5 w-5" />,
      titleHe: "אלגנטיות",
      descHe: "חוויה מעודנת מהתחלה ועד הסוף",
    },
    {
      icon: <Award className="h-5 w-5" />,
      titleHe: "מומחיות",
      descHe: "שנים של ניסיון ביופי וקוסמטיקה",
    },
  ];

  return (
    // Sized to fit within one screen (viewport minus the fixed 80px header)
    // on typical screens, so the whole page — hero and values both — is
    // visible without needing to scroll to see the rest of it.
    <section className="min-h-[calc(100dvh-80px)] bg-background flex flex-col justify-center">
      {/* Hero section */}
      <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-4 sm:py-7 w-full">
        <div className="grid gap-5 md:gap-8 md:grid-cols-[1fr_1.1fr] md:items-center overflow-x-hidden">
          <Reveal direction="start">
            <div className="relative">
              <div
                className="aspect-[4/3] sm:aspect-[3/4] md:aspect-[4/5] max-h-[200px] sm:max-h-[280px] md:max-h-[320px] overflow-hidden rounded-3xl border border-border/40"
                style={{ boxShadow: "0 30px 60px -15px rgba(45, 45, 45, 0.12)" }}
              >
                <img
                  src={settings?.about_image_url ?? "/images/brand/about.png"}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div
                className="absolute -bottom-4 start-4 sm:start-6 rounded-2xl bg-card/95 backdrop-blur-md border border-border/20 px-5 py-3"
                style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.15)" }}
              >
                <p className="font-display text-[16px] italic text-foreground">Najla Cosmetics</p>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mt-0.5">
                  {t("footer_tagline")}
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal direction="end" delay={2}>
            <div className="mt-4 md:mt-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <Star className="h-3 w-3" />
                {t("about_eyebrow")}
              </span>
              <h1 className="mt-3 font-display text-[24px] sm:text-[28px] md:text-[32px] leading-[1.15] text-foreground">
                {t("about_title")}
              </h1>
              <p className="mt-3 text-[14px] leading-[1.6] text-secondary-foreground line-clamp-2 sm:line-clamp-3">
                {t("about_body")}
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link to="/services">
                  <button className="bg-foreground text-background px-8 py-3 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity hover:scale-[1.02] active:scale-[0.98] transform">
                    <CalendarDays className="inline-block me-2 h-4 w-4" />
                    {t("book_appointment")}
                  </button>
                </Link>
                <Link to="/products">
                  <button className="border border-foreground text-foreground px-8 py-3 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:bg-foreground hover:text-background transition-all hover:scale-[1.02] active:scale-[0.98] transform">
                    {t("shop_products")}
                  </button>
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* Values section */}
      <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto pb-5 sm:pb-7 w-full">
        <StaggerGrid className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {values.map((v, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/30 bg-card/80 backdrop-blur-sm p-3 sm:p-3.5 text-center"
              style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.04)" }}
            >
              <div className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-surface text-muted-foreground">
                {v.icon}
              </div>
              <h3 className="mt-2 font-display text-sm text-foreground">{v.titleHe}</h3>
              <p className="mt-1 text-[11px] text-muted-foreground leading-snug line-clamp-2">
                {v.descHe}
              </p>
            </div>
          ))}
        </StaggerGrid>
      </div>
    </section>
  );
}
