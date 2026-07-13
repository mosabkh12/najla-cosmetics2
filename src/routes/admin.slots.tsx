import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAvailabilitySettings,
  updateAvailabilitySettings,
  previewAvailabilityConflicts,
  DEFAULT_WEEKLY,
  type DayHours,
  type ConflictingAppointment,
} from "@/api/slots/slots";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Trash2,
  Plus,
  Clock,
  CalendarDays,
  Coffee,
  Settings,
  CalendarOff,
  Loader2,
  Save,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";
import { Reveal } from "@/components/ScrollReveal";
import { dayName } from "@/lib/business-hours";

export const Route = createFileRoute("/admin/slots")({
  // See admin.index.tsx for why this loader exists and why it swallows errors.
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: ["availability-settings"],
        queryFn: () => getAvailabilitySettings(),
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

const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 23; h++) {
  for (const m of [0, 30]) {
    if (h === 23 && m === 30) continue;
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

function TimeSelect({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  // A stored time that isn't one of the fixed 30-minute options (e.g. odd
  // leftover data, or a value set some other way) wouldn't match any
  // SelectItem below — Radix then renders the trigger blank with no
  // indication why, which looks broken. Adding it as its own option keeps
  // whatever is actually saved visible and selectable instead of hiding it.
  const options = TIME_OPTIONS.includes(value) ? TIME_OPTIONS : [value, ...TIME_OPTIONS].sort();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={`rounded-lg border-border/30 text-[13px] font-medium ${className}`}
        dir="ltr"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[200px]">
        {options.map((t) => (
          <SelectItem key={t} value={t}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Page() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) => (lang === "ar" ? ar : lang === "en" ? en : he);

  const { data, isLoading } = useQuery({
    queryKey: ["availability-settings"],
    queryFn: () => getAvailabilitySettings(),
  });

  const [weekly, setWeekly] = useState<Record<string, DayHours>>(DEFAULT_WEEKLY);
  const [breaks, setBreaks] = useState<{ start: string; end: string }[]>([]);
  const [interval, setInterval_] = useState(30);
  const [buffer, setBuffer] = useState(0);
  const [maxPerDay, setMaxPerDay] = useState<number | null>(null);
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  // Holds both the conflicts AND the exact payload that produced them, so
  // confirming saves precisely what was previewed — not whatever the form
  // happens to hold if the admin kept editing while the dialog was open.
  const [conflictReview, setConflictReview] = useState<{
    conflicts: ConflictingAppointment[];
    payload: {
      weekly_hours: Record<string, DayHours>;
      breaks: { start: string; end: string }[];
      slot_interval: number;
      buffer_minutes: number;
      max_per_day: number | null;
      closed_dates: string[];
    };
  } | null>(null);

  const [newBreakStart, setNewBreakStart] = useState("13:00");
  const [newBreakEnd, setNewBreakEnd] = useState("14:00");
  const [newClosedDate, setNewClosedDate] = useState("");

  useEffect(() => {
    if (data) {
      setWeekly(data.weekly_hours);
      setBreaks(data.breaks);
      setInterval_(data.slot_interval);
      setBuffer(data.buffer_minutes);
      setMaxPerDay(data.max_per_day);
      setClosedDates(data.closed_dates);
    }
  }, [data]);

  const updateDay = (day: string, patch: Partial<DayHours>) => {
    setWeekly((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  };

  const addBreak = () => {
    if (newBreakStart >= newBreakEnd) {
      toast.error(
        L(
          "שעת סיום חייבת להיות אחרי ההתחלה",
          "وقت النهاية يجب أن يكون بعد البداية",
          "End must be after start",
        ),
      );
      return;
    }
    setBreaks((prev) => [...prev, { start: newBreakStart, end: newBreakEnd }]);
  };

  const addClosedDate = () => {
    if (!newClosedDate) return;
    if (closedDates.includes(newClosedDate)) return;
    setClosedDates((prev) => [...prev, newClosedDate].sort());
    setNewClosedDate("");
  };

  const applySave = async (payload: {
    weekly_hours: Record<string, DayHours>;
    breaks: { start: string; end: string }[];
    slot_interval: number;
    buffer_minutes: number;
    max_per_day: number | null;
    closed_dates: string[];
  }) => {
    setSaving(true);
    try {
      const result = await updateAvailabilitySettings({ data: payload });
      qc.invalidateQueries({ queryKey: ["availability-settings"] });
      if (result.cancelledAppointments.length > 0) {
        qc.invalidateQueries({ queryKey: ["admin-appointments"] });
        qc.invalidateQueries({ queryKey: ["admin-overview"] });
        toast.success(
          L(
            `נשמר. ${result.cancelledAppointments.length} תורים בוטלו והלקוחות עודכנו במייל.`,
            `تم الحفظ. تم إلغاء ${result.cancelledAppointments.length} موعدًا وتم إخطار العملاء بالبريد الإلكتروني.`,
            `Saved. ${result.cancelledAppointments.length} appointment(s) were cancelled and customers notified by email.`,
          ),
        );
      } else {
        toast.success(L("נשמר בהצלחה", "تم الحفظ بنجاح", "Saved successfully"));
      }
      setConflictReview(null);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e));
    }
    setSaving(false);
  };

  // Save is a two-step flow: first check (read-only) whether this would
  // orphan any existing appointment; only actually write anything once the
  // admin has seen exactly what that would cancel and confirmed it.
  const save = async () => {
    const payload = {
      weekly_hours: weekly,
      breaks,
      slot_interval: interval,
      buffer_minutes: buffer,
      max_per_day: maxPerDay,
      closed_dates: closedDates,
    };
    setCheckingConflicts(true);
    try {
      const conflicts = await previewAvailabilityConflicts({
        data: { weekly_hours: weekly, breaks, closed_dates: closedDates },
      });
      setCheckingConflicts(false);
      if (conflicts.length > 0) {
        setConflictReview({ conflicts, payload });
        return;
      }
      await applySave(payload);
    } catch (e: unknown) {
      setCheckingConflicts(false);
      toast.error(getErrorMessage(e));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cardClass = "rounded-2xl bg-card p-5 sm:p-6 border border-border/10";
  const cardShadow = { boxShadow: "0 4px 20px -8px rgba(45, 45, 45, 0.06)" };
  const labelClass = "text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground";

  return (
    <div className="space-y-5">
      {/* Header */}
      <Reveal direction="up">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-[26px] sm:text-[30px] text-foreground">
              {L("הגדרות זמינות", "إعدادات التوفر", "Booking Availability")}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {L(
                "הגדרת שעות פעילות, הפסקות ותאריכים סגורים",
                "إعداد ساعات العمل والاستراحات والتواريخ المغلقة",
                "Configure working hours, breaks, and closed dates",
              )}
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving || checkingConflicts}
            className="bg-foreground text-background px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-40"
          >
            {saving || checkingConflicts ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {L("שמור", "حفظ", "Save")}
          </button>
        </div>
      </Reveal>

      {/* Weekly Schedule */}
      <Reveal direction="up" delay={1}>
        <div className={cardClass} style={cardShadow}>
          <div className="flex items-center gap-2.5 mb-5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10">
              <CalendarDays className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-[14px] font-semibold text-foreground">
              {L("לוח שבועי", "الجدول الأسبوعي", "Weekly Schedule")}
            </h2>
          </div>
          <div className="space-y-1.5">
            {["0", "1", "2", "3", "4", "5", "6"].map((d) => {
              const day = weekly[d];
              return (
                <div
                  key={d}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                    day?.enabled ? "bg-surface/50" : "bg-transparent"
                  }`}
                >
                  <Switch
                    checked={day?.enabled ?? false}
                    onCheckedChange={(v) => updateDay(d, { enabled: v })}
                  />
                  <span
                    className={`w-16 sm:w-20 text-[13px] font-medium shrink-0 ${day?.enabled ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {dayName(d, lang)}
                  </span>
                  {day?.enabled ? (
                    <div className="flex items-center gap-2">
                      <TimeSelect
                        value={day.open}
                        onChange={(v) => updateDay(d, { open: v })}
                        className="h-8 w-[85px]"
                      />
                      <span className="text-muted-foreground text-[11px]">{"—"}</span>
                      <TimeSelect
                        value={day.close}
                        onChange={(v) => updateDay(d, { close: v })}
                        className="h-8 w-[85px]"
                      />
                    </div>
                  ) : (
                    <span className="text-[12px] text-muted-foreground/50 italic">
                      {L("סגור", "مغلق", "Closed")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Reveal>

      {/* Booking Rules */}
      <Reveal direction="up" delay={2}>
        <div className={cardClass} style={cardShadow}>
          <div className="flex items-center gap-2.5 mb-5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-terracotta-soft">
              <Settings className="h-4 w-4 text-terracotta" />
            </div>
            <h2 className="text-[14px] font-semibold text-foreground">
              {L("הגדרות הזמנה", "إعدادات الحجز", "Booking Rules")}
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-5">
            <div className="grid gap-2">
              <Label className={labelClass}>
                {L("מרווח בין תורים", "الفاصل بين المواعيد", "Slot Interval")}
              </Label>
              <Select value={String(interval)} onValueChange={(v) => setInterval_(Number(v))}>
                <SelectTrigger className="h-10 rounded-xl border-border/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[15, 20, 30, 45, 60].map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      {v} {L("דקות", "دقيقة", "min")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className={labelClass}>{L("זמן חיץ", "وقت الفاصل", "Buffer Time")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={buffer}
                  onChange={(e) => setBuffer(Number(e.target.value) || 0)}
                  className="h-10 rounded-xl border-border/30"
                  dir="ltr"
                />
                <span className="text-[12px] text-muted-foreground whitespace-nowrap">
                  {L("דקות", "دقيقة", "min")}
                </span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label className={labelClass}>
                {L("מקסימום ליום", "الحد الأقصى يومياً", "Max Per Day")}
              </Label>
              <Input
                type="number"
                min={0}
                placeholder={L("ללא הגבלה", "بلا حد", "Unlimited")}
                value={maxPerDay ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setMaxPerDay(v ? Number(v) || null : null);
                }}
                className="h-10 rounded-xl border-border/30"
                dir="ltr"
              />
            </div>
          </div>
        </div>
      </Reveal>

      {/* Break Times */}
      <Reveal direction="up" delay={3}>
        <div className={cardClass} style={cardShadow}>
          <div className="flex items-center gap-2.5 mb-5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gold-deep/10">
              <Coffee className="h-4 w-4 text-gold-deep" />
            </div>
            <h2 className="text-[14px] font-semibold text-foreground">
              {L("הפסקות", "أوقات الراحة", "Break Times")}
            </h2>
          </div>

          {breaks.length > 0 && (
            <div className="space-y-2 mb-4">
              {breaks.map((b, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl bg-surface/50 px-4 py-2.5"
                >
                  <span
                    className="flex items-center gap-2 text-[13px] font-medium text-foreground"
                    dir="ltr"
                  >
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                    {b.start} {"—"} {b.end}
                  </span>
                  <button
                    onClick={() => setBreaks((prev) => prev.filter((_, j) => j !== i))}
                    className="grid h-7 w-7 place-items-center rounded-lg hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="grid gap-1.5">
              <Label className={labelClass}>{L("מ", "من", "From")}</Label>
              <TimeSelect
                value={newBreakStart}
                onChange={setNewBreakStart}
                className="h-9 w-[100px]"
              />
            </div>
            <span className="text-muted-foreground text-[12px] pb-2">{"—"}</span>
            <div className="grid gap-1.5">
              <Label className={labelClass}>{L("עד", "إلى", "To")}</Label>
              <TimeSelect value={newBreakEnd} onChange={setNewBreakEnd} className="h-9 w-[100px]" />
            </div>
            <button
              onClick={addBreak}
              className="h-9 px-4 rounded-lg bg-surface hover:bg-surface-2 text-foreground text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              {L("הוסף", "أضف", "Add")}
            </button>
          </div>
        </div>
      </Reveal>

      {/* Closed Dates */}
      <Reveal direction="up" delay={4}>
        <div className={cardClass} style={cardShadow}>
          <div className="flex items-center gap-2.5 mb-5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-destructive/10">
              <CalendarOff className="h-4 w-4 text-destructive" />
            </div>
            <h2 className="text-[14px] font-semibold text-foreground">
              {L("תאריכים סגורים", "التواريخ المغلقة", "Closed Dates")}
            </h2>
          </div>

          {closedDates.length > 0 && (
            <div className="space-y-2 mb-4">
              {closedDates.map((d) => (
                <div
                  key={d}
                  className="flex items-center justify-between rounded-xl bg-surface/50 px-4 py-2.5"
                >
                  <span
                    className="flex items-center gap-2 text-[13px] font-medium text-foreground"
                    dir="ltr"
                  >
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/60" />
                    {d}
                  </span>
                  <button
                    onClick={() => setClosedDates((prev) => prev.filter((x) => x !== d))}
                    className="grid h-7 w-7 place-items-center rounded-lg hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="grid gap-1.5">
              <Label className={labelClass}>{L("תאריך", "التاريخ", "Date")}</Label>
              <Input
                type="date"
                value={newClosedDate}
                onChange={(e) => setNewClosedDate(e.target.value)}
                className="h-9 rounded-lg border-border/30 text-[12px]"
                dir="ltr"
              />
            </div>
            <button
              onClick={addClosedDate}
              className="h-9 px-4 rounded-lg bg-surface hover:bg-surface-2 text-foreground text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              {L("הוסף", "أضف", "Add")}
            </button>
          </div>
        </div>
      </Reveal>

      {/* Confirm-before-cancel: saving would otherwise silently orphan
          these appointments (see findConflictingAppointments in slots.ts)
          — nothing forces the admin to see this list before it happens. */}
      <Dialog
        open={!!conflictReview}
        onOpenChange={(v) => {
          if (!v) setConflictReview(null);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {L(
                "שינוי זה יבטל תורים קיימים",
                "هذا التغيير سيلغي مواعيد قائمة",
                "This will cancel existing appointments",
              )}
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground -mt-2">
            {L(
              `${conflictReview?.conflicts.length ?? 0} תורים כבר קבועים בזמן שאת עומדת לחסום. שמירה תבטל אותם ותשלח ללקוחות מייל עדכון.`,
              `${conflictReview?.conflicts.length ?? 0} مواعيد محجوزة بالفعل في الوقت الذي أنت على وشك حظره. الحفظ سيلغيها ويرسل للعملاء بريدًا إلكترونيًا.`,
              `${conflictReview?.conflicts.length ?? 0} appointment(s) are already booked in the time you're about to block. Saving will cancel them and email the customers.`,
            )}
          </p>
          <div className="max-h-[280px] overflow-y-auto space-y-2 -mx-1 px-1">
            {conflictReview?.conflicts.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl bg-surface/60 px-3.5 py-2.5"
              >
                <div>
                  <div className="text-[13px] font-medium text-foreground">{c.customer_name}</div>
                  <div className="text-[11px] text-muted-foreground">{c.service_name}</div>
                </div>
                <div className="text-end text-[12px] text-muted-foreground" dir="ltr">
                  {c.appointment_date} · {c.appointment_time.slice(0, 5)}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setConflictReview(null)}
              className="flex-1 py-2.5 rounded-full border border-border/40 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground hover:bg-surface transition-colors"
            >
              {L("חזרה", "رجوع", "Go back")}
            </button>
            <button
              onClick={() => conflictReview && applySave(conflictReview.payload)}
              disabled={saving}
              className="flex-1 py-2.5 rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {L("בטל תורים ושמור", "إلغاء المواعيد وحفظ", "Cancel appointments & Save")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
