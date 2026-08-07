import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAdminCustomers, getAdminCustomerDetail } from "@/api/admin/customers";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Reveal, StaggerGrid } from "@/components/ScrollReveal";
import {
  Users,
  Search,
  Eye,
  Loader2,
  Mail,
  Phone,
  CalendarDays,
  ShoppingCart,
  Heart,
  BadgeCheck,
  ShieldQuestion,
  Crown,
  Wallet,
  UserPlus,
  Sparkles,
  Package,
  ChevronDown,
  Truck,
} from "lucide-react";

export const Route = createFileRoute("/admin/customers")({
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: ["admin-customers"],
        queryFn: () => getAdminCustomers(),
      });
    } catch {
      // handled by AdminLayout's redirect
    }
  },
  pendingComponent: () => (
    <div className="min-h-[40vh] grid place-items-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
  component: Page,
});

const orderStatusColor: Record<string, string> = {
  pending: "bg-gold-deep/10 text-gold-deep border-gold-deep/20",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  preparing: "bg-terracotta-soft text-terracotta border-terracotta/20",
  completed: "bg-sage-soft text-sage border-sage/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};
const orderStatusDot: Record<string, string> = {
  pending: "bg-gold-deep",
  confirmed: "bg-primary",
  preparing: "bg-terracotta",
  completed: "bg-sage",
  cancelled: "bg-destructive",
};

const ROLE_FILTERS = ["all", "customer", "admin"] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number];

const SORTS = ["newest", "oldest", "most_orders", "highest_value", "recent_activity"] as const;
type Sort = (typeof SORTS)[number];

function currency(n: number): string {
  return `₪${n.toLocaleString("en", { maximumFractionDigits: 0 })}`;
}

