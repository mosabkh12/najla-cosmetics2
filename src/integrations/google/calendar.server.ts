// Uses the scoped @googleapis/calendar package (not the full `googleapis`
// meta-package, which bundles clients for every Google API and would add
// ~25MB of dead code to the server bundle for the one client we need here).
import { calendar, calendar_v3, auth } from "@googleapis/calendar";
import type { GoogleSyncAppointmentRow } from "@/lib/api-types";

// One-way sync only: this app's appointments table is the source of
// truth, and every write here flows Najla -> Google. Nothing is ever
// read back from Google into the database.

type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled";

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Google Calendar's event colorId only supports a fixed 11-color palette
// (no true beige/birch exists) — "8" (Graphite, a muted grey) is the
// closest neutral tone available, used to visually de-emphasize completed
// appointments without deleting them. See colorId reference:
// https://developers.google.com/calendar/api/v3/reference/colors
const COMPLETED_COLOR_ID = "8";

interface CalendarClient {
  calendar: calendar_v3.Calendar;
  calendarId: string;
}

// All 5 vars are required together — a half-configured setup (e.g. a
// refresh token without a calendar id) is treated the same as "not
// configured" rather than attempted and failed on every booking.
function getCalendarClient(): CalendarClient | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!clientId || !clientSecret || !redirectUri || !refreshToken || !calendarId) return null;

  const oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return { calendar: calendar({ version: "v3", auth: oauth2Client }), calendarId };
}

