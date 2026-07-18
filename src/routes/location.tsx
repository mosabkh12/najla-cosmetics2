import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  Phone,
  Clock,
  MessageCircle,
  Navigation,
  Navigation2,
  Sparkles,
  CalendarDays,
} from "lucide-react";
import { getSettings } from "@/api/settings/settings";
import { getAvailabilitySettings } from "@/api/slots/slots";
import { useI18n } from "@/lib/i18n";
import { Reveal } from "@/components/ScrollReveal";
import { getMapEmbedSrc, getGoogleMapsDirectionsUrl, getWazeUrl } from "@/lib/location";
import { formatWeeklyHours } from "@/lib/business-hours";

export const Route = createFileRoute("/location")({
  head: () => ({ meta: [{ title: "Location — Najla Cosmetics" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["business_settings"],
        queryFn: () => getSettings(),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["availability-settings"],
        queryFn: () => getAvailabilitySettings(),
      }),
    ]);
  },
  component: LocationPage,
});

function LocationPage() {
  const { t, lang } = useI18n();
  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: () => getSettings(),
  });
  // No staleTime, on purpose: an admin closing/opening a day should show
  // up here right away, not minutes later.
  const { data: availability } = useQuery({
    queryKey: ["availability-settings"],
    queryFn: () => getAvailabilitySettings(),
  });
  const hoursLines = availability
    ? formatWeeklyHours(availability.weekly_hours, lang, t("closed"))
    : [];

  return (
    <section className="min-h-[calc(100vh-160px)] bg-background">
      <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-10 sm:py-14">
        {/* Header */}
        <Reveal direction="up">
          <div className="text-center max-w-xl mx-auto">
            <h1 className="font-display text-[32px] sm:text-[40px] md:text-[48px] italic text-foreground">
              {t("location_title")}
            </h1>
            <p className="mt-2 text-[14px] text-muted-foreground">{t("footer_tagline")}</p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-6 md:grid-cols-2 md:items-stretch overflow-x-hidden">
          {/* Map */}
          <Reveal direction="start">
            <div
              className="overflow-hidden rounded-3xl min-h-[300px] md:min-h-[500px] h-full"
              style={{ boxShadow: "0 20px 40px -15px rgba(45, 45, 45, 0.08)" }}
            >
              <iframe
                title="Map"
                src={getMapEmbedSrc(settings)}
                className="h-full w-full min-h-[300px] md:min-h-[500px]"
                loading="lazy"
              />
            </div>
          </Reveal>

          {/* Info card */}
          <Reveal direction="end" delay={2}>
            <div
              className="rounded-3xl bg-card flex flex-col h-full"
              style={{ boxShadow: "0 20px 40px -15px rgba(45, 45, 45, 0.06)" }}
            >
              {/* Brand strip */}
              <div className="bg-surface px-7 py-5 border-b border-border/20 rounded-t-3xl">
                <p className="font-display text-lg italic text-foreground">Najla Cosmetics</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t("about_eyebrow")}</p>
              </div>

              {/* Info rows */}
              <div className="flex-1 px-7 py-5 space-y-0">
                <div className="flex items-start gap-4 py-4 border-b border-border/20">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {t("address")}
                    </p>
                    <p className="text-[15px] text-foreground mt-1 leading-relaxed">
                      {settings?.address || "Nazareth, Israel"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 py-4 border-b border-border/20">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {t("phone")}
                    </p>
                    <p className="text-[15px] text-foreground mt-1 font-medium" dir="ltr">
                      {settings?.phone || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 py-4 border-b border-border/20">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {t("working_hours")}
                    </p>
                    <div className="mt-1 text-[15px] text-foreground space-y-0.5">
                      {hoursLines.map((line, i) => (
                        <p key={i}>
                          {line.label}: <span className="font-medium">{line.text}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-4 py-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#dcf8c6]/40">
                    <MessageCircle className="h-5 w-5 text-[#25D366]" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      WhatsApp
                    </p>
                    <p className="text-[15px] text-foreground mt-1 font-medium" dir="ltr">
                      {settings?.whatsapp_number || settings?.phone || "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="px-7 pb-6 space-y-3">
                <a
                  href={`https://wa.me/${(settings?.whatsapp_number ?? "").replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3.5 rounded-full border border-border/40 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground hover:bg-surface transition-colors flex items-center justify-center gap-2"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  WhatsApp
                </a>
                <div className="grid grid-cols-2 gap-3">
                  <a
                    href={getGoogleMapsDirectionsUrl(settings)}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3.5 rounded-full bg-foreground text-background text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <Navigation className="h-4 w-4" aria-hidden="true" />
                    {t("get_directions")}
                  </a>
                  <a
                    href={getWazeUrl(settings)}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
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

        {/* CTA strip */}
        <Reveal direction="scale">
          <div
            className="mt-12 rounded-3xl bg-surface p-8 sm:p-10 text-center"
            style={{ boxShadow: "0 20px 40px -15px rgba(45, 45, 45, 0.04)" }}
          >
            <Sparkles className="h-7 w-7 mx-auto text-primary" aria-hidden="true" />
            <h2 className="mt-4 font-display text-[24px] sm:text-[30px] text-foreground">
              {t("services_title")}
            </h2>
            <p className="mt-2 text-[14px] text-muted-foreground max-w-md mx-auto leading-relaxed">
              {t("services_sub")}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                to="/services"
                className="bg-foreground text-background px-8 py-3.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity hover:scale-[1.02] active:scale-[0.98] transform"
              >
                <CalendarDays className="inline-block me-2 h-4 w-4" aria-hidden="true" />
                {t("book_appointment")}
              </Link>
              <Link
                to="/products"
                className="border border-foreground text-foreground px-8 py-3.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] hover:bg-foreground hover:text-background transition-all hover:scale-[1.02] active:scale-[0.98] transform"
              >
                {t("shop_products")}
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
