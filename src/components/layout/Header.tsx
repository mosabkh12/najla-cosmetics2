import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, ShoppingBag, User as UserIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Header() {
  const { t, dir } = useI18n();
  const { user, isAdmin } = useAuth();
  const { count } = useCart();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = [
    { to: "/", label: t("nav_home") },
    { to: "/services", label: t("nav_services") },
    { to: "/products", label: t("nav_products") },
    { to: "/about", label: t("nav_about") },
    { to: "/location", label: t("nav_location") },
  ];

  return (
    <header className="fixed top-0 w-full z-50 bg-background/70 backdrop-blur-xl border-b border-border/20 transition-all duration-300">
      <div className="flex justify-between items-center w-full px-5 sm:px-10 md:px-20 h-20 max-w-[1400px] mx-auto">
        {/* Start group: mobile menu trigger + logo */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          {/* Mobile menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label={t("menu")}
                className="md:hidden grid h-10 w-10 place-items-center"
              >
                <Menu className="h-5 w-5 text-foreground" aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent
              side={dir === "rtl" ? "right" : "left"}
              className="w-[300px] p-0 bg-background"
              hideClose
            >
              <div className="flex items-center justify-between border-b border-border/20 px-6 h-20">
                <SheetTitle className="font-display text-xl italic font-medium text-foreground">
                  Najla Cosmetics
                </SheetTitle>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label={t("close_menu")}
                  className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <nav className="flex flex-col p-6 gap-1" aria-label={t("mobile_navigation")}>
                {nav.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setMenuOpen(false)}
                    aria-current={pathname === n.to ? "page" : undefined}
                    className={`rounded-xl px-4 py-3 text-[15px] font-medium transition-colors ${pathname === n.to ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-surface/50"}`}
                  >
                    {n.label}
                  </Link>
                ))}
                <div className="mt-6 pt-6 border-t border-border/20 flex flex-col gap-3">
                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setMenuOpen(false)}
                      className="w-full py-3 rounded-full border border-border/40 text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground hover:bg-surface transition-colors text-center"
                    >
                      {t("language") === "שפה" ? "ניהול" : "Admin"}
                    </Link>
                  )}
                  <Link
                    to={user ? "/profile" : "/auth"}
                    onClick={() => setMenuOpen(false)}
                    className="w-full py-3 rounded-full border border-border/40 text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground hover:bg-surface transition-colors text-center"
                  >
                    {user ? t("account") : t("sign_in")}
                  </Link>
                  <Link
                    to="/services"
                    onClick={() => setMenuOpen(false)}
                    className="w-full py-3 rounded-full bg-foreground text-background text-[12px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity text-center"
                  >
                    {t("book_appointment")}
                  </Link>
                </div>
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <span className="font-display text-[22px] sm:text-[26px] italic tracking-tight text-foreground">
              Najla Cosmetics
            </span>
          </Link>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8" aria-label={t("main_navigation")}>
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              aria-current={pathname === n.to ? "page" : undefined}
              className={`text-[13px] uppercase tracking-[0.08em] font-medium transition-colors duration-300 ${
                pathname === n.to ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <Link
            to={user ? "/profile" : "/auth"}
            aria-label={user ? t("account") : t("sign_in")}
            className="hidden sm:grid h-10 w-10 place-items-center rounded-full hover:bg-surface transition-colors"
          >
            <UserIcon className="h-[18px] w-[18px] text-foreground" aria-hidden="true" />
          </Link>
          <Link
            to="/cart"
            aria-label={count > 0 ? `${t("cart")} (${count})` : t("cart")}
            className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-surface transition-colors"
          >
            <ShoppingBag className="h-[18px] w-[18px] text-foreground" aria-hidden="true" />
            {count > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -end-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
              >
                {count}
              </span>
            )}
          </Link>
          {isAdmin && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="hidden md:inline-flex h-9 px-3 text-[11px] rounded-full border-border/40"
            >
              <Link to="/admin">{t("language") === "שפה" ? "ניהול" : "Admin"}</Link>
            </Button>
          )}
          <Link
            to="/services"
            className="hidden md:block bg-foreground text-background px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity"
          >
            {t("book_appointment")}
          </Link>
        </div>
      </div>
    </header>
  );
}
