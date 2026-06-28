import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAvailabilitySettings,
  updateAvailabilitySettings,
  DEFAULT_WEEKLY,
  type DayHours,
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
import { Trash2, Plus, Clock, CalendarDays, Coffee, Settings, CalendarOff, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Reveal } from "@/components/ScrollReveal";

export const Route = createFileRoute("/admin/slots")({ component: Page });

const TIME_OPTIONS: string[] = [];
for (let h = 6; h <= 23; h++) {
  for (const m of [0, 30]) {
    if (h === 23 && m === 30) continue;
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

function TimeSelect({ value, onChange, className = "" }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`rounded-lg border-border/30 text-[13px] font-medium ${className}`} dir="ltr">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[200px]">
        {TIME_OPTIONS.map((t) => (
          <SelectItem key={t} value={t}>{t}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const DAY_NAMES: Record<string, [string, string, string]> = {
  "0": ["ראשון", "الأحد", "Sunday"],
  "1": ["שני", "الإثنين", "Monday"],
  "2": ["שלישי", "الثلاثاء", "Tuesday"],
  "3": ["רביעי", "الأربعاء", "Wednesday"],
  "4": ["חמישי", "الخميس", "Thursday"],
  "5": ["שישי", "الجمعة", "Friday"],
  "6": ["שבת", "السبت", "Saturday"],
};

function Page() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const L = (he: string, ar: string, en: string) =>
    lang === "ar" ? ar : lang === "en" ? en : he;
  const dayName = (d: string) => {
    const n = DAY_NAMES[d];
    return n ? (lang === "ar" ? n[1] : lang === "en" ? n[2] : n[0]) : d;
  };

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
      toast.error(L("שעת סיום חייבת להיות אחרי ההתחלה", "وقت النهاية يجب أن يكون بعد البداية", "End must be after start"));
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

  const save = async () => {
    setSaving(true);
    try {
      await updateAvailabilitySettings({
        data: {
          weekly_hours: weekly,
          breaks,
          slot_interval: interval,
          buffer_minutes: buffer,
          max_per_day: maxPerDay,
          closed_dates: closedDates,
        },
      });
      toast.success(L("נשמר בהצלחה", "تم الحفظ بنجاح", "Saved successfully"));
      qc.invalidateQueries({ queryKey: ["availability-settings"] });
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
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
            disabled={saving}
            className="bg-foreground text-background px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] hover:opacity-90 transition-opacity flex items-center gap-1.5 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {L("שמור", "حفظ", "Save")}
          </button>
        </div>
      </Reveal>

      {/* Weekly Schedule */}
      <Reveal direction="up" delay={1}>
        <div className={cardClass} style={cardShadow}>
          <div className="flex items-center gap-2.5 mb-5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50">
              <CalendarDays className="h-4 w-4 text-blue-600" />
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
                  <span className={`w-16 sm:w-20 text-[13px] font-medium shrink-0 ${day?.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                    {dayName(d)}
                  </span>
                  {day?.enabled ? (
                    <div className="flex items-center gap-2">
                      <TimeSelect value={day.open} onChange={(v) => updateDay(d, { open: v })} className="h-8 w-[85px]" />
                      <span className="text-muted-foreground text-[11px]">{"—"}</span>
                      <TimeSelect value={day.close} onChange={(v) => updateDay(d, { close: v })} className="h-8 w-[85px]" />
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
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-purple-50">
              <Settings className="h-4 w-4 text-purple-600" />
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
              <Label className={labelClass}>
                {L("זמן חיץ", "وقت الفاصل", "Buffer Time")}
              </Label>
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
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50">
              <Coffee className="h-4 w-4 text-amber-600" />
            </div>
            <h2 className="text-[14px] font-semibold text-foreground">
              {L("הפסקות", "أوقات الراحة", "Break Times")}
            </h2>
          </div>

          {breaks.length > 0 && (
            <div className="space-y-2 mb-4">
              {breaks.map((b, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-surface/50 px-4 py-2.5">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-foreground" dir="ltr">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                    {b.start} {"—"} {b.end}
                  </span>
                  <button
                    onClick={() => setBreaks((prev) => prev.filter((_, j) => j !== i))}
                    className="grid h-7 w-7 place-items-center rounded-lg hover:bg-red-50 transition-colors"
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
              <TimeSelect value={newBreakStart} onChange={setNewBreakStart} className="h-9 w-[100px]" />
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
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-red-50">
              <CalendarOff className="h-4 w-4 text-red-600" />
            </div>
            <h2 className="text-[14px] font-semibold text-foreground">
              {L("תאריכים סגורים", "التواريخ المغلقة", "Closed Dates")}
            </h2>
          </div>

          {closedDates.length > 0 && (
            <div className="space-y-2 mb-4">
              {closedDates.map((d) => (
                <div key={d} className="flex items-center justify-between rounded-xl bg-surface/50 px-4 py-2.5">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-foreground" dir="ltr">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/60" />
                    {d}
                  </span>
                  <button
                    onClick={() => setClosedDates((prev) => prev.filter((x) => x !== d))}
                    className="grid h-7 w-7 place-items-center rounded-lg hover:bg-red-50 transition-colors"
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
    </div>
  );
}
