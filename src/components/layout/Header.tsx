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
  const { user } = useAuth();
  const { count, setOpen } = useCart();
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
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border/60">
      <div className="container-page flex h-14 items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="font-display text-[19px] tracking-wide text-foreground">Najla</span>
          <span className="text-[11px] uppercase tracking-[0.22em] text-primary">Cosmetics</span>
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className={`text-[13px] font-medium transition-colors ${pathname === n.to ? "text-primary" : "text-secondary-foreground hover:text-foreground"}`}>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <LanguageSwitcher />
          <Button variant="ghost" size="icon" className="relative h-9 w-9" onClick={() => setOpen(true)} aria-label="Cart">
            <ShoppingBag className="h-[18px] w-[18px]" />
            {count > 0 && (
              <span className="absolute -top-0.5 -end-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{count}</span>
            )}
          </Button>
          <Link to={user ? "/profile" : "/auth"} className="hidden sm:block">
            <Button variant="ghost" size="icon" className="h-9 w-9"><UserIcon className="h-[18px] w-[18px]" /></Button>
          </Link>
          <Link to="/services" className="hidden md:block">
            <Button size="sm" className="btn-gold h-9 px-4 text-[13px]">{t("book_appointment")}</Button>
          </Link>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-9 w-9"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="end" className="w-[280px] p-0 bg-background">
              <div className="flex items-center justify-between border-b px-5 h-14">
                <span className="font-display text-lg">Najla</span>
                <Button variant="ghost" size="icon" onClick={() => setMenuOpen(false)}><X className="h-5 w-5" /></Button>
              </div>
              <nav className="flex flex-col p-5 gap-1">
                {nav.map((n) => (
                  <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)} className={`rounded-md px-3 py-2.5 text-sm font-medium ${pathname === n.to ? "bg-surface text-primary" : "text-foreground hover:bg-surface"}`}>
                    {n.label}
                  </Link>
                ))}
                <div className="mt-3 border-t pt-3 flex flex-col gap-2">
                  <Link to={user ? "/profile" : "/auth"} onClick={() => setMenuOpen(false)}>
                    <Button variant="outline" className="w-full">{user ? t("account") : t("sign_in")}</Button>
                  </Link>
                  <Link to="/services" onClick={() => setMenuOpen(false)}>
                    <Button className="btn-gold w-full">{t("book_appointment")}</Button>
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
