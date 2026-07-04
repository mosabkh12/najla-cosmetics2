import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "../admin/middleware";
import { type DayHours, DEFAULT_WEEKLY } from "@/api/slots/slots";

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HISTORY_RETENTION_DAYS = 14;

// Prefixes the create_appointment()/reschedule_appointment() RPCs
// raise on validation failure — mapped to clean, translatable codes so
// raw Postgres error text never reaches the browser.
const APPOINTMENT_ERROR_CODES = [
  "MAX_APPOINTMENTS_REACHED",
  "SERVICE_NOT_AVAILABLE",
  "CLOSED_DAY",
  "OUTSIDE_HOURS",
  "PAST_DATE",
  "PAST_TIME",
  "TIME_TAKEN",
  "INVALID_SLOT_TIME",
  "INVALID_INPUT",
];
const RESCHEDULE_ERROR_CODES = [...APPOINTMENT_ERROR_CODES, "NOT_FOUND", "NOT_RESCHEDULABLE"];

// Best-effort cleanup: permanently deletes completed/cancelled appointments
// older than the retention window. Runs opportunistically on every read so
// it's enforced even without a working DB-level cron (see the accompanying
// migration for the pg_cron-based version of the same policy).
async function purgeOldAppointments(supabaseAdmin: any) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  await supabaseAdmin
    .from("appointments")
    .delete()
    .in("status", ["completed", "cancelled"])
    .lt("appointment_date", cutoffStr);
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return -1;
  return h * 60 + m;
}

