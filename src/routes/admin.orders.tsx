import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminOrders, getOrderItems, updateOrderStatus } from "@/api/orders/orders";
import { useI18n } from "@/lib/i18n";
import { getErrorMessage } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Reveal } from "@/components/ScrollReveal";
import { ShoppingCart, Search, Package, Eye, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/orders")({ component: Page });

const STATUSES = ["pending", "confirmed", "preparing", "completed", "cancelled"] as const;

const statusColor: Record<string, string> = {
  pending: "bg-gold-deep/10 text-gold-deep border-gold-deep/20",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  preparing: "bg-terracotta-soft text-terracotta border-terracotta/20",
  completed: "bg-sage-soft text-sage border-sage/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};
const statusDot: Record<string, string> = {
  pending: "bg-gold-deep",
  confirmed: "bg-primary",
  preparing: "bg-terracotta",
  completed: "bg-sage",
  cancelled: "bg-destructive",
};

const TIME_FILTERS = ["all", "today", "week", "month"] as const;
type TimeFilter = (typeof TIME_FILTERS)[number];

const STATUS_FILTERS = ["all", ...STATUSES] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// "YYYY-MM" — the unit the month picker operates on, distinct from the
// "week"/"today" rolling windows below.
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(key: string, lang: string): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  const locale = lang === "ar" ? "ar" : lang === "en" ? "en-US" : "he-IL";
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

// "today"/"week" stay rolling windows (useful for daily triage), but
// "month" is a specific calendar month the admin picks — not a rolling
// 30-day window — so past months can be browsed exactly.
function isWithinTimeFilter(createdAt: string, filter: TimeFilter, selectedMonth: string): boolean {
  if (filter === "all") return true;
  const created = new Date(createdAt);
  const now = new Date();
  if (filter === "today") return created.toDateString() === now.toDateString();
  if (filter === "week") {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 7);
    return created >= cutoff;
  }
  return monthKey(created) === selectedMonth;
}

function Page() {
  const { lang, t } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);
  const [view, setView] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => monthKey(new Date()));

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => getAdminOrders(),
  });

  // Every month that actually has an order, plus the currently-selected
  // one (so it's never missing from the dropdown even if it has 0 orders
  // yet, e.g. the current month right after a rollover).
  const availableMonths = useMemo(() => {
    const set = new Set<string>(orders.map((o) => monthKey(new Date(o.created_at))));
    set.add(selectedMonth);
    return Array.from(set).sort().reverse();
  }, [orders, selectedMonth]);

  // Time range narrows the pool first, so status tab counts reflect "how
  // many of THESE (e.g. this week's) orders are pending" rather than the
  // all-time total — the two filters are meant to combine, not compete.
  const timeFiltered = orders.filter((o) =>
    isWithinTimeFilter(o.created_at, timeFilter, selectedMonth),
  );

  const statusCounts = STATUS_FILTERS.reduce<Record<string, number>>((acc, s) => {
    acc[s] = s === "all" ? timeFiltered.length : timeFiltered.filter((o) => o.status === s).length;
    return acc;
  }, {});

  const statusFilteredOrders =
    statusFilter === "all" ? timeFiltered : timeFiltered.filter((o) => o.status === statusFilter);

  const filtered = statusFilteredOrders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (o.customer_name ?? "").toLowerCase().includes(q) ||
      String(o.order_number).includes(q) ||
      (o.customer_phone ?? "").includes(q)
    );
  });

  const timeFilterLabel: Record<TimeFilter, string> = {
    all: L("הכל", "الكل", "All Time"),
    today: L("היום", "اليوم", "Today"),
    week: L("השבוע", "هذا الأسبوع", "This Week"),
    month: L("חודש", "شهر", "Month"),
  };

  const statusFilterLabel: Record<StatusFilter, string> = {
    all: L("הכל", "الكل", "All"),
    pending: L("חדשות", "جديدة", "New"),
    confirmed: L("מאושרות", "مؤكدة", "Confirmed"),
    preparing: L("בהכנה", "قيد التحضير", "Preparing"),
    completed: L("הושלמו", "مكتملة", "Completed"),
    cancelled: L("בוטלו", "ملغاة", "Cancelled"),
  };

  const { data: items = [] } = useQuery({
    queryKey: ["admin-order-items", view],
    enabled: !!view,
    queryFn: () => getOrderItems({ data: { orderId: view! } }),
  });

  const setStatus = async (id: string, status: string) => {
    try {
      await updateOrderStatus({ data: { id, status } });
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
  };

  const viewOrder = orders.find((o) => o.id === view);

  return (
    <div className="space-y-5">
      {/* Header */}
      <Reveal direction="up">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] sm:text-[30px] text-foreground">
              {L("הזמנות", "الطلبات", "Orders")}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {filtered.length === orders.length
                ? L(`${orders.length} הזמנות`, `${orders.length} طلبات`, `${orders.length} orders`)
                : L(
                    `${filtered.length} מתוך ${orders.length} הזמנות`,
                    `${filtered.length} من ${orders.length} طلبات`,
                    `${filtered.length} of ${orders.length} orders`,
                  )}
            </p>
          </div>
        </div>
      </Reveal>

      {/* Time range tabs */}
      <Reveal direction="up" delay={1}>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TIME_FILTERS.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeFilter(tf)}
              className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap transition-colors ${
                timeFilter === tf
                  ? "bg-foreground text-background"
                  : "bg-surface text-muted-foreground hover:bg-surface-2"
              }`}
            >
              {timeFilterLabel[tf]}
            </button>
          ))}
        </div>
        {timeFilter === "month" && (
          <div className="mt-2.5">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-9 w-[180px] rounded-full border-border/30 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatMonthLabel(m, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </Reveal>

      {/* Status tabs */}
      <Reveal direction="up" delay={2}>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((sf) => (
            <button
              key={sf}
              onClick={() => setStatusFilter(sf)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap transition-colors ${
                statusFilter === sf
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-muted-foreground hover:bg-surface-2"
              }`}
            >
              {sf !== "all" && <span className={`h-1.5 w-1.5 rounded-full ${statusDot[sf]}`} />}
              {statusFilterLabel[sf]}
              <span
                className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold ${
                  statusFilter === sf
                    ? "bg-background/20 text-primary-foreground"
                    : "bg-surface-3 text-muted-foreground"
                }`}
              >
                {statusCounts[sf]}
              </span>
            </button>
          ))}
        </div>
      </Reveal>

      {/* Search */}
      <Reveal direction="up" delay={3}>
        <div className="relative">
          <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={L("חיפוש הזמנה...", "بحث عن طلب...", "Search orders...")}
            className="w-full sm:w-80 h-10 ps-10 pe-4 rounded-xl bg-card border border-border/20 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          />
        </div>
      </Reveal>

      {/* Table */}
      <Reveal direction="up" delay={4}>
        <div
          className="rounded-2xl bg-card overflow-hidden border border-border/10"
          style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                {L("רשימת הזמנות", "قائمة الطلبات", "Orders list")}
              </caption>
              <thead>
                <tr className="bg-surface/60 border-b border-border/15">
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    <span aria-hidden="true">#</span>
                    <span className="sr-only">{L("מספר הזמנה", "رقم الطلب", "Order number")}</span>
                  </th>
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden sm:table-cell"
                  >
                    {L("תאריך", "التاريخ", "Date")}
                  </th>
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
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                  >
                    {L("סך הכל", "المجموع", "Total")}
                  </th>
                  <th
                    scope="col"
                    className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
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
                    <td colSpan={7} className="py-16 text-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40 mx-auto" />
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  filtered.map((o) => (
                    <tr
                      key={o.id}
                      className="border-t border-border/10 hover:bg-surface/30 transition-colors"
                    >
                      <td className="p-3.5">
                        <span className="text-[12px] font-mono font-semibold text-primary bg-cream px-2 py-0.5 rounded">
                          {o.order_number}
                        </span>
                      </td>
                      <td className="p-3.5 text-muted-foreground text-[12px] hidden sm:table-cell">
                        {new Date(o.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-surface text-[11px] font-semibold text-foreground shrink-0">
                            {(o.customer_name ?? "?")[0]}
                          </div>
                          <span className="font-medium text-foreground">{o.customer_name}</span>
                        </div>
                      </td>
                      <td
                        className="p-3.5 text-muted-foreground text-[12px] hidden md:table-cell"
                        dir="ltr"
                      >
                        {o.customer_phone}
                      </td>
                      <td className="p-3.5 font-semibold">₪{Number(o.total).toFixed(0)}</td>
                      <td className="p-3.5">
                        {/* Every status is always selectable, including from completed/cancelled —
                          this is an admin-only correction tool (e.g. undoing an accidental
                          "completed" click), not a customer-facing flow, so there's no
                          terminal-state restriction here or on the server. */}
                        <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
                          <SelectTrigger
                            aria-label={`${t("orders")} #${o.order_number}: ${L("סטטוס", "الحالة", "Status")}`}
                            className={`h-8 w-[130px] rounded-full border text-[11px] font-medium gap-1.5 ${statusColor[o.status] ?? "bg-surface text-muted-foreground border-border/30"}`}
                          >
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot[o.status] ?? "bg-muted-foreground"}`}
                            />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                <span className="flex items-center gap-2">
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${statusDot[s]}`}
                                    aria-hidden="true"
                                  />
                                  {t(`status_${s}`)}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3.5 text-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setView(o.id)}
                          aria-label={`${t("view")}: ${o.customer_name}, #${o.order_number}`}
                          className="h-8 w-8 rounded-lg hover:bg-surface"
                        >
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <ShoppingCart
                        className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3"
                        aria-hidden="true"
                      />
                      <div className="text-[14px] font-medium text-muted-foreground">
                        {search
                          ? L("לא נמצאו תוצאות", "لم يتم العثور على نتائج", "No results found")
                          : statusFilter !== "all" || timeFilter !== "all"
                            ? L(
                                "אין הזמנות התואמות לסינון",
                                "لا توجد طلبات مطابقة للتصفية",
                                "No orders match this filter",
                              )
                            : L("אין הזמנות עדיין", "لا طلبات بعد", "No orders yet")}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>

      {/* Order items dialog */}
      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              {L("פריטי הזמנה", "عناصر الطلب", "Order Items")}
              {viewOrder && (
                <span className="text-[12px] font-mono font-normal text-primary bg-cream px-2 py-0.5 rounded">
                  #{viewOrder.order_number}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-3 space-y-0">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between py-3 border-b border-border/10 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-surface shrink-0">
                    <Package className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-foreground">{it.product_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {L("כמות", "الكمية", "Qty")}: {it.quantity}
                    </div>
                  </div>
                </div>
                <span className="text-[14px] font-semibold text-foreground">
                  ₪{Number(it.total_price).toFixed(0)}
                </span>
              </div>
            ))}
            {items.length === 0 && (
              <div className="flex flex-col items-center py-8 text-center">
                <Package className="h-8 w-8 text-muted-foreground/20 mb-2" />
                <div className="text-[13px] text-muted-foreground">
                  {L("אין פריטים", "لا عناصر", "No items")}
                </div>
              </div>
            )}
          </div>
          {items.length > 0 && viewOrder && (
            <div className="flex items-center justify-between pt-3 border-t border-border/20 mt-2">
              <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {L("סך הכל", "المجموع", "Total")}
              </span>
              <span className="text-[18px] font-display font-semibold text-foreground">
                ₪{Number(viewOrder.total).toFixed(0)}
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
