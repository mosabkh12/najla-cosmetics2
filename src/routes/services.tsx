import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ServiceCard, type Service } from "@/components/services/ServiceCard";
import { BookingDialog } from "@/components/services/BookingDialog";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/services")({
  head: () => ({ meta: [{ title: "Services — Najla Cosmetics" }] }),
  component: ServicesPage,
});

function ServicesPage() {
  const { t } = useI18n();
  const [active, setActive] = useState<Service | null>(null);
  const [cat, setCat] = useState<string>("all");

  const { data: services = [] } = useQuery({
    queryKey: ["services", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("*").eq("is_active", true).order("created_at");
      return (data ?? []) as Service[];
    },
  });

  const categories = useMemo(() => ["all", ...Array.from(new Set(services.map((s) => s.category)))], [services]);
  const filtered = cat === "all" ? services : services.filter((s) => s.category === cat);

  return (
    <section className="container-page py-10">
      <div className="text-center max-w-2xl mx-auto">
        <h1 className="font-display text-[30px] md:text-[40px] text-foreground">{t("services_title")}</h1>
        <p className="mt-2 text-sm text-secondary-foreground">{t("services_sub")}</p>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-1.5">
        {categories.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${cat === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-secondary-foreground hover:border-primary"}`}>
            {c === "all" ? t("all_categories") : c}
          </button>
        ))}
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => <ServiceCard key={s.id} service={s} onBook={setActive} />)}
      </div>
      <BookingDialog service={active} open={!!active} onOpenChange={(b) => !b && setActive(null)} />
    </section>
  );
}
