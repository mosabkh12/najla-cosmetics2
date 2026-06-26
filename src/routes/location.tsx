import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Phone, Clock, MessageCircle } from "lucide-react";
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
    <section className="container-page py-10">
      <h1 className="font-display text-[30px] md:text-[40px] text-foreground text-center">{t("location_title")}</h1>
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
    </section>
  );
}
