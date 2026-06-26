import { Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n, pickLocalized } from "@/lib/i18n";

export interface Service {
  id: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  category: string;
  image_url: string | null;
  price: number;
  duration_minutes: number;
}

export function ServiceCard({ service, onBook }: { service: Service; onBook: (s: Service) => void }) {
  const { t, lang } = useI18n();
  const name = pickLocalized(lang, service.name, service.name_ar);
  const desc = pickLocalized(lang, service.description, service.description_ar);
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-card border border-border/60 soft-shadow transition-all hover:border-primary/40">
      <div className="relative aspect-[4/3] overflow-hidden bg-surface">
        {service.image_url && (
          <img src={service.image_url} alt={name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        )}
        <span className="absolute top-3 start-3 rounded-full bg-card/90 backdrop-blur px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          {service.category}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <h3 className="font-display text-lg leading-tight text-foreground">{name}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-secondary-foreground line-clamp-2">{desc}</p>
        <div className="mt-3 flex items-center gap-3 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3 text-primary" />{t("starting_at")}₪{service.price}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{service.duration_minutes} {t("minutes")}</span>
        </div>
        <Button onClick={() => onBook(service)} className="btn-gold mt-4 h-10 w-full text-[13px]">{t("book_now")}</Button>
      </div>
    </article>
  );
}
