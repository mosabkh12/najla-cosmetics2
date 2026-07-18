import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { getSettings } from "@/api/settings/settings";
import { Sparkles, Star, CalendarDays, ShieldCheck, Award } from "lucide-react";
import { Reveal } from "@/components/ScrollReveal";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About — Najla Cosmetics" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ["business_settings"],
      queryFn: () => getSettings(),
    });
  },
  component: AboutPage,
});

// Same four badges, same wording, as the Home page's About preview
// (src/routes/index.tsx) — kept as one compact checklist inside the text
// column (not separate boxed cards below) specifically so the photo can be
// large without pushing the page past one screen's height.
const BADGES = [
  { icon: <Sparkles className="h-5 w-5" />, label: "Premium Quality" },
  { icon: <Star className="h-5 w-5" />, label: "Expert Care" },
  { icon: <ShieldCheck className="h-5 w-5" />, label: "Trusted Brands" },
  { icon: <Award className="h-5 w-5" />, label: "Certified Professional" },
];

function AboutPage() {
  const { t } = useI18n();
  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: () => getSettings(),
  });

  return (
    // Sized to fit within one screen (viewport minus the fixed 80px header)
    // on typical screens — a single hero row, no separate section below it,
    // so the photo can be genuinely large without needing to scroll to see
    // the rest of the page.
    <section className="min-h-[calc(100dvh-80px)] bg-background flex items-center">
      <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-6 sm:py-8 w-full">
        <div className="grid gap-8 lg:gap-14 md:grid-cols-2 md:items-center overflow-x-hidden">
          <Reveal direction="start">
            <div className="relative">
              <div
                className="aspect-[4/5] max-h-[440px] sm:max-h-[500px] overflow-hidden rounded-3xl"
                style={{ boxShadow: "0 30px 60px -15px rgba(45, 45, 45, 0.12)" }}
              >
                <img
                  src={settings?.about_image_url ?? "/images/brand/about.png"}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div
                className="absolute -bottom-4 start-4 sm:start-6 bg-card/95 backdrop-blur-md rounded-2xl px-5 py-3.5"
                style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.15)" }}
              >
                <p className="font-display text-[17px] italic text-foreground">Najla Cosmetics</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mt-0.5">
                  {t("footer_tagline")}
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal direction="end" delay={2}>
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <Star className="h-3 w-3" aria-hidden="true" />
                {t("about_eyebrow")}
              </span>
              <h1 className="mt-4 font-display text-[26px] sm:text-[32px] md:text-[38px] leading-[1.15] text-foreground italic">
                {t("about_title")}
              </h1>
              <p className="mt-4 text-[15px] leading-[1.7] text-secondary-foreground max-w-lg line-clamp-3">
                {t("about_body")}
              </p>

              <div className="mt-7 grid grid-cols-2 gap-4">
                {BADGES.map((b) => (
                  <div key={b.label} className="flex items-center gap-2.5">
                    <span className="text-primary shrink-0" aria-hidden="true">
                      {b.icon}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      {b.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to="/services"
                  className="bg-foreground text-background px-8 py-3 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity hover:scale-[1.02] active:scale-[0.98] transform"
                >
                  <CalendarDays className="inline-block me-2 h-4 w-4" aria-hidden="true" />
                  {t("book_appointment")}
                </Link>
                <Link
                  to="/products"
                  className="border border-foreground text-foreground px-8 py-3 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:bg-foreground hover:text-background transition-all hover:scale-[1.02] active:scale-[0.98] transform"
                >
                  {t("shop_products")}
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