function fromMinutes(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function parseDate(date: string): Date | null {
  if (!DATE_RE.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const obj = new Date(y, m - 1, d);
  if (obj.getFullYear() !== y || obj.getMonth() !== m - 1 || obj.getDate() !== d) return null;
  return obj;
}

// Israel-local "now", used for presentation-sensitive checks (e.g. which
// slots still look bookable today). Authoritative past-date/time
// enforcement happens inside the create_appointment/reschedule_appointment
// RPCs themselves, using the same Asia/Jerusalem timezone.
function nowInJerusalem(): { dateStr: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

interface ResolvedDay {
  open: number;
  close: number;
  breaks: { start: number; end: number }[];
  interval: number;
  buffer: number;
  maxPerDay: number | null;
}

async function loadDaySettings(supabaseAdmin: any, date: string): Promise<ResolvedDay | null> {
  const { data } = await supabaseAdmin
    .from("availability_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  const weekly = (data?.weekly_hours ?? DEFAULT_WEEKLY) as Record<string, DayHours>;
  const dateObj = parseDate(date);
  if (!dateObj) return null;
  const dayOfWeek = dateObj.getDay();
  const day = weekly[String(dayOfWeek)];

  if (!day?.enabled) return null;

  const closedDates = (data?.closed_dates ?? []) as string[];
  if (closedDates.includes(date)) return null;

  return {
    open: toMinutes(day.open),
    close: toMinutes(day.close),
    breaks: ((data?.breaks ?? []) as { start: string; end: string }[]).map((b) => ({
      start: toMinutes(b.start),
      end: toMinutes(b.end),
    })),
    interval: data?.slot_interval ?? 30,
    buffer: data?.buffer_minutes ?? 0,
    maxPerDay: data?.max_per_day ?? null,
  };
}

// Read-only slot listing for the UI — not authoritative. The
// create_appointment/reschedule_appointment RPCs re-validate everything
// against the database at booking time regardless of what this returns.
export const getAvailableTimes = createServerFn({ method: "GET" })
  .validator((d: { serviceId: string; date: string; excludeAppointmentId?: string }) => d)
  .handler(async ({ data: { serviceId, date, excludeAppointmentId } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: service }, settings] = await Promise.all([
      supabaseAdmin.from("services").select("duration_minutes").eq("id", serviceId).single(),
      loadDaySettings(supabaseAdmin, date),
    ]);
    if (!service || !settings) return [];

    const duration = service.duration_minutes;

    const slots: string[] = [];
    for (let m = settings.open; m + duration <= settings.close; m += settings.interval) {
      const end = m + duration;
      const inBreak = settings.breaks.some((b) => m < b.end && end > b.start);
      if (!inBreak) slots.push(fromMinutes(m));
    }

    // Check ALL services for cross-service conflicts (single-operator salon)
    let apptQuery = supabaseAdmin
      .from("appointments")
      .select("appointment_time, services!inner(duration_minutes)")
      .eq("appointment_date", date)
      .neq("status", "cancelled");
    if (excludeAppointmentId) apptQuery = apptQuery.neq("id", excludeAppointmentId);
    const { data: appointments } = await apptQuery;

    if (settings.maxPerDay && (appointments ?? []).length >= settings.maxPerDay) return [];

    const buf = settings.buffer;
    const taken = (appointments ?? []).map((a: any) => {
      const start = toMinutes(String(a.appointment_time));
      const aDuration = a.services?.duration_minutes ?? 30;
      return { start: start - buf, end: start + aDuration + buf };
    });

    let available = slots.filter((slot) => {
      const start = toMinutes(slot);
      const end = start + duration;
      return !taken.some((t) => start < t.end && t.start < end);
    });

    const { dateStr: todayStr, minutes: nowMinutes } = nowInJerusalem();
    if (date === todayStr) {
      const cutoff = nowMinutes + 30;
      available = available.filter((slot) => toMinutes(slot) >= cutoff);
    }

    return available;
  });

const VALID_STATUSES = ["pending", "confirmed", "completed", "cancelled"] as const;
type AppointmentStatus = (typeof VALID_STATUSES)[number];

// Admin-only status transitions. completed/cancelled are terminal (also
// enforced at the database level, see check_appointment_status_transition
// in the accompanying migration, as a backstop beneath this allowlist).
const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "completed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// The browser may only ever specify WHAT it wants (service_id, date,
// time) and its own customer details. Duration, price, availability,
// and overlap validation all happen inside the create_appointment()
// database function — never trusted from the client.
export const createAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      service_id: string;
      appointment_date: string;
      appointment_time: string;
      customer_name: string;
      customer_phone: string;
      notes: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const customerName = (data.customer_name ?? "").trim();
    const customerPhone = (data.customer_phone ?? "").trim();
    if (!customerName) throw new Error("Name is required");
    if (!customerPhone) throw new Error("Phone is required");
    if (!TIME_RE.test(data.appointment_time)) throw new Error("Invalid time format");
    if (!DATE_RE.test(data.appointment_date)) throw new Error("Invalid date format");

    const { data: appointmentId, error } = await supabaseAdmin.rpc("create_appointment", {
      p_user_id: context.userId,
      p_service_id: data.service_id,
      p_appointment_date: data.appointment_date,
      p_appointment_time: data.appointment_time,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_notes: data.notes?.trim() || null,
    });

    if (error || !appointmentId) {
      const code = APPOINTMENT_ERROR_CODES.find((c) => error?.message?.startsWith(c));
      if (code) throw new Error(code);
      console.error("[createAppointment] failed for user", context.userId, error);
      throw new Error("BOOKING_FAILED");
    }

    const [{ data: service }, { data: profile }] = await Promise.all([
      supabaseAdmin.from("services").select("name, duration_minutes, price").eq("id", data.service_id).maybeSingle(),
      supabaseAdmin.from("profiles").select("email").eq("id", context.userId).maybeSingle(),
    ]);

    if (profile?.email && service) {
      const { sendBookingConfirmation, sendAdminBookingNotification } = await import(
        "@/api/email/appointment-emails"
      );
      const details = {
        customerName,
        customerPhone,
        customerEmail: profile.email,
        serviceName: service.name,
        date: data.appointment_date,
        time: data.appointment_time,
        duration: service.duration_minutes,
        price: Number(service.price),
      };
      sendBookingConfirmation(details).catch(console.error);
      sendAdminBookingNotification(details).catch(console.error);
    }

    return { success: true };
  });

export const getUserAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    purgeOldAppointments(supabaseAdmin).catch(console.error);

    const { data } = await context.supabase
      .from("appointments")
      .select("*, services(name,name_ar,image_url)")
      .eq("user_id", context.userId)
      .order("appointment_date", { ascending: false });
    return data ?? [];
  });

export const deleteAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data: { id }, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: appt } = await supabaseAdmin
      .from("appointments")
      .select("status, user_id")
      .eq("id", id)
      .single();

    if (!appt || appt.user_id !== context.userId) throw new Error("Not found");
    if (appt.status === "pending" || appt.status === "confirmed")
      throw new Error("Cannot delete an active appointment. Cancel it first.");

    const { error } = await supabaseAdmin
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { success: true };
  });

export const clearAppointmentHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("appointments")
      .delete()
      .eq("user_id", context.userId)
      .in("status", ["completed", "cancelled"]);
    if (error) throw error;
    return { success: true };
  });

