import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseAdmin } from "@/integrations/supabase/client.server";
import type { Lang } from "@/api/email/appointment-emails";
import { requireAdmin } from "../admin/middleware";
import { enforceRateLimit, getClientIp } from "@/api/rate-limit/rate-limit.server";
import { type DayHours, DEFAULT_WEEKLY } from "@/api/slots/slots";
import { jerusalemNow } from "@/lib/jerusalem-time";
import { toMinutes, fromMinutes } from "@/lib/time-minutes";

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
  "IDEMPOTENCY_PAYLOAD_MISMATCH",
];

// Same format check used by createOrder() for its idempotency key — a
// malformed value is treated as "no key" rather than failing the
// request outright.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function normalizeIdempotencyKey(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}
const RESCHEDULE_ERROR_CODES = [...APPOINTMENT_ERROR_CODES, "NOT_FOUND", "NOT_RESCHEDULABLE"];

// Prefixes admin_update_appointment_status() raises on validation
// failure (see the accompanying migration) — mapped the same way as
// APPOINTMENT_ERROR_CODES/RESCHEDULE_ERROR_CODES so raw Postgres error
// text never reaches the browser here either.
const ADMIN_STATUS_ERROR_CODES = [
  "APPOINTMENT_NOT_FOUND",
  "INVALID_STATUS",
  "INVALID_STATUS_TRANSITION",
  "APPOINTMENT_IN_PAST",
  "APPOINTMENT_TIME_CONFLICT",
  "APPOINTMENT_OUTSIDE_WORKING_HOURS",
  "APPOINTMENT_ON_CLOSED_DATE",
];

// Best-effort cleanup: permanently deletes completed/cancelled appointments
// older than the retention window. Runs opportunistically on every read so
// it's enforced even without a working DB-level cron (see the accompanying
// migration for the pg_cron-based version of the same policy).
async function purgeOldAppointments(supabaseAdmin: SupabaseAdmin) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  await supabaseAdmin
    .from("appointments")
    .delete()
    .in("status", ["completed", "cancelled"])
    .lt("appointment_date", cutoffStr);
}

// Auto-completes confirmed/pending appointments whose date is strictly
// before today (Jerusalem time). Runs on every fetch so past appointments
// never stay "active" even if the admin forgot to mark them done.
// Same-day appointments are left alone until tomorrow — a customer should
// be able to cancel earlier on the day of their appointment.
async function autoCompleteExpiredAppointments(supabaseAdmin: SupabaseAdmin) {
  const { dateStr: todayStr } = jerusalemNow();
  await supabaseAdmin
    .from("appointments")
    .update({ status: "completed" as const })
    .in("status", ["pending", "confirmed"])
    .lt("appointment_date", todayStr);
}