function Page() {
  const { lang } = useI18n();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);
  const locale = lang === "ar" ? "ar" : lang === "en" ? "en-US" : "he-IL";

  const [view, setView] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sort, setSort] = useState<Sort>("newest");

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: () => getAdminCustomers(),
  });

  const roleCounts = ROLE_FILTERS.reduce<Record<string, number>>((acc, r) => {
    acc[r] = r === "all" ? customers.length : customers.filter((c) => c.role === r).length;
    return acc;
  }, {});

  const roleFiltered =
    roleFilter === "all" ? customers : customers.filter((c) => c.role === roleFilter);

  const searched = roleFiltered.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.full_name ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q)
    );
  });

  const sorted = useMemo(() => {
    const list = [...searched];
    switch (sort) {
      case "oldest":
        return list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      case "most_orders":
        return list.sort((a, b) => b.orderCount - a.orderCount);
      case "highest_value":
        return list.sort((a, b) => b.lifetimeValue - a.lifetimeValue);
      case "recent_activity":
        return list.sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
      case "newest":
      default:
        return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  }, [searched, sort]);

  const sortLabel: Record<Sort, string> = {
    newest: L("הצטרפו לאחרונה", "الأحدث انضماماً", "Newest signups"),
    oldest: L("הצטרפו ראשונים", "الأقدم انضماماً", "Oldest signups"),
    most_orders: L("הכי הרבה הזמנות", "الأكثر طلبات", "Most orders"),
    highest_value: L("ערך גבוה ביותר", "أعلى قيمة", "Highest value"),
    recent_activity: L("פעילות אחרונה", "أحدث نشاط", "Recent activity"),
  };

  const roleFilterLabel: Record<RoleFilter, string> = {
    all: L("הכל", "الكل", "All"),
    customer: L("לקוחות", "عملاء", "Customers"),
    admin: L("מנהלים", "مدراء", "Admins"),
  };

  const now = new Date();
  const newThisMonth = customers.filter((c) => {
    const d = new Date(c.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const verifiedCount = customers.filter((c) => c.email_verified).length;
  const verifiedPct =
    customers.length > 0 ? Math.round((verifiedCount / customers.length) * 100) : 0;
  const totalLifetimeValue = customers.reduce((s, c) => s + c.lifetimeValue, 0);

  const stats = [
    {
      icon: <Users className="h-5 w-5" />,
      label: L("סה״כ לקוחות", "إجمالي العملاء", "Total Customers"),
      value: String(customers.length),
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      icon: <UserPlus className="h-5 w-5" />,
      label: L("חדשים החודש", "جدد هذا الشهر", "New This Month"),
      value: String(newThisMonth),
      iconBg: "bg-terracotta-soft",
      iconColor: "text-terracotta",
    },
    {
      icon: <BadgeCheck className="h-5 w-5" />,
      label: L("אימייל מאומת", "بريد إلكتروني موثق", "Email Verified"),
      value: `${verifiedPct}%`,
      iconBg: "bg-sage-soft",
      iconColor: "text-sage",
    },
    {
      icon: <Wallet className="h-5 w-5" />,
      label: L("ערך לקוחות כולל", "إجمالي قيمة العملاء", "Total Lifetime Value"),
      value: currency(totalLifetimeValue),
      iconBg: "bg-gold-deep/10",
      iconColor: "text-gold-deep",
    },
  ];

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["admin-customer-detail", view],
    enabled: !!view,
    queryFn: () => getAdminCustomerDetail({ data: { userId: view! } }),
  });

  const viewedCustomer = customers.find((c) => c.id === view);

  return (
    <div className="space-y-5">
      {/* Header */}
      <Reveal direction="up">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] sm:text-[30px] text-foreground">
              {L("לקוחות", "العملاء", "Customers")}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {sorted.length === customers.length
                ? L(
                    `${customers.length} לקוחות רשומים`,
                    `${customers.length} عملاء مسجلين`,
                    `${customers.length} registered customers`,
                  )
                : L(
                    `${sorted.length} מתוך ${customers.length} לקוחות`,
                    `${sorted.length} من ${customers.length} عملاء`,
                    `${sorted.length} of ${customers.length} customers`,
                  )}
            </p>
          </div>
        </div>
      </Reveal>

      {/* Stat cards */}
      <StaggerGrid className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl bg-card p-4 sm:p-5 border border-border/10"
            style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
          >
            <div
              className={`grid h-10 w-10 sm:h-11 sm:w-11 place-items-center rounded-xl ${s.iconBg} ${s.iconColor}`}
            >
              {s.icon}
            </div>
            <div className="mt-4">
              <div className="font-display text-[24px] sm:text-[28px] text-foreground leading-none">
                {isLoading ? (
                  <span className="inline-block h-6 w-12 rounded-md bg-surface animate-pulse" />
                ) : (
                  s.value
                )}
              </div>
              <div className="text-[12px] text-muted-foreground mt-1.5 font-medium">{s.label}</div>
            </div>
          </div>
        ))}
      </StaggerGrid>

      {/* Role tabs */}
      <Reveal direction="up" delay={1}>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {ROLE_FILTERS.map((rf) => (
            <button
              key={rf}
              onClick={() => setRoleFilter(rf)}
              aria-pressed={roleFilter === rf}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap transition-colors ${
                roleFilter === rf
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-muted-foreground hover:bg-surface-2"
              }`}
            >
              {roleFilterLabel[rf]}
              <span
                className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold ${
                  roleFilter === rf
                    ? "bg-background/20 text-primary-foreground"
                    : "bg-surface-3 text-muted-foreground"
                }`}
              >
                {roleCounts[rf]}
              </span>
            </button>
          ))}
        </div>
      </Reveal>

      {/* Search + sort */}
      <Reveal direction="up" delay={2}>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={L("חיפוש לקוחה...", "بحث عن عميلة...", "Search customers...")}
              className="w-full h-10 ps-10 pe-4 rounded-xl bg-card border border-border/20 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-10 w-full sm:w-[190px] rounded-xl border-border/30 text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s} value={s}>
                  {sortLabel[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Reveal>

      {/* Table */}
      <Reveal direction="up" delay={3}>
        <div
          className="rounded-2xl bg-card overflow-hidden border border-border/10"
          style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                {L("רשימת לקוחות", "قائمة العملاء", "Customers list")}
              </caption>
              <thead>
                <tr className="bg-surface/60 border-b border-border/15">
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    {L("לקוחה", "العميلة", "Customer")}
                  </th>
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden md:table-cell"
                  >
                    {L("טלפון", "الهاتف", "Phone")}
                  </th>
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden sm:table-cell"
                  >
                    {L("הצטרפו", "الانضمام", "Joined")}
                  </th>
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    {L("הזמנות", "الطلبات", "Orders")}
                  </th>
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden lg:table-cell"
                  >
                    {L("תורים", "المواعيد", "Appts")}
                  </th>
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    {L("ערך", "القيمة", "Value")}
                  </th>
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden xl:table-cell"
                  >
                    {L("סטטוס", "الحالة", "Status")}
                  </th>
                  <th scope="col" className="text-end p-3.5 w-[80px]">
                    <span className="sr-only">{L("פעולות", "الإجراءات", "Actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40 mx-auto" />
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  sorted.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-border/10 hover:bg-surface/30 transition-colors"
                    >
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-surface text-[11px] font-semibold text-foreground shrink-0 overflow-hidden">
                            {c.avatar_url ? (
                              <img
                                src={c.avatar_url}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              (c.full_name ?? c.email ?? "?")[0]?.toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate max-w-[160px]">
                              {c.full_name || L("ללא שם", "بدون اسم", "No name")}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                              {c.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td
                        className="p-3.5 text-muted-foreground text-[12px] hidden md:table-cell"
                        dir="ltr"
                      >
                        {c.phone || "—"}
                      </td>
                      <td className="p-3.5 text-muted-foreground text-[12px] hidden sm:table-cell">
                        {new Date(c.created_at).toLocaleDateString(locale)}
                      </td>
                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                          <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
                          {c.orderCount}
                        </span>
                      </td>
                      <td className="p-3.5 hidden lg:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                          {c.appointmentCount}
                        </span>
                      </td>
                      <td className="p-3.5 font-semibold text-[13px]">
                        {currency(c.lifetimeValue)}
                      </td>
                      <td className="p-3.5 hidden xl:table-cell">
                        <div className="flex items-center gap-1.5">
                          {c.role === "admin" && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                              <Crown className="h-3 w-3" />
                              {L("מנהל", "مدير", "Admin")}
                            </span>
                          )}
                          {c.email_verified ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-sage-soft text-sage border border-sage/20">
                              <BadgeCheck className="h-3 w-3" />
                              {L("מאומת", "موثق", "Verified")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-surface text-muted-foreground border border-border/30">
                              <ShieldQuestion className="h-3 w-3" />
                              {L("לא מאומת", "غير موثق", "Unverified")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5 text-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setView(c.id);
                            setExpandedOrder(null);
                          }}
                          aria-label={`${L("צפייה", "عرض", "View")}: ${c.full_name ?? c.email}`}
                          className="h-8 w-8 rounded-lg hover:bg-surface"
                        >
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                {!isLoading && sorted.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <Users
                        className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3"
                        aria-hidden="true"
                      />
                      <div className="text-[14px] font-medium text-muted-foreground">
                        {search
                          ? L("לא נמצאו תוצאות", "لم يتم العثور على نتائج", "No results found")
                          : roleFilter !== "all"
                            ? L(
                                "אין לקוחות התואמים לסינון",
                                "لا يوجد عملاء مطابقون للتصفية",
                                "No customers match this filter",
                              )
                            : L(
                                "אין לקוחות רשומים עדיין",
                                "لا يوجد عملاء مسجلين بعد",
                                "No customers yet",
                              )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>

      {/* Customer detail dialog */}
      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent className="max-w-2xl rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {L("פרופיל לקוחה", "ملف العميلة", "Customer Profile")}
            </DialogTitle>
          </DialogHeader>

          {detailLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
            </div>
          )}

          {!detailLoading && detail && (
            <div className="space-y-6 mt-2">
              {/* Profile header */}
              <div className="flex items-start gap-4">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-surface text-[20px] font-semibold text-foreground shrink-0 overflow-hidden">
                  {detail.profile.avatar_url ? (
                    <img
                      src={detail.profile.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (detail.profile.full_name ?? detail.profile.email ?? "?")[0]?.toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display text-[19px] text-foreground">
                      {detail.profile.full_name || L("ללא שם", "بدون اسم", "No name")}
                    </h3>
                    {detail.profile.role === "admin" && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                        <Crown className="h-3 w-3" />
                        {L("מנהל", "مدير", "Admin")}
                      </span>
                    )}
                    {detail.profile.email_verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-sage-soft text-sage border border-sage/20">
                        <BadgeCheck className="h-3 w-3" />
                        {L("מאומת", "موثق", "Verified")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-surface text-muted-foreground border border-border/30">
                        <ShieldQuestion className="h-3 w-3" />
                        {L("לא מאומת", "غير موثق", "Unverified")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 space-y-0.5 text-[12px] text-muted-foreground">
                    {detail.profile.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" /> {detail.profile.email}
                      </div>
                    )}
                    {detail.profile.phone && (
                      <div className="flex items-center gap-1.5" dir="ltr">
                        <Phone className="h-3.5 w-3.5" /> {detail.profile.phone}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {L("הצטרפו ב-", "انضم في ", "Joined ")}
                      {new Date(detail.profile.created_at).toLocaleDateString(locale)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mini stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-surface/60 p-3 text-center">
                  <div className="font-display text-[20px] text-foreground">
                    {detail.orders.length}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mt-0.5">
                    {L("הזמנות", "طلبات", "Orders")}
                  </div>
                </div>
                <div className="rounded-xl bg-surface/60 p-3 text-center">
                  <div className="font-display text-[20px] text-foreground">
                    {detail.appointments.length}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mt-0.5">
                    {L("תורים", "مواعيد", "Appts")}
                  </div>
                </div>
                <div className="rounded-xl bg-surface/60 p-3 text-center">
                  <div className="font-display text-[20px] text-foreground">
                    {currency(viewedCustomer?.lifetimeValue ?? 0)}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mt-0.5">
                    {L("ערך כולל", "القيمة", "Value")}
                  </div>
                </div>
              </div>

              {/* Appointments */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <h4 className="text-[13px] font-bold uppercase tracking-[0.06em] text-foreground">
                    {L("תורים", "المواعيد", "Appointments")}
                  </h4>
                </div>
                {detail.appointments.length === 0 ? (
                  <div className="text-[12px] text-muted-foreground py-3 text-center bg-surface/40 rounded-xl">
                    {L("אין תורים", "لا مواعيد", "No appointments")}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/10 divide-y divide-border/10 overflow-hidden">
                    {detail.appointments.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-start justify-between gap-3 px-3.5 py-2.5 text-[12px]"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate">
                            {lang === "ar"
                              ? a.service?.name_ar || a.service?.name || a.service_name
                              : a.service?.name || a.service_name}
                          </div>
                          <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <CalendarDays className="h-3 w-3" />
                            {new Date(a.appointment_date).toLocaleDateString(locale)} ·{" "}
                            {String(a.appointment_time).slice(0, 5)}
                            {a.duration_minutes && (
                              <span>
                                · {a.duration_minutes} {L("דק׳", "د", "min")}
                              </span>
                            )}
                          </div>
                          {a.notes && (
                            <div className="text-muted-foreground/80 mt-1 text-[11px] italic truncate">
                              {L("הערה: ", "ملاحظة: ", "Note: ")}
                              {a.notes}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-semibold text-foreground">
                            {currency(Number(a.total_price))}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 ${orderStatusColor[a.status] ?? "bg-surface text-muted-foreground border-border/30"}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${orderStatusDot[a.status] ?? "bg-muted-foreground"}`}
                            />
                            {a.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Orders */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <ShoppingCart className="h-4 w-4 text-terracotta" />
                  <h4 className="text-[13px] font-bold uppercase tracking-[0.06em] text-foreground">
                    {L("הזמנות", "الطلبات", "Orders")}
                  </h4>
                </div>
                {detail.orders.length === 0 ? (
                  <div className="text-[12px] text-muted-foreground py-3 text-center bg-surface/40 rounded-xl">
                    {L("אין הזמנות", "لا طلبات", "No orders")}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/10 divide-y divide-border/10 overflow-hidden">
                    {detail.orders.map((o) => {
                      const isOpen = expandedOrder === o.id;
                      return (
                        <div key={o.id}>
                          <button
                            type="button"
                            onClick={() => setExpandedOrder(isOpen ? null : o.id)}
                            aria-expanded={isOpen}
                            className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-[12px] text-start hover:bg-surface/40 transition-colors"
                          >
                            <div className="min-w-0 flex items-center gap-2">
                              <ChevronDown
                                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <div className="font-medium text-foreground font-mono">
                                  #{o.order_number}
                                </div>
                                <div className="text-muted-foreground mt-0.5">
                                  {new Date(o.created_at).toLocaleDateString(locale)} ·{" "}
                                  {(o.order_items ?? []).length} {L("פריטים", "عناصر", "items")}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-semibold text-foreground">
                                {currency(Number(o.total))}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full border font-medium inline-flex items-center gap-1 ${orderStatusColor[o.status] ?? "bg-surface text-muted-foreground border-border/30"}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${orderStatusDot[o.status] ?? "bg-muted-foreground"}`}
                                />
                                {o.status}
                              </span>
                            </div>
                          </button>
                          {isOpen && (
                            <div className="px-3.5 pb-3.5 pt-1 bg-surface/30 border-t border-border/10 space-y-3">
                              {/* Line items */}
                              <div className="space-y-2">
                                {(o.order_items ?? []).map((it) => {
                                  const thumbSrc =
                                    it.products?.thumbnail_url || it.products?.image_url;
                                  return (
                                    <div key={it.id} className="flex items-center gap-3">
                                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface">
                                        {thumbSrc ? (
                                          <img
                                            src={thumbSrc}
                                            alt=""
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                          />
                                        ) : (
                                          <div className="h-full w-full grid place-items-center">
                                            <Package className="h-4 w-4 text-muted-foreground/30" />
                                          </div>
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-[12px] font-medium text-foreground truncate">
                                          {it.product_name}
                                        </div>
                                        <div className="text-[11px] text-muted-foreground">
                                          ₪{Number(it.unit_price).toFixed(2)} × {it.quantity}
                                        </div>
                                      </div>
                                      <span className="text-[12px] font-semibold text-foreground shrink-0">
                                        {currency(Number(it.total_price))}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Delivery + payment */}
                              <div className="pt-2 border-t border-border/10 space-y-1 text-[11px] text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                  <Truck className="h-3 w-3 shrink-0" />
                                  {o.delivery_method === "delivery"
                                    ? `${o.delivery_area_name ?? L("משלוח", "توصيل", "Delivery")} · ₪${Number(o.delivery_fee).toFixed(0)}${o.delivery_street ? ` · ${o.delivery_street}` : ""}`
                                    : L(
                                        "איסוף עצמי מהחנות",
                                        "استلام ذاتي من المتجر",
                                        "Pickup at store",
                                      )}
                                </div>
                                {o.payment_method && (
                                  <div className="flex items-center gap-1.5">
                                    <Wallet className="h-3 w-3 shrink-0" />
                                    {o.payment_method === "pay_at_store"
                                      ? L("תשלום בחנות", "الدفع في المتجر", "Pay at store")
                                      : o.payment_method}
                                  </div>
                                )}
                                {o.notes && (
                                  <div className="italic">
                                    {L("הערה: ", "ملاحظة: ", "Note: ")}
                                    {o.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Favorites */}
              {detail.favorites.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2.5">
                    <Heart className="h-4 w-4 text-destructive" />
                    <h4 className="text-[13px] font-bold uppercase tracking-[0.06em] text-foreground">
                      {L("מועדפים", "المفضلة", "Favorites")}
                    </h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detail.favorites.map((f) => (
                      <span
                        key={f.product_id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[11px] font-medium text-foreground"
                      >
                        <Package className="h-3 w-3 text-muted-foreground" />
                        {lang === "ar" ? f.products?.name_ar || f.products?.name : f.products?.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {detail.orders.length === 0 &&
                detail.appointments.length === 0 &&
                detail.favorites.length === 0 && (
                  <div className="flex flex-col items-center py-6 text-center">
                    <Sparkles className="h-8 w-8 text-muted-foreground/20 mb-2" />
                    <div className="text-[12px] text-muted-foreground">
                      {L(
                        "לקוחה חדשה ללא פעילות עדיין",
                        "عميلة جديدة بدون نشاط بعد",
                        "New customer, no activity yet",
                      )}
                    </div>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