export const cancelAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data: { id }, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: appt } = await supabaseAdmin
      .from("appointments")
      .select("status, user_id")
      .eq("id", id)
      .single();

    if (!appt || appt.user_id !== context.userId) throw new Error("Not found");
    if (appt.status === "completed" || appt.status === "cancelled")
      throw new Error("Cannot cancel this appointment");

    const { error } = await supabaseAdmin
      .from("appointments")
      .update({ status: "cancelled" as const })
      .eq("id", id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { success: true };
  });

// Same authoritative validation as createAppointment: the browser
// specifies WHAT it wants (which appointment, new service/date/time);
// ownership, eligibility, availability, and price/duration all come
// from reschedule_appointment() in the database.
export const rescheduleAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: { id: string; service_id: string; appointment_date: string; appointment_time: string }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!TIME_RE.test(data.appointment_time)) throw new Error("Invalid time format");
    if (!DATE_RE.test(data.appointment_date)) throw new Error("Invalid date format");

    const { data: result, error } = await supabaseAdmin.rpc("reschedule_appointment", {
      p_user_id: context.userId,
      p_appointment_id: data.id,
      p_service_id: data.service_id,
      p_appointment_date: data.appointment_date,
      p_appointment_time: data.appointment_time,
    });

    if (error || !result) {
      const code = RESCHEDULE_ERROR_CODES.find((c) => error?.message?.startsWith(c));
      if (code) throw new Error(code);
      console.error("[rescheduleAppointment] failed for user", context.userId, error);
      throw new Error("RESCHEDULE_FAILED");
    }

    const [{ data: appt }, { data: service }, { data: profile }] = await Promise.all([
      supabaseAdmin.from("appointments").select("customer_name, customer_phone").eq("id", data.id).maybeSingle(),
      supabaseAdmin.from("services").select("name, duration_minutes, price").eq("id", data.service_id).maybeSingle(),
      supabaseAdmin.from("profiles").select("email").eq("id", context.userId).maybeSingle(),
    ]);

    if (profile?.email && service && appt) {
      const { sendBookingConfirmation, sendAdminBookingNotification } = await import(
        "@/api/email/appointment-emails"
      );
      const details = {
        customerName: appt.customer_name,
        customerPhone: appt.customer_phone,
        customerEmail: profile.email,
        serviceName: service.name,
        date: data.appointment_date,
        time: data.appointment_time,
        duration: service.duration_minutes,
        price: Number(service.price),
      };
      sendBookingConfirmation(details).catch(console.error);
      sendAdminBookingNotification(details).catch(console.error);
    }

    return { success: true };
  });

export const getAdminAppointments = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    purgeOldAppointments(supabaseAdmin).catch(console.error);

    const { data, error } = await supabaseAdmin
      .from("appointments")
      .select("*, service:services(name,name_ar)")
      .order("appointment_date", { ascending: false })
      .order("appointment_time", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string; status: string }) => d)
  .handler(async ({ data: { id, status } }) => {
    if (!VALID_STATUSES.includes(status as AppointmentStatus))
      throw new Error("INVALID_STATUS");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current, error: fetchError } = await supabaseAdmin
      .from("appointments")
      .select("status")
      .eq("id", id)
      .single();
    if (fetchError || !current) throw new Error("APPOINTMENT_NOT_FOUND");

    const currentStatus = current.status as AppointmentStatus;
    const nextStatus = status as AppointmentStatus;
    if (currentStatus !== nextStatus && !VALID_TRANSITIONS[currentStatus].includes(nextStatus)) {
      throw new Error("INVALID_STATUS_TRANSITION");
    }

    const { error } = await supabaseAdmin
      .from("appointments")
      .update({ status: nextStatus })
      .eq("id", id);
    if (error) {
      console.error("[updateAppointmentStatus] failed for appointment", id, error);
      throw new Error("STATUS_UPDATE_FAILED");
    }

    if (status !== "pending") {
      const { data: appt } = await supabaseAdmin
        .from("appointments")
        .select("customer_name, appointment_date, appointment_time, user_id, service_id")
        .eq("id", id)
        .single();

      if (appt) {
        const [profileRes, serviceRes] = await Promise.all([
          supabaseAdmin.from("profiles").select("email").eq("id", appt.user_id).maybeSingle(),
          supabaseAdmin.from("services").select("name").eq("id", appt.service_id).single(),
        ]);

        if (profileRes.data?.email && serviceRes.data) {
          const { sendStatusUpdateEmail } = await import("@/api/email/appointment-emails");
          sendStatusUpdateEmail({
            customerName: appt.customer_name,
            customerEmail: profileRes.data.email,
            serviceName: serviceRes.data.name,
            date: appt.appointment_date,
            time: String(appt.appointment_time),
            status,
          }).catch(console.error);
        }
      }
    }

    return { success: true };
  });
