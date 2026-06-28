import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "../admin/middleware";
import { type DayHours, DEFAULT_WEEKLY } from "@/api/slots/slots";

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function parseDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
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
  const dayOfWeek = parseDate(date).getDay();
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

export const getAvailableTimes = createServerFn({ method: "GET" })
  .validator((d: { serviceId: string; date: string }) => d)
  .handler(async ({ data: { serviceId, date } }) => {
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

    const { data: appointments } = await supabaseAdmin
      .from("appointments")
      .select("appointment_time")
      .eq("service_id", serviceId)
      .eq("appointment_date", date)
      .neq("status", "cancelled");

    if (settings.maxPerDay && (appointments ?? []).length >= settings.maxPerDay) return [];

    const taken = (appointments ?? []).map((a) => {
      const start = toMinutes(String(a.appointment_time));
      return { start: start - settings.buffer, end: start + duration + settings.buffer };
    });

    let available = slots.filter((slot) => {
      const start = toMinutes(slot);
      const end = start + duration;
      return !taken.some((t) => start < t.end && t.start < end);
    });

    const now = new Date();
    const dateObj = parseDate(date);
    const isToday =
      now.getFullYear() === dateObj.getFullYear() &&
      now.getMonth() === dateObj.getMonth() &&
      now.getDate() === dateObj.getDate();
    if (isToday) {
      const cutoff = now.getHours() * 60 + now.getMinutes() + 30;
      available = available.filter((slot) => toMinutes(slot) >= cutoff);
    }

    return available;
  });

const VALID_STATUSES = ["pending", "confirmed", "completed", "cancelled"] as const;
type AppointmentStatus = (typeof VALID_STATUSES)[number];

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
      total_price: number;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: service }, settings] = await Promise.all([
      supabaseAdmin
        .from("services")
        .select("name, duration_minutes")
        .eq("id", data.service_id)
        .eq("is_active", true)
        .single(),
      loadDaySettings(supabaseAdmin, data.appointment_date),
    ]);
    if (!service) throw new Error("Service not found");
    if (!settings) throw new Error("CLOSED_DAY");

    const duration = service.duration_minutes;
    const requestedStart = toMinutes(data.appointment_time);
    const requestedEnd = requestedStart + duration;

    if (requestedStart < settings.open || requestedEnd > settings.close)
      throw new Error("OUTSIDE_HOURS");

    const inBreak = settings.breaks.some(
      (b) => requestedStart < b.end && requestedEnd > b.start,
    );
    if (inBreak) throw new Error("OUTSIDE_HOURS");

    const dateObj = parseDate(data.appointment_date);
    const now = new Date();
    const isToday =
      now.getFullYear() === dateObj.getFullYear() &&
      now.getMonth() === dateObj.getMonth() &&
      now.getDate() === dateObj.getDate();
    if (dateObj < new Date(now.getFullYear(), now.getMonth(), now.getDate()))
      throw new Error("PAST_DATE");
    if (isToday && requestedStart < now.getHours() * 60 + now.getMinutes())
      throw new Error("PAST_TIME");

    const { data: existing } = await supabaseAdmin
      .from("appointments")
      .select("appointment_time")
      .eq("service_id", data.service_id)
      .eq("appointment_date", data.appointment_date)
      .neq("status", "cancelled");

    if (settings.maxPerDay && (existing ?? []).length >= settings.maxPerDay)
      throw new Error("TIME_TAKEN");

    const conflict = (existing ?? []).some((a) => {
      const aStart = toMinutes(String(a.appointment_time));
      return requestedStart < aStart + duration + settings.buffer &&
             aStart < requestedEnd + settings.buffer;
    });
    if (conflict) throw new Error("TIME_TAKEN");

    const { error } = await context.supabase.from("appointments").insert({
      user_id: context.userId,
      service_id: data.service_id,
      appointment_date: data.appointment_date,
      appointment_time: data.appointment_time,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      notes: data.notes,
      status: "pending",
      total_price: data.total_price,
    });
    if (error) throw error;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();

    if (profile?.email) {
      const { sendBookingConfirmation, sendAdminBookingNotification } = await import(
        "@/api/email/appointment-emails"
      );
      const details = {
        customerName: data.customer_name,
        customerPhone: data.customer_phone,
        customerEmail: profile.email,
        serviceName: service.name,
        date: data.appointment_date,
        time: data.appointment_time,
        duration,
        price: data.total_price,
      };
      sendBookingConfirmation(details).catch(console.error);
      sendAdminBookingNotification(details).catch(console.error);
    }

    return { success: true };
  });

export const getUserAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("appointments")
      .select("*, services(name,name_ar,image_url)")
      .eq("user_id", context.userId)
      .order("appointment_date", { ascending: false });
    return data ?? [];
  });

export const cancelAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data: { id }, context }) => {
    const { error } = await context.supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { success: true };
  });

export const getAdminAppointments = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
      throw new Error("Invalid status");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("appointments")
      .update({ status: status as AppointmentStatus })
      .eq("id", id);
    if (error) throw error;

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