function parseDate(date: string): Date | null {
  if (!DATE_RE.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const obj = new Date(y, m - 1, d);
  if (obj.getFullYear() !== y || obj.getMonth() !== m - 1 || obj.getDate() !== d) return null;
  return obj;
}

interface ResolvedDay {
  open: number;
  close: number;
  breaks: { start: number; end: number }[];
  interval: number;
  buffer: number;
  maxPerDay: number | null;
}

async function loadDaySettings(
  supabaseAdmin: SupabaseAdmin,
  date: string,
): Promise<ResolvedDay | null> {
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

// Minimum notice a new/rescheduled booking must give — mirrors the same
// 30-minute floor enforced inside the create_appointment/reschedule_appointment
// RPCs (see the accompanying migration), so a slot hidden here for being
// too soon is also actually rejected if booked anyway some other way.
const MIN_BOOKING_LEAD_MINUTES = 30;

// Read-only slot listing for the UI — not authoritative. The
// create_appointment/reschedule_appointment RPCs re-validate everything
// against the database at booking time regardless of what this returns.
export const getAvailableTimes = createServerFn({ method: "GET" })
  .validator((d: { serviceId: string; date: string; excludeAppointmentId?: string }) => d)
  .handler(async ({ data: { serviceId, date, excludeAppointmentId } }) => {
    // Explicit safety net: this is an unauthenticated GET endpoint (no
    // requireSupabaseAuth), which otherwise looks exactly like the public
    // products/services/settings endpoints — but booking availability
    // changes with every appointment created/cancelled, so it must never
    // be stored by a browser or shared CDN cache, even by accident.
    setResponseHeader("Cache-Control", "no-store");

    await enforceRateLimit({
      action: "get_available_times",
      identifier: getClientIp(),
      windowSeconds: 5 * 60,
      max: 60,
    });

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

    // Check ALL services for cross-service conflicts (single-operator salon).
    // Reads duration_minutes off the appointment's own snapshot rather than
    // joining services — a `services!inner` join here used to silently drop
    // any appointment whose service was later deleted (service_id set NULL)
    // out of this list entirely, making that slot look available again even
    // though it's still booked. See the accompanying migration.
    let apptQuery = supabaseAdmin
      .from("appointments")
      .select("appointment_time, duration_minutes")
      .eq("appointment_date", date)
      .neq("status", "cancelled");
    if (excludeAppointmentId) apptQuery = apptQuery.neq("id", excludeAppointmentId);
    const { data: appointments } = await apptQuery;

    if (settings.maxPerDay && (appointments ?? []).length >= settings.maxPerDay) return [];

    const buf = settings.buffer;
    const taken = (appointments ?? []).map((a) => {
      const start = toMinutes(String(a.appointment_time));
      return { start: start - buf, end: start + a.duration_minutes + buf };
    });

    let available = slots.filter((slot) => {
      const start = toMinutes(slot);
      const end = start + duration;
      return !taken.some((t) => start < t.end && t.start < end);
    });

    const { dateStr: todayStr, minutes: nowMinutes } = jerusalemNow();
    if (date === todayStr) {
      const cutoff = nowMinutes + MIN_BOOKING_LEAD_MINUTES;
      available = available.filter((slot) => toMinutes(slot) >= cutoff);
    }

    return available;
  });

const VALID_STATUSES = ["pending", "confirmed", "completed", "cancelled"] as const;
type AppointmentStatus = (typeof VALID_STATUSES)[number];

// Bookings are created directly as 'confirmed' (see create_appointment RPC)
// — there's no approval step, so 'pending' is never offered. 'confirmed' IS
// offered despite that, purely as an undo: marking an appointment
// 'completed' (or 'cancelled') by mistake needs a way back to normal.
const ADMIN_SETTABLE_STATUSES = ["confirmed", "completed", "cancelled"] as const;

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
      idempotency_key: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit({
      action: "create_appointment",
      identifier: context.userId,
      windowSeconds: 60 * 60,
      max: 10,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const customerName = (data.customer_name ?? "").trim();
    const customerPhone = (data.customer_phone ?? "").trim();
    if (!customerName) throw new Error("Name is required");
    if (!customerPhone) throw new Error("Phone is required");
    if (!TIME_RE.test(data.appointment_time)) throw new Error("Invalid time format");
    if (!DATE_RE.test(data.appointment_date)) throw new Error("Invalid date format");

    // Generated client-side once per booking attempt (see BookingDialog.tsx —
    // regenerated whenever the target service/date/time changes or the
    // dialog reopens) and resent unchanged on every retry of that same
    // attempt — lets create_appointment() recognize and no-op a duplicate
    // submission instead of raising a confusing TIME_TAKEN against the
    // user's own successful booking.
    const idempotencyKey = normalizeIdempotencyKey(data.idempotency_key);

    const { data: rpcRows, error } = await supabaseAdmin.rpc("create_appointment", {
      p_user_id: context.userId,
      p_service_id: data.service_id,
      p_appointment_date: data.appointment_date,
      p_appointment_time: data.appointment_time,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_notes: data.notes?.trim() || null,
      p_idempotency_key: idempotencyKey,
    });
    const result = rpcRows?.[0];

    if (error || !result?.appointment_id) {
      const code = APPOINTMENT_ERROR_CODES.find((c) => error?.message?.startsWith(c));
      if (code) throw new Error(code);
      console.error("[createAppointment] failed for user", context.userId, error);
      throw new Error("BOOKING_FAILED");
    }

    const appointmentId = result.appointment_id;

    // A retried/duplicate submission (same idempotency key) resolves to
    // the SAME appointment every time, but only the call that actually
    // created it should trigger confirmation emails / Calendar sync —
    // otherwise a network retry or double-tap would notify twice for one
    // booking.
    if (!result.is_new) {
      return { success: true };
    }

    const [{ data: service }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("services")
        .select("name, duration_minutes, price")
        .eq("id", data.service_id)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("email, language")
        .eq("id", context.userId)
        .maybeSingle(),
    ]);

    if (profile?.email && service) {
      const { sendBookingConfirmation, sendAdminBookingNotification } =
        await import("@/api/email/appointment-emails");
      const details = {
        customerName,
        customerPhone,
        customerEmail: profile.email,
        serviceName: service.name,
        date: data.appointment_date,
        time: data.appointment_time,
        duration: service.duration_minutes,
        price: Number(service.price),
        lang: profile.language as Lang,
      };
      // Awaited (each with its own error swallow) rather than left as a
      // dangling fire-and-forget promise — on Vercel's serverless runtime,
      // the function can freeze/terminate immediately after the response
      // is sent, which can silently cut off an un-awaited send before it
      // actually reaches Resend. Running both in parallel means this adds
      // no more latency than the slower of the two, not their sum.
      await Promise.all([
        sendBookingConfirmation(details).catch(console.error),
        sendAdminBookingNotification(details).catch(console.error),
      ]);
    }

    // Awaited (with its own error swallow, and never expected to throw —
    // see calendar.server.ts) rather than left as a dangling
    // fire-and-forget promise: same Vercel-freeze risk as the emails
    // above — an un-awaited call can be silently cut off, including the
    // DB write that would otherwise record google_calendar_sync_error
    // for the admin to retry.
    const { syncAppointmentToGoogleCalendar } =
      await import("@/integrations/google/calendar.server");
    await syncAppointmentToGoogleCalendar(appointmentId).catch(console.error);

    return { success: true };
  });

export const getUserAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Auto-complete first so the data returned is already up-to-date,
    // then purge old history. Both are best-effort (errors are swallowed).
    await autoCompleteExpiredAppointments(supabaseAdmin).catch(console.error);
    purgeOldAppointments(supabaseAdmin).catch(console.error);

    const { data } = await context.supabase
      .from("appointments")
      .select("*, services(name,name_ar,image_url,thumbnail_url)")
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
      .select("status, user_id, google_event_id")
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

    if (appt.google_event_id) {
      // Awaited for the same reason as every other sync/delete call site
      // in this file — an un-awaited call can be silently cut off by
      // Vercel freezing the function right after the response is sent.
      const { deleteGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
      await deleteGoogleCalendarEvent(appt.google_event_id).catch(console.error);
    }

    return { success: true };
  });

