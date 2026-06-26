import { Link } from "@tanstack/react-router";
import { Instagram, Facebook, Mail } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="bg-footer border-t border-border/60 mt-12">
      <div className="container-page py-10 grid gap-8 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg">Najla</span>
            <span className="text-[11px] uppercase tracking-[0.22em] text-primary">Cosmetics</span>
          </div>
          <p className="mt-3 text-sm text-secondary-foreground max-w-sm leading-relaxed">{t("footer_tagline")}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-3">{t("nav_services")}</h4>
          <ul className="space-y-2 text-sm text-secondary-foreground">
            <li><Link to="/services" className="hover:text-primary">{t("nav_services")}</Link></li>
            <li><Link to="/products" className="hover:text-primary">{t("nav_products")}</Link></li>
            <li><Link to="/about" className="hover:text-primary">{t("nav_about")}</Link></li>
            <li><Link to="/location" className="hover:text-primary">{t("nav_location")}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-3">{t("language")}</h4>
          <div className="flex gap-3 text-secondary-foreground">
            <a href="#" aria-label="Instagram" className="hover:text-primary"><Instagram className="h-4 w-4" /></a>
            <a href="#" aria-label="Facebook" className="hover:text-primary"><Facebook className="h-4 w-4" /></a>
            <a href="#" aria-label="Email" className="hover:text-primary"><Mail className="h-4 w-4" /></a>
          </div>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="container-page py-4 text-xs text-muted-foreground text-center">{t("copyright")}</div>
      </div>
    </footer>
  );
}
