import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import type { Matcher } from "react-day-picker";
import { useI18n } from "@/lib/i18n";
import { pickLocalized } from "@/lib/pick-localized";
import { getErrorMessage } from "@/lib/utils";
import { getAvailableTimes, rescheduleAppointment } from "@/api/appointments/appointments";
import { getAvailabilitySettings } from "@/api/slots/slots";
import { getServices } from "@/api/services/services";
import type { Service } from "@/components/services/ServiceCard";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Clock,
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  Check,
  Sparkles,
} from "lucide-react";

const ERROR_MAP: Record<string, string> = {
  CLOSED_DAY: "booking_closed_day",
  OUTSIDE_HOURS: "booking_outside_hours",
  PAST_DATE: "booking_past_date",
  PAST_TIME: "booking_past_time",
  TIME_TAKEN: "booking_time_taken",
  SERVICE_NOT_AVAILABLE: "booking_service_unavailable",
  INVALID_SLOT_TIME: "booking_invalid_slot",
  NOT_FOUND: "reschedule_not_eligible",
  NOT_RESCHEDULABLE: "reschedule_not_eligible",
  RESCHEDULE_FAILED: "reschedule_failed",
};

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDisplay(d: Date, lang: string): string {
  const locale = lang === "ar" ? "ar-SA" : lang === "he" ? "he-IL" : "en-US";
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

export interface RescheduleTarget {
  id: string;
  service_id: string;
  appointment_date: string;
  appointment_time: string;
}

export function RescheduleDialog({
  appointment,
  open,
  onOpenChange,
  onDone,
}: {
  appointment: RescheduleTarget | null;
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onDone: () => void;
}) {
  const { t, lang, dir } = useI18n();
  const todayDate = useMemo(() => new Date(), []);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [serviceId, setServiceId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date>(todayDate);
  const dateStr = useMemo(() => fmtDate(selectedDate), [selectedDate]);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  // Same key/staleTime as the public services queries (index.tsx,
  // services.tsx) — this dialog fetches the exact same getServices() data,
  // so it should share that cache entry instead of always refetching fresh.
  const { data: services = [] } = useQuery({
    queryKey: ["services", "active"],
    queryFn: async () => (await getServices()) as Service[],
    staleTime: 120_000,
  });

  const { data: settings } = useQuery({
    queryKey: ["availability-settings"],
    queryFn: () => getAvailabilitySettings(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (open && appointment) {
      setStep(1);
      setServiceId(appointment.service_id);
      const [y, m, d] = appointment.appointment_date.split("-").map(Number);
      setSelectedDate(new Date(y, m - 1, d));
      setTime("");
      setFetchKey((k) => k + 1);
    }
  }, [open, appointment]);

  useEffect(() => {
    if (!appointment || !serviceId || !dateStr) return;
    setTime("");
    setLoadingTimes(true);
    getAvailableTimes({ data: { serviceId, date: dateStr, excludeAppointmentId: appointment.id } })
      .then(setAvailable)
      .catch(() => setAvailable([]))
      .finally(() => setLoadingTimes(false));
  }, [appointment, serviceId, dateStr, fetchKey]);

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

  const handleDateSelect = useCallback((d: Date | undefined) => {
    if (d) {
      setSelectedDate(d);
      setStep(3);
    }
  }, []);

  if (!appointment) return null;
  const selectedService = services.find((s) => s.id === serviceId);
  const Back = dir === "rtl" ? ChevronRight : ChevronLeft;

  const submit = async () => {
    if (!serviceId || !dateStr || !time) return;
    setBusy(true);
    try {
      await rescheduleAppointment({
        data: {
          id: appointment.id,
          service_id: serviceId,
          appointment_date: dateStr,
          appointment_time: time,
        },
      });
      toast.success(t("reschedule_success"));
      onOpenChange(false);
      onDone();
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
          <h2 className="font-display text-lg italic text-foreground">
            {t("reschedule_appointment")}
          </h2>
          {selectedService && (
            <div className="flex items-center gap-3 mt-1 text-[12px] text-muted-foreground">
              <span>{pickLocalized(lang, selectedService.name, selectedService.name_ar)}</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-primary" />
                {selectedService.duration_minutes} {t("minutes")}
              </span>
            </div>
          )}
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

        {/* ── Step 1: Service ── */}
        {step === 1 && (
          <div className="px-5 py-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-3 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {t("select_service")}
            </p>
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setServiceId(s.id);
                    setStep(2);
                  }}
                  className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-start transition-all ${
                    serviceId === s.id
                      ? "border-primary/40 bg-cream/50"
                      : "border-border/30 bg-card hover:border-primary/40 hover:bg-cream/30"
                  }`}
                >
                  <div>
                    <div className="text-[13px] font-medium text-foreground">
                      {pickLocalized(lang, s.name, s.name_ar)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {s.duration_minutes} {t("minutes")}
                    </div>
                  </div>
                  <span className="text-[13px] font-semibold text-primary">₪{s.price}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 2: Date ── */}
        {step === 2 && (
          <div className="px-5 py-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Back className="h-3.5 w-3.5" />
                {t("select_service")}
              </button>
            </div>
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

        {/* ── Step 3: Time + Confirm ── */}
        {step === 3 && (
          <div className="px-5 py-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(2)}
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

            <div>
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
                <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto">
                  {available.map((tm) => (
                    <button
                      key={tm}
                      onClick={() => setTime(tm)}
                      className={`rounded-xl border py-2 text-[13px] font-medium transition-all active:scale-95 ${
                        time === tm
                          ? "border-primary bg-cream text-primary"
                          : "border-border/30 bg-card hover:border-primary/40 hover:bg-cream/50"
                      }`}
                    >
                      {tm}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {time && (
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
            )}

            <button
              onClick={submit}
              disabled={busy || !time}
              className="btn-gold w-full h-12 rounded-full text-[11px] font-semibold uppercase tracking-[0.1em] disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t("reschedule")}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
