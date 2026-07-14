import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { getAdminOverview } from "@/api/admin/overview";
import { getAdminServices } from "@/api/services/services";
import { getAdminProducts } from "@/api/products/products";
import { getAdminAppointments } from "@/api/appointments/appointments";
import { getAvailabilitySettings } from "@/api/slots/slots";
import { getAdminOrders } from "@/api/orders/orders";
import { getAdminDeliveryAreas } from "@/api/delivery-areas/delivery-areas";
import { getSettings } from "@/api/settings/settings";
import {
  LayoutDashboard,
  Scissors,
  Package,
  CalendarDays,
  Clock,
  ShoppingCart,
  Truck,
  Settings,
  Menu,
  LogOut,
  ChevronLeft,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — Najla Cosmetics" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const { user, isAdmin, loading } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (!isAdmin) navigate({ to: "/" });
  }, [user, isAdmin, loading, navigate]);

  // Warms every tab's query cache as soon as the admin check resolves, so
  // clicking a sidebar link almost always finds the data already cached
  // instead of mounting empty and fetching from scratch — that gap between
  // "renders with no data yet" and "the query resolves" is what showed each
  // screen's empty state (e.g. "0 services") for a beat on every navigation.
  useEffect(() => {
    if (loading || !user || !isAdmin) return;
    qc.prefetchQuery({ queryKey: ["admin-overview"], queryFn: () => getAdminOverview() });
    qc.prefetchQuery({ queryKey: ["admin-services"], queryFn: () => getAdminServices() });
    qc.prefetchQuery({ queryKey: ["admin-products"], queryFn: () => getAdminProducts() });
    qc.prefetchQuery({ queryKey: ["admin-appointments"], queryFn: () => getAdminAppointments() });
    qc.prefetchQuery({
      queryKey: ["availability-settings"],
      queryFn: () => getAvailabilitySettings(),
    });
    qc.prefetchQuery({ queryKey: ["admin-orders"], queryFn: () => getAdminOrders() });
    qc.prefetchQuery({
      queryKey: ["admin-delivery-areas"],
      queryFn: () => getAdminDeliveryAreas(),
    });
    qc.prefetchQuery({ queryKey: ["admin-settings"], queryFn: () => getSettings() });
  }, [loading, user, isAdmin, qc]);

  if (loading || !user || !isAdmin) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);

  const items = [
    { to: "/admin", icon: LayoutDashboard, label: L("סקירה", "نظرة عامة", "Overview") },
    { to: "/admin/services", icon: Scissors, label: L("שירותים", "الخدمات", "Services") },
    { to: "/admin/products", icon: Package, label: L("מוצרים", "المنتجات", "Products") },
    {
      to: "/admin/appointments",
      icon: CalendarDays,
      label: L("תורים", "المواعيد", "Appointments"),
    },
    { to: "/admin/slots", icon: Clock, label: L("זמינות", "التوفر", "Availability") },
    { to: "/admin/orders", icon: ShoppingCart, label: L("הזמנות", "الطلبات", "Orders") },
    {
      to: "/admin/delivery-areas",
      icon: Truck,
      label: L("אזורי משלוח", "مناطق التوصيل", "Delivery Areas"),
    },
    { to: "/admin/settings", icon: Settings, label: L("הגדרות", "الإعدادات", "Settings") },
  ];

  const currentPage = items.find(
    (it) => pathname === it.to || (it.to !== "/admin" && pathname.startsWith(it.to)),
  );

  const initials = (user.email ?? "A").slice(0, 2).toUpperCase();

  const NavContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 pt-6 pb-4">
        <div className="font-display text-lg italic text-foreground tracking-tight">Najla</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mt-0.5">
          {L("לוח בקרה", "لوحة التحكم", "Dashboard")}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-border/40" />

      {/* Nav links */}
      <nav
        className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto"
        aria-label={L("תפריט ניהול", "قائمة الإدارة", "Admin navigation")}
      >
        <div className="px-2 pb-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
            {L("תפריט", "القائمة", "Menu")}
          </span>
        </div>
        {items.map((it) => {
          const active = pathname === it.to || (it.to !== "/admin" && pathname.startsWith(it.to));
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`
                group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-all relative
                ${
                  active
                    ? "bg-cream text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:bg-surface hover:text-foreground"
                }
              `}
            >
              <div
                aria-hidden="true"
                className={`
                grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors
                ${active ? "bg-primary/10 text-primary" : "bg-transparent text-muted-foreground group-hover:bg-surface-2 group-hover:text-foreground"}
              `}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span>{it.label}</span>
              {active && (
                <div className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="mt-auto border-t border-border/30">
        <div className="px-4 py-4 flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-cream text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium text-foreground truncate">{user.email}</div>
            <div className="text-[10px] text-muted-foreground">{L("מנהל", "مدير", "Admin")}</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-5rem)]">
      {/* Mobile header bar */}
      <div className="md:hidden sticky top-20 z-30 bg-background/95 backdrop-blur-md border-b border-border/30">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label={L("תפריט ניהול", "قائمة الإدارة", "Admin menu")}
            className="grid h-10 w-10 place-items-center rounded-xl bg-surface hover:bg-surface-2 transition-colors"
          >
            <Menu className="h-5 w-5 text-foreground" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            {currentPage && (
              <>
                <currentPage.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                <span className="text-[13px] font-medium">{currentPage.label}</span>
              </>
            )}
          </div>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-cream text-primary text-[10px] font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side={lang === "en" ? "left" : "right"} className="w-[280px] p-0">
          <SheetTitle className="sr-only">
            {L("תפריט ניהול", "قائمة الإدارة", "Admin Menu")}
          </SheetTitle>
          <NavContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop layout */}
      <div className="max-w-[1500px] mx-auto">
        <div className="grid md:grid-cols-[260px_1fr]">
          {/* Desktop sidebar */}
          <aside className="hidden md:block">
            <div className="sticky top-24 h-[calc(100vh-7rem)]">
              <div
                className="h-full mx-4 my-3 rounded-2xl bg-card border border-border/20 overflow-hidden flex flex-col"
                style={{ boxShadow: "0 8px 30px -12px rgba(45, 45, 45, 0.08)" }}
              >
                <NavContent />
              </div>
            </div>
          </aside>

          {/* Main content */}
          <section className="min-w-0 px-4 sm:px-6 md:px-8 py-6 md:py-8">
            {/* Breadcrumb */}
            <div className="hidden md:flex items-center gap-2 mb-6 animate-[fadeSlideUp_0.6s_0.1s_both]">
              <Link
                to="/"
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="h-3 w-3" aria-hidden="true" />
                {L("אתר", "الموقع", "Site")}
              </Link>
              <span className="text-border">/</span>
              <span className="text-[11px] font-medium text-foreground">
                {currentPage?.label ?? L("ניהול", "الإدارة", "Admin")}
              </span>
            </div>
            <div className="animate-[fadeSlideUp_0.6s_0.15s_both]">
              <Outlet />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
