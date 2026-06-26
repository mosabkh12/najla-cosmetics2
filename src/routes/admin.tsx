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
    return <div className="container-page py-16 text-center text-sm text-secondary-foreground">…</div>;
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
    <div className="container-page py-6">
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside className="md:sticky md:top-20 md:self-start">
          <div className="rounded-2xl border border-border/60 bg-card p-2 soft-shadow">
            <div className="px-3 py-2">
              <div className="font-display text-base text-foreground">{L("ניהול", "الإدارة", "Admin")}</div>
              <div className="text-[11px] text-secondary-foreground">Najla Cosmetics</div>
            </div>
            <nav className="flex flex-col gap-0.5 mt-1">
              {items.map((it) => {
                const active = pathname === it.to || (it.to !== "/admin" && pathname.startsWith(it.to));
                const Icon = it.icon;
                return (
                  <Link key={it.to} to={it.to} className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors ${active ? "bg-surface text-primary font-medium" : "text-foreground hover:bg-surface"}`}>
                    <Icon className="h-4 w-4" />
                    <span>{it.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </aside>
        <section className="min-w-0">
          <Outlet />
        </section>
      </div>
    </div>
  );
}
