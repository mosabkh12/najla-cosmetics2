import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import type { Matcher } from "react-day-picker";
import { getErrorMessage } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { pickLocalized } from "@/lib/pick-localized";
import { useAuth } from "@/hooks/useAuth";
import { getAvailableTimes, createAppointment } from "@/api/appointments/appointments";
import { getAvailabilitySettings } from "@/api/slots/slots";
import { getProfile } from "@/api/profiles/profiles";
import type { Service } from "@/components/services/ServiceCard";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Clock, CalendarDays, ChevronRight, ChevronLeft, Check } from "lucide-react";

const ERROR_MAP: Record<string, string> = {
  CLOSED_DAY: "booking_closed_day",
  OUTSIDE_HOURS: "booking_outside_hours",
  PAST_DATE: "booking_past_date",
  PAST_TIME: "booking_past_time",
  TIME_TAKEN: "booking_time_taken",
  MAX_APPOINTMENTS_REACHED: "booking_max_reached",
  SERVICE_NOT_AVAILABLE: "booking_service_unavailable",
  INVALID_SLOT_TIME: "booking_invalid_slot",
  INVALID_INPUT: "booking_fields_required",
  BOOKING_FAILED: "booking_failed",
};

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDisplay(d: Date, lang: string): string {
  const locale = lang === "ar" ? "ar-SA" : lang === "he" ? "he-IL" : "en-US";
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

export function BookingDialog({
  service,
  open,
  onOpenChange,
}: {
  service: Service | null;
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  const { t, lang, dir } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const todayDate = useMemo(() => new Date(), []);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedDate, setSelectedDate] = useState<Date>(todayDate);
  const dateStr = useMemo(() => fmtDate(selectedDate), [selectedDate]);
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["availability-settings"],
    queryFn: () => getAvailabilitySettings(),
    staleTime: 60_000,
  });

  const disabledDays = useMemo(() => {
    if (!settings) return [{ before: todayDate }];
    const closedWeekdays = Object.entries(settings.weekly_hours)
      .filter(([, v]) => !v.enabled)
      .map(([k]) => Number(k));
    const closedDates = settings.closed_dates.map((d) => {
      const [y, m, day] = d.split("-").map(Number);
      return new Date(y, m - 1, day);
    });
    return [
      { before: todayDate },
      ...closedWeekdays.map((day) => ({ dayOfWeek: [day] })),
      ...closedDates.map((d) => d),
    ] satisfies Matcher[];
  }, [settings, todayDate]);

  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    if (!service || !dateStr) return;
    setTime("");
    setLoadingTimes(true);
    getAvailableTimes({ data: { serviceId: service.id, date: dateStr } })
      .then(setAvailable)
      .catch(() => setAvailable([]))
      .finally(() => setLoadingTimes(false));
  }, [service, dateStr, fetchKey]);

  useEffect(() => {
    if (user) {
      getProfile().then((data) => {
        if (data) {
          setName(data.full_name ?? "");
          setPhone(data.phone ?? "");
        }
      });
    }
  }, [user]);

  useEffect(() => {
    if (open) {
      setStep(1);
      setFetchKey((k) => k + 1);
    }
  }, [open]);

  const handleDateSelect = useCallback((d: Date | undefined) => {
    if (d) {
      setSelectedDate(d);
      setStep(2);
      return;
    }
    // react-day-picker's single-select mode fires onSelect(undefined) when the
    // already-selected day is clicked again (its built-in toggle-to-deselect
    // behavior) — a date is always required in this booking flow, so just
    // keep the current selection and proceed rather than silently no-op'ing.
    setStep(2);
  }, []);

  if (!service) return null;
  const localized = pickLocalized(lang, service.name, service.name_ar, service.name_en);
  const Back = dir === "rtl" ? ChevronRight : ChevronLeft;

  const submit = async () => {
    if (!user) {
      toast.info(t("sign_in"));
      onOpenChange(false);
      navigate({ to: "/auth" });
      return;
    }
    if (!dateStr || !time || !name.trim() || !phone.trim()) {
      toast.error(t("booking_fields_required"));
      return;
    }
    setBusy(true);
    try {
      await createAppointment({
        data: {
          service_id: service.id,
          appointment_date: dateStr,
          appointment_time: time + ":00",
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          notes: notes.trim() || null,
        },
      });
      toast.success(t("booking_success"));
      onOpenChange(false);
      setTime("");
      setNotes("");
    } catch (e: unknown) {
      const message = getErrorMessage(e);
      const key = ERROR_MAP[message];
      toast.error(key ? t(key) : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[420px] bg-card p-0 overflow-hidden gap-0 rounded-3xl border-border/20"
        style={{ boxShadow: "0 30px 60px -15px rgba(45, 45, 45, 0.15)" }}
      >
        {/* ── Header ── */}
        <div className="bg-cream px-5 py-4 border-b border-border/15">
          <h2 className="font-display text-lg italic text-foreground">{localized}</h2>
          <div className="flex items-center gap-3 mt-1 text-[12px] text-muted-foreground">
            <span>
              {t("starting_at")} <strong className="text-primary">₪{service.price}</strong>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-primary" />
              {service.duration_minutes} {t("minutes")}
            </span>
          </div>
        </div>

        {/* ── Progress ── */}
        <div className="flex items-center gap-1.5 px-5 py-3 border-b border-border/10 bg-surface/30">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex-1">
              <div
                className={`h-1 rounded-full transition-colors ${step >= s ? "bg-primary" : "bg-border/30"}`}
              />
            </div>
          ))}
        </div>

        {/* ── Step 1: Date ── */}
        {step === 1 && (
          <div className="px-5 py-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-3 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {t("select_date")}
            </p>
            <div className="rounded-xl border border-border/20 overflow-hidden flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={disabledDays}
                weekStartsOn={0}
                className="!bg-transparent"
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Time ── */}
        {step === 2 && (
          <div className="px-5 py-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Back className="h-3.5 w-3.5" />
                {t("select_date")}
              </button>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-[11px] font-semibold text-primary border border-primary/15">
                <CalendarDays className="h-3 w-3" />
                {fmtDisplay(selectedDate, lang)}
              </span>
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-3 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {t("select_time")}
            </p>
            {loadingTimes ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : available.length === 0 ? (
              <div className="rounded-2xl bg-cream/50 border border-primary/10 py-8 text-center">
                <Clock className="h-5 w-5 mx-auto text-primary/30 mb-2" />
                <p className="text-[13px] text-muted-foreground">{t("booking_no_times")}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2 max-h-[240px] overflow-y-auto">
                  {available.map((tm) => (
                    <button
                      key={tm}
                      onClick={() => {
                        setTime(tm);
                        setStep(3);
                      }}
                      className="rounded-xl border py-2 text-[13px] font-medium transition-all border-border/30 bg-card hover:border-primary/40 hover:bg-cream/50 active:scale-95"
                    >
                      {tm}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Step 3: Confirm ── */}
        {step === 3 && (
          <div className="px-5 py-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Back className="h-3.5 w-3.5" />
                {t("select_time")}
              </button>
            </div>

            {/* Summary */}
            <div className="rounded-xl bg-cream border border-primary/10 px-4 py-3 flex items-center justify-center gap-4">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                {fmtDisplay(selectedDate, lang)}
              </span>
              <span className="text-border">|</span>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
                <Clock className="h-3.5 w-3.5" />
                {time}
              </span>
            </div>

            {/* Form */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("full_name")}
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 h-10 rounded-xl border-border/30"
                />
              </div>
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("phone")}
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1.5 h-10 rounded-xl border-border/30"
                  dir="ltr"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {t("notes_optional")}
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1.5 resize-none rounded-xl border-border/30"
              />
            </div>

            <button
              onClick={submit}
              disabled={busy || !name.trim() || !phone.trim()}
              className="btn-gold w-full h-12 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t("confirm_booking")}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