export const clearAppointmentHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: toDelete } = await supabaseAdmin
      .from("appointments")
      .select("google_event_id")
      .eq("user_id", context.userId)
      .in("status", ["completed", "cancelled"]);

    const { error } = await supabaseAdmin
      .from("appointments")
      .delete()
      .eq("user_id", context.userId)
      .in("status", ["completed", "cancelled"]);
    if (error) throw error;

    const eventIds = (toDelete ?? [])
      .map((a) => a.google_event_id)
      .filter((eventId): eventId is string => Boolean(eventId));
    if (eventIds.length > 0) {
      // Awaited — see the comment on the same pattern in deleteAppointment.
      const { deleteGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
      await Promise.all(eventIds.map((eventId) => deleteGoogleCalendarEvent(eventId))).catch(
        console.error,
      );
    }

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

    // Awaited — see the comment on the same pattern in createAppointment.
    const { syncAppointmentToGoogleCalendar } =
      await import("@/integrations/google/calendar.server");
    await syncAppointmentToGoogleCalendar(id).catch(console.error);

    return { success: true };
  });

// Same authoritative validation as createAppointment: the browser
// specifies WHAT it wants (which appointment, new service/date/time);
// ownership, eligibility, availability, and price/duration all come
// from reschedule_appointment() in the database.
export const rescheduleAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      id: string;
      service_id: string;
      appointment_date: string;
      appointment_time: string;
      idempotency_key: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit({
      action: "reschedule_appointment",
      identifier: context.userId,
      windowSeconds: 60 * 60,
      max: 10,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!TIME_RE.test(data.appointment_time)) throw new Error("Invalid time format");
    if (!DATE_RE.test(data.appointment_date)) throw new Error("Invalid date format");

    // Generated client-side once per reschedule attempt (see
    // RescheduleDialog.tsx) — same idempotency contract as
    // createAppointment above, but stored on (and compared against) the
    // appointment row being rescheduled rather than a new row.
    const idempotencyKey = normalizeIdempotencyKey(data.idempotency_key);

    const { data: rpcRows, error } = await supabaseAdmin.rpc("reschedule_appointment", {
      p_user_id: context.userId,
      p_appointment_id: data.id,
      p_service_id: data.service_id,
      p_appointment_date: data.appointment_date,
      p_appointment_time: data.appointment_time,
      p_idempotency_key: idempotencyKey,
    });
    const result = rpcRows?.[0];

    if (error || !result?.appointment_id) {
      const code = RESCHEDULE_ERROR_CODES.find((c) => error?.message?.startsWith(c));
      if (code) throw new Error(code);
      console.error("[rescheduleAppointment] failed for user", context.userId, error);
      throw new Error("RESCHEDULE_FAILED");
    }

    // A retried/duplicate reschedule (same idempotency key, same target)
    // resolves successfully every time, but only the call that actually
    // applied the change should trigger confirmation emails / Calendar
    // sync — see the same reasoning in createAppointment above.
    if (!result.applied) {
      return { success: true };
    }

    const [{ data: appt }, { data: service }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("appointments")
        .select("customer_name, customer_phone")
        .eq("id", data.id)
        .maybeSingle(),
      supabaseAdmin
        .from("services")
        .select("name, duration_minutes, price")
        .eq("id", data.service_id)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("email, language")
        .eq("id", context.userId)
        .maybeSingle(),
    ]);

    if (profile?.email && service && appt) {
      const { sendBookingConfirmation, sendAdminBookingNotification } =
        await import("@/api/email/appointment-emails");
      const details = {
        customerName: appt.customer_name,
        customerPhone: appt.customer_phone,
        customerEmail: profile.email,
        serviceName: service.name,
        date: data.appointment_date,
        time: data.appointment_time,
        duration: service.duration_minutes,
        price: Number(service.price),
        lang: profile.language as Lang,
      };
      await Promise.all([
        sendBookingConfirmation(details).catch(console.error),
        sendAdminBookingNotification(details).catch(console.error),
      ]);
    }

    // Awaited — see the comment on the same pattern in createAppointment.
    const { syncAppointmentToGoogleCalendar } =
      await import("@/integrations/google/calendar.server");
    await syncAppointmentToGoogleCalendar(data.id).catch(console.error);

    return { success: true };
  });

