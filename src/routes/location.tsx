import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Phone, Clock, MessageCircle, Navigation, Sparkles, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/location")({
  head: () => ({ meta: [{ title: "Location — Najla Cosmetics" }] }),
  component: LocationPage,
});

function LocationPage() {
  const { t } = useI18n();
  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: async () => (await supabase.from("business_settings").select("*").maybeSingle()).data,
  });

  return (
    <section className="min-h-[calc(100vh-160px)] bg-gradient-to-b from-blush/30 via-background to-background">
      <div className="container-page py-10 sm:py-14">
        {/* Header */}
        <div className="text-center max-w-xl mx-auto">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-gold/80 to-gold-muted soft-shadow">
            <MapPin className="h-6 w-6 text-gold-foreground" />
          </div>
          <h1 className="font-display text-[28px] md:text-[40px] text-foreground">{t("location_title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("footer_tagline")}</p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2 md:items-stretch">
          {/* Map */}
          <div className="overflow-hidden rounded-2xl border border-border/40 bg-card soft-shadow min-h-[300px] md:min-h-0">
            <iframe title="Map" src="https://www.google.com/maps?q=Nazareth&output=embed" className="h-full w-full min-h-[300px] md:min-h-full" loading="lazy" />
          </div>

          {/* Info card */}
          <div className="rounded-2xl border border-border/40 bg-card/90 backdrop-blur-sm soft-shadow flex flex-col">
            {/* Brand strip */}
            <div className="bg-gradient-to-l from-blush/60 via-cream/40 to-transparent px-6 py-4 border-b border-border/30">
              <p className="font-display text-lg text-foreground">Najla Cosmetics</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t("about_eyebrow")}</p>
            </div>

            {/* Info rows */}
            <div className="flex-1 px-6 py-5 space-y-0">
              {/* Address */}
              <div className="flex items-start gap-4 py-4 border-b border-border/30">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blush/80">
                  <MapPin className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("address")}</p>
                  <p className="text-sm text-foreground mt-0.5 leading-relaxed">{settings?.address || "Nazareth, Israel"}</p>
                </div>
              </div>

              {/* Phone */}
              <div className="flex items-start gap-4 py-4 border-b border-border/30">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cream/80">
                  <Phone className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("phone")}</p>
                  <p className="text-sm text-foreground mt-0.5 font-medium" dir="ltr">{settings?.phone || "—"}</p>
                </div>
              </div>

              {/* Working hours */}
              <div className="flex items-start gap-4 py-4 border-b border-border/30">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-soft/40">
                  <Clock className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("working_hours")}</p>
                  <div className="mt-1 space-y-0.5 text-sm text-foreground">
                    <p>Sun–Thu: <span className="font-medium">09:00–19:00</span></p>
                    <p>Fri: <span className="font-medium">09:00–15:00</span></p>
                  </div>
                </div>
              </div>

              {/* WhatsApp */}
              <div className="flex items-start gap-4 py-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#dcf8c6]/60">
                  <MessageCircle className="h-4.5 w-4.5 text-[#25D366]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">WhatsApp</p>
                  <p className="text-sm text-foreground mt-0.5 font-medium" dir="ltr">{settings?.whatsapp_number || settings?.phone || "—"}</p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="px-6 pb-5 grid grid-cols-2 gap-2.5">
              <a href={`https://wa.me/${(settings?.whatsapp_number ?? "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                <Button variant="outline" className="w-full h-11 rounded-xl text-sm font-medium border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/10 hover:border-[#25D366]/50">
                  <MessageCircle className="me-2 h-4 w-4" />WhatsApp
                </Button>
              </a>
              <a href={settings?.google_maps_url ?? "#"} target="_blank" rel="noreferrer">
                <Button className="btn-gold w-full h-11 rounded-xl text-sm font-medium">
                  <Navigation className="me-2 h-4 w-4" />{t("get_directions")}
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* CTA strip */}
        <div className="mt-8 rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm p-6 sm:p-8 soft-shadow text-center">
          <Sparkles className="h-6 w-6 mx-auto text-primary" />
          <h2 className="mt-3 font-display text-xl sm:text-2xl text-foreground">{t("services_title")}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">{t("services_sub")}</p>
          <div className="mt-5 flex justify-center gap-3">
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
    </section>
  );
}