// Pure wall-clock arithmetic (no timezone conversion involved) — adds
// `minutes` to a plain date+time pair and rolls over into the next day
// correctly. Using Date.UTC here is just a calculator; the result is
// still a local Jerusalem wall-clock value, paired with an explicit
// timeZone field below so Google resolves the real UTC instant itself.
function addMinutesToWallTime(
  dateStr: string,
  timeStr: string,
  minutes: number,
): { date: string; time: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const result = new Date(Date.UTC(y, m - 1, d, hh, mm) + minutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${result.getUTCFullYear()}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`,
    time: `${pad(result.getUTCHours())}:${pad(result.getUTCMinutes())}`,
  };
}

function buildGoogleEvent(
  appt: GoogleSyncAppointmentRow,
  customerEmail: string | null,
  businessAddress: string | null,
): calendar_v3.Schema$Event {
  const status = appt.status as AppointmentStatus;
  const isCompleted = status === "completed";
  const label = STATUS_LABEL[status] ?? appt.status;
  const serviceName = appt.service?.name ?? "Appointment";
  const durationMinutes = appt.service?.duration_minutes ?? 30;
  const timeStr = String(appt.appointment_time).slice(0, 5);
  const end = addMinutesToWallTime(appt.appointment_date, timeStr, durationMinutes);

  const description = [
    `Customer: ${appt.customer_name}`,
    customerEmail ? `Email: ${customerEmail}` : null,
    `Phone: ${appt.customer_phone}`,
    `Service: ${serviceName}`,
    `Status: ${label}`,
    `Appointment ID: ${appt.id}`,
    appt.notes ? `Notes: ${appt.notes}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  // Google event titles can't render CSS strikethrough — a checkmark +
  // bracketed status is the calendar-side equivalent of the line-through
  // treatment used for completed rows in the admin table.
  const summary = isCompleted
    ? `✅ [Completed] ${serviceName} — ${appt.customer_name}`
    : `[${label}] ${serviceName} — ${appt.customer_name}`;

  return {
    summary,
    description,
    location: businessAddress ?? undefined,
    // Omitted (undefined) for anything but completed — events.update()
    // replaces the whole resource rather than patching it, so leaving this
    // out on a later sync automatically reverts a previously-completed
    // event back to the calendar's default color.
    colorId: isCompleted ? COMPLETED_COLOR_ID : undefined,
    // `dateTime` is a naive local wall-clock string; pairing it with an
    // explicit IANA `timeZone` (rather than converting to UTC ourselves)
    // lets Google resolve the correct instant, including DST, exactly
    // the way it resolves every other timezone-aware event.
    start: { dateTime: `${appt.appointment_date}T${timeStr}:00`, timeZone: "Asia/Jerusalem" },
    end: { dateTime: `${end.date}T${end.time}:00`, timeZone: "Asia/Jerusalem" },
  };
}

async function upsertGoogleEvent(
  client: CalendarClient,
  existingEventId: string | null,
  eventBody: calendar_v3.Schema$Event,
): Promise<string> {
  const { calendar, calendarId } = client;

  if (existingEventId) {
    try {
      const res = await calendar.events.update({
        calendarId,
        eventId: existingEventId,
        requestBody: eventBody,
      });
      if (res.data.id) return res.data.id;
    } catch (err: unknown) {
      const status = (err as { code?: number; status?: number })?.code ?? undefined;
      // The event was deleted/moved on Google's side out-of-band — self-heal
      // by creating a fresh one instead of failing forever on every sync.
      if (status !== 404 && status !== 410) throw err;
    }
  }

  const res = await calendar.events.insert({ calendarId, requestBody: eventBody });
  if (!res.data.id) throw new Error("Google Calendar did not return an event id");
  return res.data.id;
}

async function deleteGoogleEventIfExists(client: CalendarClient, eventId: string | null) {
  if (!eventId) return;
  try {
    await client.calendar.events.delete({ calendarId: client.calendarId, eventId });
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code;
    // Already gone (deleted manually, or a retry after a previous
    // successful delete) — that's the desired end state either way.
    if (status !== 404 && status !== 410) throw err;
  }
}

// Standalone cleanup for when an appointment ROW itself is permanently
// deleted (admin bulk/single delete, a customer clearing their own
// history) — as opposed to just being cancelled. There's no appointment
// left to read at that point, so the caller passes the event id it already
// had on hand before deleting. Never throws, matching every other Google
// Calendar entry point: a stale/orphaned Google event is a cosmetic
// problem, not one worth surfacing as a failed delete in the app.
export async function deleteGoogleCalendarEvent(eventId: string): Promise<void> {
  const client = getCalendarClient();
  if (!client) return;
  try {
    await deleteGoogleEventIfExists(client, eventId);
  } catch (err) {
    console.error("[deleteGoogleCalendarEvent] failed for event", eventId, err);
  }
}

// Reusable sync entry point, called after every appointment write
// (create, reschedule, status change, cancellation). Never throws —
// a Google Calendar outage or misconfiguration must never break booking,
// so every failure is caught, logged, and recorded on the appointment row
// instead of propagating to the caller.
//
// Cancelled appointments are deleted from Google Calendar outright (not
// just retitled) so they stop showing as busy time on the admin's actual
// calendar. google_event_id is cleared after deletion — if the
// appointment is later reactivated, a fresh event is created rather than
// trying to resurrect a deleted one.
export async function syncAppointmentToGoogleCalendar(appointmentId: string): Promise<void> {
  const client = getCalendarClient();
  if (!client) return; // Not configured — silently no-op, never blocks booking.

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  try {
    const { data: appt, error } = await supabaseAdmin
      .from("appointments")
      .select("*, service:services(name, duration_minutes)")
      .eq("id", appointmentId)
      .maybeSingle();
    if (error) throw error;
    if (!appt) throw new Error("APPOINTMENT_NOT_FOUND");

    if (appt.status === "cancelled") {
      await deleteGoogleEventIfExists(client, appt.google_event_id);
      await supabaseAdmin
        .from("appointments")
        .update({
          google_event_id: null,
          google_calendar_synced_at: new Date().toISOString(),
          google_calendar_sync_error: null,
        })
        .eq("id", appointmentId);
      return;
    }

    const [{ data: profile }, { data: settings }] = await Promise.all([
      supabaseAdmin.from("profiles").select("email").eq("id", appt.user_id).maybeSingle(),
      supabaseAdmin.from("business_settings").select("address").maybeSingle(),
    ]);

    const eventBody = buildGoogleEvent(
      appt as GoogleSyncAppointmentRow,
      profile?.email ?? null,
      settings?.address ?? null,
    );
    const googleEventId = await upsertGoogleEvent(client, appt.google_event_id, eventBody);

    await supabaseAdmin
      .from("appointments")
      .update({
        google_event_id: googleEventId,
        google_calendar_synced_at: new Date().toISOString(),
        google_calendar_sync_error: null,
      })
      .eq("id", appointmentId);
  } catch (err) {
    console.error("[syncAppointmentToGoogleCalendar] failed for appointment", appointmentId, err);
    const message = err instanceof Error ? err.message : "Unknown Google Calendar error";
    try {
      await supabaseAdmin
        .from("appointments")
        .update({ google_calendar_sync_error: message.slice(0, 500) })
        .eq("id", appointmentId);
    } catch (updateErr) {
      console.error("[syncAppointmentToGoogleCalendar] failed to record sync error", updateErr);
    }
  }
}