export const getAdminAppointments = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await autoCompleteExpiredAppointments(supabaseAdmin).catch(console.error);
    purgeOldAppointments(supabaseAdmin).catch(console.error);

    const { data, error } = await supabaseAdmin
      .from("appointments")
      .select("*, service:services(name,name_ar)")
      .order("appointment_date", { ascending: false })
      .order("appointment_time", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

// Admin may move an appointment to ANY status from ANY status EXCEPT
// cancelled -> completed (a cancelled appointment never took place, so it
// can't become "completed" without first being reactivated), including
// back out of "completed"/"cancelled" — those are no longer terminal (see
// 20260706220000_allow_full_appointment_status_transitions.sql, which
// dropped the old blanket DB-level terminal-state trigger for appointments,
// mirroring the same fix already applied to orders). This stays
// intentionally permissive: reachable only through requireAdmin, and
// direct client writes to appointments remain fully revoked (see
// secure_appointment_booking.sql) — a customer can never reach this
// regardless of the status graph, so the old blanket restriction was only
// ever getting in the admin's own way, not protecting against a customer.
//
// What changed in Phase 4: reactivating an appointment (moving it from
// cancelled/completed back to pending/confirmed) can re-occupy a slot
// another booking may have since taken — every other transition here
// (active -> terminal, terminal <-> terminal correction, active <-> active)
// never does that and needs no re-check. The actual DB write now goes
// through admin_update_appointment_status() (see the accompanying
// migration), a SECURITY DEFINER RPC that locks the target row, and — only
// for a reactivation — re-validates hours/breaks/closed-dates/past-date and
// re-checks overlap against every other active appointment (excluding
// itself), serialized with the same pg_advisory_xact_lock namespace
// create_appointment/reschedule_appointment already use. This function no
// longer writes appointments.status directly, and performs no conflict
// logic of its own — the RPC is the sole source of truth for both.
export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string; status: string }) => d)
  .handler(async ({ data: { id, status } }) => {
    if (!ADMIN_SETTABLE_STATUSES.includes(status as (typeof ADMIN_SETTABLE_STATUSES)[number]))
      throw new Error("INVALID_STATUS");
    const nextStatus = status as AppointmentStatus;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Read only — used below purely to decide whether this is a genuine
    // status change worth emailing the customer about. Not the
    // authoritative check: the RPC re-reads and locks the row itself
    // inside its own transaction regardless of what this read saw.
    const { data: current } = await supabaseAdmin
      .from("appointments")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    const currentStatus = current?.status as AppointmentStatus | undefined;

    const { data: updatedId, error } = await supabaseAdmin.rpc("admin_update_appointment_status", {
      p_appointment_id: id,
      p_status: nextStatus,
    });

    if (error || !updatedId) {
      const code = ADMIN_STATUS_ERROR_CODES.find((c) => error?.message?.startsWith(c));
      if (code) throw new Error(code);
      console.error("[updateAppointmentStatus] failed for appointment", id, error);
      throw new Error("STATUS_UPDATE_FAILED");
    }

    // Awaited — see the comment on the same pattern in createAppointment.
    // Only reached once the RPC above has actually committed the status
    // change; a validation failure throws before this line, so a failed
    // update never triggers a Calendar sync.
    const { syncAppointmentToGoogleCalendar } =
      await import("@/integrations/google/calendar.server");
    await syncAppointmentToGoogleCalendar(id).catch(console.error);

    // Only notify the customer on a genuine change — re-saving the same
    // status (e.g. a duplicate submit) must not resend the email.
    if (currentStatus !== nextStatus) {
      const { data: appt } = await supabaseAdmin
        .from("appointments")
        .select("customer_name, appointment_date, appointment_time, user_id, service_name")
        .eq("id", id)
        .single();

      if (appt) {
        // Uses the name snapshotted at booking time (never a live lookup)
        // — correct even if the service was since renamed or deleted, and
        // consistent with how order_items.product_name already works.
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("email, language")
          .eq("id", appt.user_id)
          .maybeSingle();

        if (profile?.email && appt.service_name) {
          const { sendStatusUpdateEmail } = await import("@/api/email/appointment-emails");
          await sendStatusUpdateEmail({
            customerName: appt.customer_name,
            customerEmail: profile.email,
            serviceName: appt.service_name,
            date: appt.appointment_date,
            time: String(appt.appointment_time),
            status,
            lang: profile.language as Lang,
          }).catch(console.error);
        }
      }
    }

    return { success: true };
  });

