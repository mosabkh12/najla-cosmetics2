import { Clock, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { pickLocalized } from "@/lib/pick-localized";

export interface Service {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  category: string;
  image_url: string | null;
  thumbnail_url: string | null;
  price: number;
  duration_minutes: number;
}

export function ServiceCard({
  service,
  onBook,
}: {
  service: Service;
  onBook: (s: Service) => void;
}) {
  const { t, lang } = useI18n();
  const name = pickLocalized(lang, service.name, service.name_ar, service.name_en);
  const desc = pickLocalized(
    lang,
    service.description,
    service.description_ar,
    service.description_en,
  );

  return (
    <article className="group relative flex flex-col">
      {/* Image */}
      <div
        className="relative aspect-[4/5] sm:aspect-[4/5] rounded-2xl overflow-hidden transition-shadow duration-500 hover:shadow-xl"
        style={{ boxShadow: "0 20px 40px -15px rgba(45, 45, 45, 0.06)" }}
      >
        {/* Clickable image area — a real button (not a div onClick) so it's
            reachable and activatable via keyboard, matching the pattern
            used for the equivalent product-image link in ProductCard. */}
        <button
          type="button"
          onClick={() => onBook(service)}
          aria-label={`${t("book_now")}: ${name}`}
          className="absolute inset-0 z-0 cursor-pointer"
        >
          {service.image_url ? (
            <img
              src={service.thumbnail_url ?? service.image_url}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-surface-2">
              <Sparkles className="h-10 w-10 text-muted-foreground/10" aria-hidden="true" />
            </div>
          )}
        </button>

        {/* Category badge */}
        <span className="absolute top-3 sm:top-4 start-3 sm:start-4 z-10 bg-card/90 backdrop-blur-md text-foreground px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.1em]">
          {service.category}
        </span>

        {/* Hover overlay - Book Now (sibling of the image button above, not
            nested inside it, to avoid a button-in-a-button; visually
            redundant with the image button but a clearer, larger target).
            group-focus-within (not just group-hover) so keyboard focus
            reveals it instead of leaving a focused-but-invisible control. */}
        <div className="absolute bottom-4 sm:bottom-5 inset-x-3 sm:inset-x-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => onBook(service)}
            className="flex-1 bg-foreground/90 backdrop-blur-md text-background py-2.5 sm:py-3 rounded-full text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.08em] hover:bg-foreground transition-colors"
          >
            {t("book_now")}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-0.5 sm:px-1 mt-4 sm:mt-5">
        {/* Name */}
        <h3 className="font-display text-[15px] sm:text-[18px] leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-1">
          {name}
        </h3>

        {/* Description */}
        {desc && (
          <p className="mt-1 text-[11px] sm:text-[14px] text-muted-foreground leading-[1.6] line-clamp-2">
            {desc}
          </p>
        )}

        {/* Price & Duration */}
        <div className="mt-2 sm:mt-3 flex items-center gap-3 sm:gap-4 text-[12px] sm:text-[14px]">
          <span className="font-semibold text-foreground">₪{service.price}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            {service.duration_minutes} {t("minutes")}
          </span>
        </div>
      </div>
    </article>
  );
}
