import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminAppointments,
  updateAppointmentStatus,
  deleteAppointmentsAdmin,
  retryGoogleCalendarSync,
  resyncCompletedGoogleEvents,
} from "@/api/appointments/appointments";
import type { AdminAppointmentRow } from "@/lib/api-types";
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
import { toast } from "sonner";
import { Reveal } from "@/components/ScrollReveal";
import {
  CalendarDays,
  Search,
  Clock,
  Trash2,
  CloudCheck,
  CloudAlert,
  CloudOff,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { jerusalemTodayStr } from "@/lib/jerusalem-time";

export const Route = createFileRoute("/admin/appointments")({ component: Page });

// Bookings are created directly as 'confirmed' — there's no approval step,
// so 'pending' is never offered as something to filter by or set by hand.
// 'confirmed' IS offered despite that: it's the only way back if an
// appointment gets marked completed/cancelled by mistake.
const SELECTABLE_STATUSES = ["confirmed", "completed", "cancelled"] as const;

const statusColor: Record<string, string> = {
  pending: "bg-gold-deep/10 text-gold-deep border-gold-deep/20",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-sage-soft text-sage border-sage/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};
const statusDot: Record<string, string> = {
  pending: "bg-gold-deep",
  confirmed: "bg-primary",
  completed: "bg-sage",
  cancelled: "bg-destructive",
};

const TIME_FILTERS = ["today", "week", "month", "all"] as const;
type TimeFilter = (typeof TIME_FILTERS)[number];

const STATUS_FILTERS = ["all", ...SELECTABLE_STATUSES] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

// Both dateStr and fromStr are plain "YYYY-MM-DD" values (never
// timezone-aware timestamps) — diffing them as UTC-midnight instants
// avoids any local-timezone shift that constructing a plain `new
// Date(dateStr)` could introduce.
function daysBetweenDateStrings(dateStr: string, fromStr: string): number {
  const [y1, m1, d1] = dateStr.split("-").map(Number);
  const [y2, m2, d2] = fromStr.split("-").map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
}

// A schedule is inherently forward-looking — "this week" for an admin
// means "what's coming up in the next 7 days", not "what happened in the
// past 7 days" (the convention used for order history). "All" still
// includes past appointments too, so nothing is ever hidden permanently.
// "month" is the exception: it's a specific calendar month the admin
// picks (can be a past month too), not a rolling forward window.
function isWithinTimeFilter(
  dateStr: string,
  filter: TimeFilter,
  todayStr: string,
  selectedMonth: string,
): boolean {
  if (filter === "all") return true;
  if (filter === "month") return dateStr.slice(0, 7) === selectedMonth;
  const diff = daysBetweenDateStrings(dateStr, todayStr);
  if (filter === "today") return diff === 0;
  return diff >= 0 && diff < 7;
}

function formatMonthLabel(key: string, lang: string): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  const locale = lang === "ar" ? "ar" : lang === "en" ? "en-US" : "he-IL";
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

function Page() {
  const { lang, t } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);
  const [search, setSearch] = useState("");
  // Defaults to "today" — the most common question for a service business
  // admin opening this page is "who am I seeing today", not a full history dump.
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("today");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // A busy day's full table used to always render in full, pushing every
  // other date group off-screen — collapsed to a short preview by default,
  // per-day, expandable on demand instead.
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const MAX_VISIBLE_PER_DAY = 3;
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [resyncingCompleted, setResyncingCompleted] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-appointments"],
    queryFn: () => getAdminAppointments(),
  });

  const todayStr = jerusalemTodayStr();
  const [selectedMonth, setSelectedMonth] = useState<string>(() => todayStr.slice(0, 7));

  // Every month that actually has an appointment, plus the currently
  // selected one (so it's never missing from the dropdown even if it has
  // 0 appointments yet, e.g. the current month right after a rollover).
  const availableMonths = useMemo(() => {
    const set = new Set<string>(rows.map((a) => a.appointment_date.slice(0, 7)));
    set.add(selectedMonth);
    return Array.from(set).sort().reverse();
  }, [rows, selectedMonth]);

  const timeFiltered = rows.filter((a) =>
    isWithinTimeFilter(a.appointment_date, timeFilter, todayStr, selectedMonth),
  );

  const statusCounts = STATUS_FILTERS.reduce<Record<string, number>>((acc, s) => {
    acc[s] = s === "all" ? timeFiltered.length : timeFiltered.filter((a) => a.status === s).length;
    return acc;
  }, {});

  const statusFilteredRows =
    statusFilter === "all" ? timeFiltered : timeFiltered.filter((a) => a.status === statusFilter);

  const filtered = statusFilteredRows.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (a.customer_name ?? "").toLowerCase().includes(q) ||
      (a.customer_phone ?? "").includes(q) ||
      (a.appointment_date ?? "").includes(q)
    );
  });

  // Soonest first — a schedule reads better chronologically than newest-created-first.
  const sorted = [...filtered].sort((a, b) => {
    const d = a.appointment_date.localeCompare(b.appointment_date);
    return d !== 0 ? d : String(a.appointment_time).localeCompare(String(b.appointment_time));
  });

  const groups: { date: string; items: AdminAppointmentRow[] }[] = [];
  for (const a of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.date === a.appointment_date) last.items.push(a);
    else groups.push({ date: a.appointment_date, items: [a] });
  }

  const setStatus = async (id: string, status: string) => {
    try {
      await updateAppointmentStatus({ data: { id, status } });
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-appointments"] });
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
  };

  // Shared by the single-row trash icon, "delete all cancelled", and a
  // date group's own delete button — always confirms first (this is
  // permanent, unlike a status change) and always shows how many rows
  // are about to go, since "delete this day" can silently take out more
  // than the admin expects if a filter is also narrowing what's visible.
  const deleteIds = async (ids: string[], confirmMessage: string) => {
    if (ids.length === 0) return;
    if (!confirm(confirmMessage)) return;
    try {
      await deleteAppointmentsAdmin({ data: { ids } });
      toast.success(
        L(
          `${ids.length} תורים נמחקו`,
          `تم حذف ${ids.length} موعدًا`,
          `${ids.length} appointment(s) deleted`,
        ),
      );
      qc.invalidateQueries({ queryKey: ["admin-appointments"] });
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
  };

  // Manual fallback for the fire-and-forget sync that already ran after
  // create/reschedule/status-change/cancel — lets the admin retry a
  // failed sync (e.g. a transient Google API outage) without needing to
  // touch the appointment itself again. The server call never throws (a
  // Google failure is recorded on the row, not surfaced as an error), so
  // the resulting badge is read from the refetched row, not this call.
  const retrySync = async (id: string) => {
    setSyncingIds((prev) => new Set(prev).add(id));
    try {
      await retryGoogleCalendarSync({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["admin-appointments"] });
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // Bulk fallback for completed appointments whose Google event was synced
  // before the checkmark/neutral-color styling existed — pushes the
  // current style to all of them without retrying each row by hand.
  const resyncCompleted = async () => {
    setResyncingCompleted(true);
    try {
      const { count } = await resyncCompletedGoogleEvents();
      toast.success(
        L(
          `${count} תורים סונכרנו מחדש`,
          `تمت إعادة مزامنة ${count} موعدًا`,
          `Resynced ${count} completed appointment(s)`,
        ),
      );
      qc.invalidateQueries({ queryKey: ["admin-appointments"] });
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    } finally {
      setResyncingCompleted(false);
    }
  };

  const deleteCancelled = () => {
    const ids = timeFiltered.filter((a) => a.status === "cancelled").map((a) => a.id);
    deleteIds(
      ids,
      L(
        `למחוק לצמיתות ${ids.length} תורים שבוטלו?`,
        `هل تريد حذف ${ids.length} موعدًا ملغيًا نهائيًا؟`,
        `Permanently delete ${ids.length} cancelled appointment(s)?`,
      ),
    );
  };

  const deleteDay = (group: { date: string; items: AdminAppointmentRow[] }) => {
    const ids = group.items.map((a) => a.id);
    deleteIds(
      ids,
      L(
        `למחוק לצמיתות ${ids.length} תורים מתאריך זה?`,
        `هل تريد حذف ${ids.length} موعدًا نهائيًا من هذا التاريخ؟`,
        `Permanently delete ${ids.length} appointment(s) from this day?`,
      ),
    );
  };

  const timeFilterLabel: Record<TimeFilter, string> = {
    today: L("היום", "اليوم", "Today"),
    week: L("השבוע", "هذا الأسبوع", "This Week"),
    month: L("חודש", "شهر", "Month"),
    all: L("הכל", "الكل", "All Time"),
  };

  const statusFilterLabel: Record<StatusFilter, string> = {
    all: L("הכל", "الكل", "All"),
    confirmed: L("מאושרים", "مؤكدة", "Confirmed"),
    completed: L("הושלמו", "مكتملة", "Completed"),
    cancelled: L("בוטלו", "ملغاة", "Cancelled"),
  };

  const dateGroupLabel = (
    dateStr: string,
  ): { kind: "today" | "tomorrow" | "yesterday" | null; badge: string | null; full: string } => {
    // Constructing a local-midnight Date purely for weekday/month display
    // is safe here — a calendar date's weekday doesn't depend on the
    // viewer's timezone, only the "is this today" comparison above does
    // (handled via todayStr/daysBetweenDateStrings, both Jerusalem-based).
    const [y, m, d] = dateStr.split("-").map(Number);
    const displayDate = new Date(y, m - 1, d);
    const diffDays = daysBetweenDateStrings(dateStr, todayStr);
    const full = displayDate.toLocaleDateString(
      lang === "he" ? "he-IL" : lang === "ar" ? "ar-EG" : "en-US",
      {
        weekday: "long",
        day: "numeric",
        month: "long",
      },
    );
    if (diffDays === 0) return { kind: "today", badge: L("היום", "اليوم", "Today"), full };
    if (diffDays === 1) return { kind: "tomorrow", badge: L("מחר", "غدًا", "Tomorrow"), full };
    if (diffDays === -1) return { kind: "yesterday", badge: L("אתמול", "أمس", "Yesterday"), full };
    return { kind: null, badge: null, full };
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <Reveal direction="up">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] sm:text-[30px] text-foreground">
              {L("תורים", "المواعيد", "Appointments")}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {filtered.length === rows.length
                ? L(`${rows.length} תורים`, `${rows.length} مواعيد`, `${rows.length} appointments`)
                : L(
                    `${filtered.length} מתוך ${rows.length} תורים`,
                    `${filtered.length} من ${rows.length} مواعيد`,
                    `${filtered.length} of ${rows.length} appointments`,
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
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          {statusCounts.cancelled > 0 && (
            <button
              onClick={deleteCancelled}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              {L(
                `מחק את כל התורים שבוטלו (${statusCounts.cancelled})`,
                `حذف كل المواعيد الملغاة (${statusCounts.cancelled})`,
                `Delete all cancelled (${statusCounts.cancelled})`,
              )}
            </button>
          )}
          {statusCounts.completed > 0 && (
            <button
              onClick={resyncCompleted}
              disabled={resyncingCompleted}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${resyncingCompleted ? "animate-spin" : ""}`} />
              {L(
                "סנכרן מחדש תורים שהושלמו ל-Google",
                "إعادة مزامنة المواعيد المكتملة مع Google",
                "Resync completed appointments to Google",
              )}
            </button>
          )}
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
            placeholder={L("חיפוש תור...", "بحث عن موعد...", "Search appointments...")}
            className="w-full sm:w-80 h-10 ps-10 pe-4 rounded-xl bg-card border border-border/20 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          />
        </div>
      </Reveal>

      {/* Date groups */}
      {isLoading && (
        <div
          className="rounded-2xl bg-card overflow-hidden border border-border/10 py-16 text-center"
          style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40 mx-auto" />
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <Reveal direction="up" delay={4}>
          <div
            className="rounded-2xl bg-card overflow-hidden border border-border/10 py-16 text-center"
            style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
          >
            <CalendarDays className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
            <div className="text-[14px] font-medium text-muted-foreground">
              {search
                ? L("לא נמצאו תוצאות", "لم يتم العثور على نتائج", "No results found")
                : timeFilter === "today"
                  ? L("אין תורים היום", "لا مواعيد اليوم", "No appointments today")
                  : statusFilter !== "all" || timeFilter !== "all"
                    ? L(
                        "אין תורים התואמים לסינון",
                        "لا توجد مواعيد مطابقة للتصفية",
                        "No appointments match this filter",
                      )
                    : L("אין תורים עדיין", "لا مواعيد بعد", "No appointments yet")}
            </div>
          </div>
        </Reveal>
      )}

      {groups.map((group, gi) => {
        const { kind, badge, full } = dateGroupLabel(group.date);
        const isToday = kind === "today";
        const isExpanded = expandedDays.has(group.date);
        const visibleItems =
          isExpanded || group.items.length <= MAX_VISIBLE_PER_DAY
            ? group.items
            : group.items.slice(0, MAX_VISIBLE_PER_DAY);
        const hiddenCount = group.items.length - visibleItems.length;
        return (
          <Reveal direction="up" delay={gi === 0 ? 4 : 0} key={group.date}>
            <div
              className="rounded-2xl bg-card overflow-hidden border border-border/10"
              style={{ boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" }}
            >
              <div
                className={`flex items-center justify-between px-4 py-3 border-b border-border/15 ${isToday ? "bg-cream" : "bg-surface/60"}`}
              >
                <div className="flex items-center gap-2">
                  <CalendarDays
                    className={`h-4 w-4 ${isToday ? "text-primary" : "text-muted-foreground/60"}`}
                  />
                  {badge && (
                    <span className="font-display text-[15px] text-foreground">{badge}</span>
                  )}
                  <span
                    className={
                      badge
                        ? "text-[12px] text-muted-foreground"
                        : "font-display text-[15px] text-foreground"
                    }
                  >
                    {full}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {L(
                      `${group.items.length} תורים`,
                      `${group.items.length} مواعيد`,
                      `${group.items.length} appts`,
                    )}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteDay(group)}
                    className="h-7 w-7 rounded-lg hover:bg-destructive/10"
                    title={L(
                      "מחק את כל התורים ביום זה",
                      "حذف كل مواعيد هذا اليوم",
                      "Delete this day",
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface/30 border-b border-border/10">
                      <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        {L("לקוחה", "العميلة", "Customer")}
                      </th>
                      <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        {L("שעה", "الوقت", "Time")}
                      </th>
                      <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden md:table-cell">
                        {L("טלפון", "الهاتف", "Phone")}
                      </th>
                      <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden sm:table-cell">
                        {L("שירות", "الخدمة", "Service")}
                      </th>
                      <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        {L("מחיר", "السعر", "Price")}
                      </th>
                      <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                        {L("סטטוס", "الحالة", "Status")}
                      </th>
                      <th className="text-start p-3.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground hidden lg:table-cell">
                        {L("יומן Google", "تقويم Google", "Google Calendar")}
                      </th>
                      <th className="text-end p-3.5 w-[52px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((a) => {
                      const isCompleted = a.status === "completed";
                      return (
                        <tr
                          key={a.id}
                          className={`border-t border-border/10 transition-colors ${
                            isCompleted ? "bg-cream/60 hover:bg-cream" : "hover:bg-surface/30"
                          }`}
                        >
                          <td className="p-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="grid h-8 w-8 place-items-center rounded-full bg-surface text-[11px] font-semibold text-foreground shrink-0">
                                {(a.customer_name ?? "?")[0]}
                              </div>
                              <span
                                className={`font-medium text-foreground ${isCompleted ? "line-through decoration-muted-foreground/60" : ""}`}
                              >
                                {a.customer_name}
                              </span>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center gap-1.5 text-[12px] text-foreground">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                              {String(a.appointment_time).slice(0, 5)}
                            </div>
                          </td>
                          <td
                            className="p-3.5 text-muted-foreground text-[12px] hidden md:table-cell"
                            dir="ltr"
                          >
                            {a.customer_phone}
                          </td>
                          <td className="p-3.5 hidden sm:table-cell">
                            <span
                              className={`text-[12px] font-medium text-foreground ${isCompleted ? "line-through decoration-muted-foreground/60" : ""}`}
                            >
                              {lang === "ar"
                                ? a.service?.name_ar || a.service?.name
                                : a.service?.name}
                            </span>
                          </td>
                          <td className="p-3.5 font-semibold">
                            ₪{Number(a.total_price).toFixed(0)}
                          </td>
                          <td className="p-3.5">
                            <Select value={a.status} onValueChange={(v) => setStatus(a.id, v)}>
                              <SelectTrigger
                                className={`h-8 w-[130px] rounded-full border text-[11px] font-medium gap-1.5 ${statusColor[a.status] ?? "bg-surface text-muted-foreground border-border/30"}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot[a.status] ?? "bg-muted-foreground"}`}
                                />
                                {/* A pre-migration appointment can still be 'pending'/'confirmed'
                                  — that's no longer a choice in the list below, so it wouldn't
                                  match any item and would otherwise render blank. Supplying it
                                  here as static text only kicks in for that legacy case; for
                                  completed/cancelled the normal item-matched label still shows. */}
                                <SelectValue>
                                  {SELECTABLE_STATUSES.includes(
                                    a.status as (typeof SELECTABLE_STATUSES)[number],
                                  )
                                    ? undefined
                                    : t(`status_${a.status}`)}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {SELECTABLE_STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    <span className="flex items-center gap-2">
                                      <span
                                        className={`h-1.5 w-1.5 rounded-full ${statusDot[s]}`}
                                      />
                                      {t(`status_${s}`)}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-3.5 hidden lg:table-cell">
                            {(() => {
                              const isSyncing = syncingIds.has(a.id);
                              const failed = Boolean(a.google_calendar_sync_error);
                              const synced = !failed && Boolean(a.google_calendar_synced_at);
                              return (
                                <div className="flex items-center gap-1.5">
                                  {failed ? (
                                    <span
                                      className="flex items-center gap-1 text-[11px] font-medium text-destructive"
                                      title={a.google_calendar_sync_error ?? undefined}
                                    >
                                      <CloudAlert className="h-3.5 w-3.5" />
                                      {L("סנכרון נכשל", "فشلت المزامنة", "Sync failed")}
                                    </span>
                                  ) : synced ? (
                                    <span className="flex items-center gap-1 text-[11px] font-medium text-sage">
                                      <CloudCheck className="h-3.5 w-3.5" />
                                      {L("מסונכרן", "تمت المزامنة", "Synced")}
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                      <CloudOff className="h-3.5 w-3.5" />
                                      {L("טרם סונכרן", "لم تتم المزامنة بعد", "Not synced yet")}
                                    </span>
                                  )}
                                  {(failed || !synced) && (
                                    <button
                                      type="button"
                                      onClick={() => retrySync(a.id)}
                                      disabled={isSyncing}
                                      title={L(
                                        "נסה לסנכרן שוב",
                                        "إعادة محاولة المزامنة",
                                        "Retry Google sync",
                                      )}
                                      className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground transition-colors disabled:opacity-50"
                                    >
                                      <RefreshCw
                                        className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
                                      />
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-3.5 text-end">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                deleteIds(
                                  [a.id],
                                  L(
                                    "למחוק לצמיתות את התור הזה?",
                                    "هل تريد حذف هذا الموعد نهائيًا؟",
                                    "Permanently delete this appointment?",
                                  ),
                                )
                              }
                              className="h-8 w-8 rounded-lg hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {hiddenCount > 0 && (
                <button
                  onClick={() =>
                    setExpandedDays((prev) => {
                      const next = new Set(prev);
                      next.add(group.date);
                      return next;
                    })
                  }
                  className="w-full py-3 text-[12px] font-semibold text-primary hover:bg-surface/50 transition-colors border-t border-border/10"
                >
                  {L(
                    `הצג את כל ${group.items.length} התורים (עוד ${hiddenCount})`,
                    `عرض كل ${group.items.length} المواعيد (${hiddenCount} إضافية)`,
                    `Show all ${group.items.length} appointments (${hiddenCount} more)`,
                  )}
                </button>
              )}
              {isExpanded && group.items.length > MAX_VISIBLE_PER_DAY && (
                <button
                  onClick={() =>
                    setExpandedDays((prev) => {
                      const next = new Set(prev);
                      next.delete(group.date);
                      return next;
                    })
                  }
                  className="w-full py-3 text-[12px] font-semibold text-muted-foreground hover:bg-surface/50 transition-colors border-t border-border/10"
                >
                  {L("הצג פחות", "عرض أقل", "Show less")}
                </button>
              )}
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}
