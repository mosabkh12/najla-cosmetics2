import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

  return (
    <section className="container-page py-12">
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div className="aspect-[4/5] overflow-hidden rounded-2xl">
          <img src={settings?.about_image_url ?? "https://images.unsplash.com/photo-1607779097040-26e80aa78e66?w=1200&q=85"} alt="" className="h-full w-full object-cover" />
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">{t("about_eyebrow")}</span>
          <h1 className="mt-3 font-display text-[30px] md:text-[40px] leading-tight text-foreground">{t("about_title")}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-secondary-foreground">{t("about_body")}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-secondary-foreground">
            {t("footer_tagline")}
          </p>
        </div>
      </div>
    </section>
  );
}
