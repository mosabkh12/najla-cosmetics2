import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Heart, Star, CalendarDays, ShieldCheck, Gem, Award } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About — Najla Cosmetics" }] }),
  component: AboutPage,
});

function AboutPage() {
  const { t } = useI18n();
  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: async () => (await supabase.from("business_settings").select("*").maybeSingle()).data,
  });

  const values = [
    { icon: <ShieldCheck className="h-5 w-5" />, title: "Quality", titleHe: "איכות", desc: "Premium products and professional techniques", descHe: "מוצרים איכותיים וטכניקות מקצועיות" },
    { icon: <Heart className="h-5 w-5" />, title: "Care", titleHe: "אכפתיות", desc: "Personalized attention to every client", descHe: "תשומת לב אישית לכל לקוחה" },
    { icon: <Gem className="h-5 w-5" />, title: "Elegance", titleHe: "אלגנטיות", desc: "A refined experience from start to finish", descHe: "חוויה מעודנת מהתחלה ועד הסוף" },
    { icon: <Award className="h-5 w-5" />, title: "Expertise", titleHe: "מומחיות", desc: "Years of experience in beauty and cosmetics", descHe: "שנים של ניסיון ביופי וקוסמטיקה" },
  ];

  return (
    <section className="min-h-[calc(100vh-160px)] bg-gradient-to-b from-blush/30 via-background to-background">
      {/* Hero section */}
      <div className="container-page py-10 sm:py-14">
        <div className="grid gap-6 md:gap-10 md:grid-cols-[1fr_1.1fr] md:items-center">
          {/* Image — compact, not overwhelming */}
          <div className="relative">
            <div className="aspect-[4/3] sm:aspect-[3/4] md:aspect-[4/5] max-h-[420px] md:max-h-[520px] overflow-hidden rounded-2xl border border-border/40 soft-shadow">
              <img src={settings?.about_image_url ?? "https://images.unsplash.com/photo-1607779097040-26e80aa78e66?w=1200&q=85"} alt="" className="h-full w-full object-cover" />
            </div>
            {/* Floating badge */}
            <div className="absolute -bottom-4 start-4 sm:start-6 rounded-xl bg-card border border-border/40 px-4 py-2.5 soft-shadow flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-gold/80 to-gold-muted">
                <Sparkles className="h-4 w-4 text-gold-foreground" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Najla Cosmetics</p>
                <p className="text-[10px] text-muted-foreground">{t("footer_tagline")}</p>
              </div>
            </div>
          </div>

          {/* Text content */}
          <div className="mt-4 md:mt-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blush/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
              <Star className="h-3 w-3" />{t("about_eyebrow")}
            </span>
            <h1 className="mt-4 font-display text-[28px] sm:text-[34px] md:text-[40px] leading-[1.15] text-foreground">{t("about_title")}</h1>
            <p className="mt-4 text-[15px] leading-[1.8] text-secondary-foreground">{t("about_body")}</p>

            {/* CTA */}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/services">
                <Button className="btn-gold h-11 px-6 rounded-xl text-sm font-medium">
                  <CalendarDays className="me-2 h-4 w-4" />{t("book_appointment")}
                </Button>
              </Link>
              <Link to="/products">
                <Button variant="outline" className="h-11 px-6 rounded-xl text-sm font-medium">
                  {t("shop_products")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Values section */}
      <div className="container-page pb-10 sm:pb-14">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {values.map((v, i) => (
            <div key={i} className="rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm p-4 sm:p-5 soft-shadow text-center">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-blush/80 text-primary">
                {v.icon}
              </div>
              <h3 className="mt-3 font-display text-sm sm:text-base text-foreground">{v.titleHe}</h3>
              <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground leading-relaxed">{v.descHe}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