// Permanently deletes one or more appointments, admin-only, no status
// restriction — this is a deliberate cleanup tool (clearing out old
// cancelled clutter, or a day the admin is done with), not something a
// customer can ever reach (their own deleteAppointment above stays scoped
// to their own completed/cancelled rows). Accepts a batch so the UI can
// delete "all cancelled" or "this whole day" in one round trip instead of
// one request per row.
export const deleteAppointmentsAdmin = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { ids: string[] }) => d)
  .handler(async ({ data: { ids } }) => {
    if (ids.length === 0) return { success: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: toDelete } = await supabaseAdmin
      .from("appointments")
      .select("google_event_id")
      .in("id", ids);

    const { error } = await supabaseAdmin.from("appointments").delete().in("id", ids);
    if (error) throw error;

    // Completed appointments keep their Google event around (that's the
    // whole point of the "completed" styling), so deleting the
    // appointment row itself here — e.g. clearing history — is the point
    // where that event actually needs to go too, or it'd sit there
    // forever with no appointment behind it.
    const eventIds = (toDelete ?? [])
      .map((a) => a.google_event_id)
      .filter((eventId): eventId is string => Boolean(eventId));
    if (eventIds.length > 0) {
      // Awaited — see the comment on the same pattern in deleteAppointment.
      const { deleteGoogleCalendarEvent } = await import("@/integrations/google/calendar.server");
      await Promise.all(eventIds.map((eventId) => deleteGoogleCalendarEvent(eventId))).catch(
        console.error,
      );
    }

    return { success: true };
  });

// Manual retry for a single appointment's Google Calendar sync, surfaced
// next to the "sync failed" / "not synced" indicator in the admin
// appointments table — the operator-facing fallback for the "retry
// mechanism" requirement, since automatic sync is otherwise fire-and-forget.
export const retryGoogleCalendarSync = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: { id: string }) => d)
  .handler(async ({ data: { id } }) => {
    const { syncAppointmentToGoogleCalendar } =
      await import("@/integrations/google/calendar.server");
    await syncAppointmentToGoogleCalendar(id);
    return { success: true };
  });

// Bulk fallback for existing completed appointments whose Google event was
// already synced under an older style (before the checkmark title/neutral
// color existed) — re-runs the same per-appointment sync so their events
// pick up the current completed styling, without the admin needing to
// retry each row individually.
export const resyncCompletedGoogleEvents = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncAppointmentToGoogleCalendar } =
      await import("@/integrations/google/calendar.server");

    const { data, error } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("status", "completed");
    if (error) throw error;

    const ids = (data ?? []).map((a) => a.id);
    for (const id of ids) {
      await syncAppointmentToGoogleCalendar(id);
    }
    return { count: ids.length };
  });
