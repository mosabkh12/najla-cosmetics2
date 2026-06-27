import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, ShoppingBag, User as UserIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Header() {
  const { t } = useI18n();
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
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="font-display text-[22px] sm:text-[26px] italic tracking-tight text-foreground">Najla Cosmetics</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`text-[13px] uppercase tracking-[0.08em] font-medium transition-colors duration-300 ${
                pathname === n.to
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <Link to={user ? "/profile" : "/auth"} className="hidden sm:block">
            <button className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface transition-colors">
              <UserIcon className="h-[18px] w-[18px] text-foreground" />
            </button>
          </Link>
          <Link to="/cart">
            <div className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-surface transition-colors">
              <ShoppingBag className="h-[18px] w-[18px] text-foreground" />
              {count > 0 && (
                <span className="absolute -top-0.5 -end-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">{count}</span>
              )}
            </div>
          </Link>
          {isAdmin && (
            <Link to="/admin" className="hidden md:block">
              <Button variant="outline" size="sm" className="h-9 px-3 text-[11px] rounded-full border-border/40">{t("language") === "שפה" ? "ניהול" : "Admin"}</Button>
            </Link>
          )}
          <Link to="/services" className="hidden md:block">
            <button className="bg-foreground text-background px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity">
              {t("book_appointment")}
            </button>
          </Link>

          {/* Mobile menu */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button className="md:hidden grid h-10 w-10 place-items-center"><Menu className="h-5 w-5 text-foreground" /></button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] p-0 bg-background">
              <div className="flex items-center justify-between border-b border-border/20 px-6 h-20">
                <span className="font-display text-xl italic">Najla Cosmetics</span>
                <button onClick={() => setMenuOpen(false)} className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface"><X className="h-5 w-5" /></button>
              </div>
              <nav className="flex flex-col p-6 gap-1">
                {nav.map((n) => (
                  <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)} className={`rounded-xl px-4 py-3 text-[15px] font-medium transition-colors ${pathname === n.to ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-surface/50"}`}>
                    {n.label}
                  </Link>
                ))}
                <div className="mt-6 pt-6 border-t border-border/20 flex flex-col gap-3">
                  <Link to={user ? "/profile" : "/auth"} onClick={() => setMenuOpen(false)}>
                    <button className="w-full py-3 rounded-full border border-border/40 text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground hover:bg-surface transition-colors">
                      {user ? t("account") : t("sign_in")}
                    </button>
                  </Link>
                  <Link to="/services" onClick={() => setMenuOpen(false)}>
                    <button className="w-full py-3 rounded-full bg-foreground text-background text-[12px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity">
                      {t("book_appointment")}
                    </button>
                  </Link>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
