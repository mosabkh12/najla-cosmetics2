import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Instagram, Facebook, Mail } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { getSettings } from "@/api/settings/settings";

export function Footer() {
  const { t } = useI18n();
  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: () => getSettings(),
  });
  return (
    <footer className="bg-surface-3 border-t border-border/20">
      <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-12 sm:py-16 md:py-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10 md:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <span className="font-display text-[24px] italic text-foreground">Najla Cosmetics</span>
            <p className="mt-3 md:mt-4 text-[14px] text-muted-foreground max-w-xs leading-[1.7]">
              {t("footer_tagline")}
            </p>
            <div className="flex gap-3 mt-5 md:mt-6">
              <a
                href="#"
                aria-label="Instagram"
                className="grid h-10 w-10 place-items-center rounded-full border border-border/40 text-muted-foreground hover:bg-foreground hover:text-background hover:border-foreground transition-all"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="Facebook"
                className="grid h-10 w-10 place-items-center rounded-full border border-border/40 text-muted-foreground hover:bg-foreground hover:text-background hover:border-foreground transition-all"
              >
                <Facebook className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="Email"
                className="grid h-10 w-10 place-items-center rounded-full border border-border/40 text-muted-foreground hover:bg-foreground hover:text-background hover:border-foreground transition-all"
              >
                <Mail className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Shop links */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] text-foreground mb-4 md:mb-6">
              {t("nav_products")}
            </h4>
            <ul className="space-y-2.5 md:space-y-3">
              <li>
                <Link
                  to="/products"
                  className="text-[14px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("nav_products")}
                </Link>
              </li>
              <li>
                <Link
                  to="/services"
                  className="text-[14px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("nav_services")}
                </Link>
              </li>
              <li>
                <Link
                  to="/about"
                  className="text-[14px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("nav_about")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Assistance */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] text-foreground mb-4 md:mb-6">
              {t("nav_location")}
            </h4>
            <ul className="space-y-2.5 md:space-y-3">
              <li>
                <Link
                  to="/location"
                  className="text-[14px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("nav_location")}
                </Link>
              </li>
              <li>
                <Link
                  to="/auth"
                  className="text-[14px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("sign_in")}
                </Link>
              </li>
              <li>
                <Link
                  to="/profile"
                  className="text-[14px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("account")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Studio */}
          <div className="col-span-2 md:col-span-1">
            <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] text-foreground mb-4 md:mb-6">
              {t("address")}
            </h4>
            <p className="text-[14px] text-muted-foreground leading-relaxed mb-4">
              {settings?.address || "Nazareth, Israel"}
            </p>
            <Link
              to="/services"
              className="inline-block bg-primary text-primary-foreground px-6 py-2.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.1em] hover:opacity-90 transition-opacity"
            >
              {t("nav_services")}
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border/20">
        <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-5 sm:py-6 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {t("copyright")}
          </p>
        </div>
      </div>
    </footer>
  );
}
