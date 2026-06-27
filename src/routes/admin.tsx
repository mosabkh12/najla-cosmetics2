import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { LayoutDashboard, Scissors, Package, CalendarDays, Clock, ShoppingCart, Settings } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Najla Cosmetics" }, { name: "robots", content: "noindex" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { user, isAdmin, loading } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (!isAdmin) navigate({ to: "/" });
  }, [user, isAdmin, loading, navigate]);

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
    { to: "/admin/appointments", icon: CalendarDays, label: L("תורים", "المواعيد", "Appointments") },
    { to: "/admin/slots", icon: Clock, label: L("חלונות זמן", "أوقات الحجز", "Slots") },
    { to: "/admin/orders", icon: ShoppingCart, label: L("הזמנות", "الطلبات", "Orders") },
    { to: "/admin/settings", icon: Settings, label: L("הגדרות", "الإعدادات", "Settings") },
  ];

  return (
    <div className="px-5 sm:px-10 md:px-20 max-w-[1400px] mx-auto py-6">
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-24 md:self-start animate-[fadeSlideUp_0.6s_0.1s_both]">
          <div className="rounded-2xl bg-card p-2"
            style={{ boxShadow: "0 10px 30px -10px rgba(45, 45, 45, 0.06)" }}
          >
            <div className="px-3 py-3">
              <div className="font-display text-base italic text-foreground">{L("ניהול", "الإدارة", "Admin")}</div>
              <div className="text-[11px] text-muted-foreground">Najla Cosmetics</div>
            </div>
            <nav className="flex flex-col gap-0.5 mt-1">
              {items.map((it) => {
                const active = pathname === it.to || (it.to !== "/admin" && pathname.startsWith(it.to));
                const Icon = it.icon;
                return (
                  <Link key={it.to} to={it.to} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] transition-all ${active ? "bg-surface text-foreground font-medium" : "text-muted-foreground hover:bg-surface/50 hover:text-foreground"}`}>
                    <Icon className="h-4 w-4" />
                    <span>{it.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>
        <section className="min-w-0 animate-[fadeSlideUp_0.6s_0.2s_both]">
          <Outlet />
        </section>
      </div>
    </div>
  );
}
