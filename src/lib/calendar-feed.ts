import { jerusalemWallTimeToUtc } from "./jerusalem-time";

// The stable, permanent path calendar apps poll. Deliberately handled
// outside TanStack Start's normal server-function dispatch (see server.ts)
// — server functions get a build-hashed URL that isn't guaranteed stable
// across deploys, which would silently break a subscription a phone's
// Calendar app already saved.
export const CALENDAR_FEED_PATH = "/calendar/appointments.ics";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// UTC "floating" form (trailing Z) — required so every calendar app agrees
// on the exact instant regardless of its own configured timezone.
function toIcsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// RFC 5545 §3.3.11: backslash-escape commas, semicolons, and backslashes;
// literal newlines become the two-character sequence "\n".
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

interface FeedAppointment {
  id: string;
  customer_name: string;
  customer_phone: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  service_name: string;
  duration_minutes: number;
}

export function buildIcsFeed(
  appointments: FeedAppointment[],
  businessName: string,
  address: string | null,
): string {
  const now = toIcsUtc(new Date());
  const events = appointments.map((a) => {
    const start = jerusalemWallTimeToUtc(a.appointment_date, a.appointment_time.slice(0, 5));
    const end = new Date(start.getTime() + a.duration_minutes * 60_000);
    const summary = `${a.customer_name} — ${a.service_name}`;
    const description = [`Phone: ${a.customer_phone}`, `Status: ${a.status}`].join("\n");
    return [
      "BEGIN:VEVENT",
      `UID:${a.id}@najla-cosmetics`,
      `DTSTAMP:${now}`,
      `DTSTART:${toIcsUtc(start)}`,
      `DTEND:${toIcsUtc(end)}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      ...(address ? [`LOCATION:${escapeIcsText(address)}`] : []),
      "END:VEVENT",
    ].join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Najla Cosmetics//Appointments//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(businessName)} — Appointments`,
    // Hint some clients (notably Google Calendar) respect for how often to
    // re-poll the feed — best-effort, not guaranteed to be honored.
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

// Serves the feed directly, bypassing TanStack Start's router entirely —
// see server.ts for why. Returns null for any request that isn't this
// exact path, so the caller can fall through to normal handling.
export async function handleCalendarFeedRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== CALENDAR_FEED_PATH) return null;

  const token = url.searchParams.get("token");
  if (!token) return new Response("Forbidden", { status: 403 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { jerusalemTodayStr } = await import("./jerusalem-time");

  const { data: settings } = await supabaseAdmin
    .from("business_settings")
    .select("business_name, address, calendar_feed_token")
    .maybeSingle();

  if (!settings?.calendar_feed_token || settings.calendar_feed_token !== token) {
    return new Response("Forbidden", { status: 403 });
  }

  // A lean, actionable window: recently past (in case the admin checks
  // what just happened) through the next 6 months, excluding cancelled
  // appointments so the feed reflects what's actually going to happen.
  const todayStr = jerusalemTodayStr();
  const [y, m, d] = todayStr.split("-").map(Number);
  const windowStart = new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
  const windowEnd = new Date(Date.UTC(y, m - 1, d + 180)).toISOString().slice(0, 10);

  const { data } = await supabaseAdmin
    .from("appointments")
    .select(
      "id, customer_name, customer_phone, appointment_date, appointment_time, status, services(name, duration_minutes)",
    )
    .neq("status", "cancelled")
    .gte("appointment_date", windowStart)
    .lte("appointment_date", windowEnd)
    .order("appointment_date")
    .order("appointment_time");

  const appointments: FeedAppointment[] = (data ?? []).map((a) => ({
    id: a.id,
    customer_name: a.customer_name,
    customer_phone: a.customer_phone,
    appointment_date: a.appointment_date,
    appointment_time: String(a.appointment_time),
    status: a.status,
    service_name: a.services?.name ?? "Appointment",
    duration_minutes: a.services?.duration_minutes ?? 30,
  }));

  const body = buildIcsFeed(appointments, settings.business_name, settings.address);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="appointments.ics"',
      // Calendar apps poll this on their own schedule — must always be
      // fresh, never cached by a shared/browser cache.
      "Cache-Control": "no-store",
    },
  });
}
