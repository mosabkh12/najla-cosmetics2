import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin } from "../admin/middleware";
import type { SupabaseAdmin } from "@/integrations/supabase/client.server";
import { jerusalemTodayStr } from "@/lib/jerusalem-time";
import { toMinutes } from "@/lib/time-minutes";

export interface DayHours {
  enabled: boolean;
  open: string;
  close: string;
}

export interface AvailabilitySettings {
  weekly_hours: Record<string, DayHours>;
  breaks: { start: string; end: string }[];
  slot_interval: number;
  buffer_minutes: number;
  max_per_day: number | null;
  closed_dates: string[];
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_KEYS = ["0", "1", "2", "3", "4", "5", "6"];
const MAX_SLOT_INTERVAL_MINUTES = 480;

// Unlike every other write path in this app, this table's JSONB columns
// (weekly_hours/breaks/closed_dates) were never validated anywhere — not
// here, not at the database level (they're plain jsonb columns with no
// shape constraint). A malformed value wouldn't fail at save time; it
// would surface as a raw, unmapped Postgres cast error the next time a
// customer tries to book (create_appointment/reschedule_appointment parse
// these fields directly), potentially breaking the booking flow entirely
// until manually corrected. This validates the shape before anything is
// written, so a bad save fails immediately and clearly instead.
function validateAvailabilityPayload(data: {
  weekly_hours: Record<string, DayHours>;
  breaks: { start: string; end: string }[];
  slot_interval: number;
  buffer_minutes: number;
  max_per_day: number | null;
  closed_dates: string[];
}): void {
  if (!data.weekly_hours || typeof data.weekly_hours !== "object") {
    throw new Error("INVALID_SETTINGS");
  }
  for (const key of DAY_KEYS) {
    const day = data.weekly_hours[key];
    if (!day || typeof day.enabled !== "boolean") throw new Error("INVALID_SETTINGS");
    if (day.enabled) {
      if (!TIME_RE.test(day.open) || !TIME_RE.test(day.close)) throw new Error("INVALID_SETTINGS");
      if (day.open >= day.close) throw new Error("INVALID_SETTINGS");
    }
  }

  if (!Array.isArray(data.breaks)) throw new Error("INVALID_SETTINGS");
  for (const b of data.breaks) {
    if (!b || !TIME_RE.test(b.start) || !TIME_RE.test(b.end) || b.start >= b.end) {
      throw new Error("INVALID_SETTINGS");
    }
  }

  if (
    !Array.isArray(data.closed_dates) ||
    !data.closed_dates.every((d) => typeof d === "string" && DATE_RE.test(d))
  ) {
    throw new Error("INVALID_SETTINGS");
  }

  if (
    !Number.isInteger(data.slot_interval) ||
    data.slot_interval <= 0 ||
    data.slot_interval > MAX_SLOT_INTERVAL_MINUTES
  ) {
    throw new Error("INVALID_SETTINGS");
  }
  if (!Number.isInteger(data.buffer_minutes) || data.buffer_minutes < 0) {
    throw new Error("INVALID_SETTINGS");
  }
  if (data.max_per_day !== null && (!Number.isInteger(data.max_per_day) || data.max_per_day <= 0)) {
    throw new Error("INVALID_SETTINGS");
  }
}

export const DEFAULT_WEEKLY: Record<string, DayHours> = {
  "0": { enabled: true, open: "09:00", close: "19:00" },
  "1": { enabled: true, open: "09:00", close: "19:00" },
  "2": { enabled: true, open: "09:00", close: "19:00" },
  "3": { enabled: true, open: "09:00", close: "19:00" },
  "4": { enabled: true, open: "09:00", close: "19:00" },
  "5": { enabled: true, open: "09:00", close: "15:00" },
  "6": { enabled: false, open: "09:00", close: "19:00" },
};

export const getAvailabilitySettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<AvailabilitySettings> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("availability_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    // Which days are open/closed must reflect an admin change immediately —
    // now shown live on the home/location pages, not just used inside the
    // booking flow — so this stays uncached, same as getAvailableTimes in
    // appointments.ts. A shared HTTP cache here previously meant a day the
    // admin just closed could still show as open for up to a minute.
    setResponseHeader("Cache-Control", "no-store");
    if (!data)
      return {
        weekly_hours: DEFAULT_WEEKLY,
        breaks: [],
        slot_interval: 30,
        buffer_minutes: 0,
        max_per_day: null,
        closed_dates: [],
      };
    return {
      weekly_hours: (data.weekly_hours ?? DEFAULT_WEEKLY) as Record<string, DayHours>,
      breaks: (data.breaks ?? []) as { start: string; end: string }[],
      slot_interval: data.slot_interval ?? 30,
      buffer_minutes: data.buffer_minutes ?? 0,
      max_per_day: data.max_per_day ?? null,
      closed_dates: (data.closed_dates ?? []) as string[],
    };
  },
);

export interface ConflictingAppointment {
  id: string;
  user_id: string;
  customer_name: string;
  appointment_date: string;
  appointment_time: string;
  service_name: string;
}

type ProposedAvailability = Pick<AvailabilitySettings, "weekly_hours" | "breaks" | "closed_dates">;

// True when an appointment at [startMinutes, endMinutes) on dateStr would no
// longer be bookable under the given (possibly not-yet-saved) settings —
// the day is closed/disabled, the date is in closed_dates, the time falls
// outside open/close, or it now overlaps a break.
function isBlockedUnder(
  proposed: ProposedAvailability,
  dateStr: string,
  startMinutes: number,
  endMinutes: number,
): boolean {
  if (proposed.closed_dates.includes(dateStr)) return true;

  const [y, m, d] = dateStr.split("-").map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay();
  const day = proposed.weekly_hours[String(dayOfWeek)];
  if (!day?.enabled) return true;

  if (startMinutes < toMinutes(day.open) || endMinutes > toMinutes(day.close)) return true;

  return proposed.breaks.some((b) => {
    const breakStart = toMinutes(b.start);
    const breakEnd = toMinutes(b.end);
    return startMinutes < breakEnd && breakStart < endMinutes;
  });
}

// Every still-active (pending/confirmed), today-or-later appointment that
// would fall outside the given proposed settings — i.e. what saving them
// as-is would silently orphan. Always recomputed fresh from the database
// rather than trusting a client-supplied list, since an appointment could
// have been created/cancelled/rescheduled between an admin previewing this
// and actually confirming the save.
async function findConflictingAppointments(
  supabaseAdmin: SupabaseAdmin,
  proposed: ProposedAvailability,
): Promise<ConflictingAppointment[]> {
  const { data } = await supabaseAdmin
    .from("appointments")
    .select(
      "id, user_id, customer_name, appointment_date, appointment_time, services(name, duration_minutes)",
    )
    .in("status", ["pending", "confirmed"])
    .gte("appointment_date", jerusalemTodayStr());

  const conflicts: ConflictingAppointment[] = [];
  for (const a of data ?? []) {
    const start = toMinutes(String(a.appointment_time));
    const duration = a.services?.duration_minutes ?? 30;
    if (isBlockedUnder(proposed, a.appointment_date, start, start + duration)) {
      conflicts.push({
        id: a.id,
        user_id: a.user_id,
        customer_name: a.customer_name,
        appointment_date: a.appointment_date,
        appointment_time: String(a.appointment_time),
        service_name: a.services?.name ?? "",
      });
    }
  }
  return conflicts;
}

// Read-only preview so the admin UI can warn "this will cancel N
// appointments" and let the admin back out before anything actually
// changes. The real, authoritative check runs again inside
// updateAvailabilitySettings itself — this is purely advisory.
export const previewAvailabilityConflicts = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    (d: {
      weekly_hours: Record<string, DayHours>;
      breaks: { start: string; end: string }[];
      closed_dates: string[];
    }) => d,
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return findConflictingAppointments(supabaseAdmin, data);
  });

async function notifyCancelledAppointments(
  supabaseAdmin: SupabaseAdmin,
  conflicts: ConflictingAppointment[],
) {
  const { sendAvailabilityCancellationEmail } = await import("@/api/email/appointment-emails");
  for (const c of conflicts) {
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("id", c.user_id)
        .maybeSingle();
      if (profile?.email) {
        await sendAvailabilityCancellationEmail({
          customerName: c.customer_name,
          customerEmail: profile.email,
          serviceName: c.service_name,
          date: c.appointment_date,
          time: c.appointment_time,
        });
      }
    } catch (e) {
      console.error("[updateAvailabilitySettings] failed to notify", c.id, e);
    }
  }
}

export const updateAvailabilitySettings = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    (d: {
      weekly_hours: Record<string, DayHours>;
      breaks: { start: string; end: string }[];
      slot_interval: number;
      buffer_minutes: number;
      max_per_day: number | null;
      closed_dates: string[];
    }) => d,
  )
  .handler(async ({ data }) => {
    validateAvailabilityPayload(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("availability_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    const payload = {
      weekly_hours: data.weekly_hours as unknown as import("@/integrations/supabase/types").Json,
      breaks: data.breaks as unknown as import("@/integrations/supabase/types").Json,
      slot_interval: data.slot_interval,
      buffer_minutes: data.buffer_minutes,
      max_per_day: data.max_per_day,
      closed_dates: data.closed_dates as unknown as import("@/integrations/supabase/types").Json,
    };

    // Computed BEFORE writing the new settings, against the same proposed
    // shape the admin already saw in the preview — not re-read from the
    // database after saving, so this can't miss anything (once the new
    // settings are live, findConflictingAppointments would just be
    // checking appointments against themselves).
    const conflicts = await findConflictingAppointments(supabaseAdmin, data);

    if (existing) {
      const { error } = await supabaseAdmin
        .from("availability_settings")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("availability_settings").insert(payload);
      if (error) throw error;
    }

    let cancelledAppointments: ConflictingAppointment[] = [];
    if (conflicts.length > 0) {
      const { error: cancelError } = await supabaseAdmin
        .from("appointments")
        .update({ status: "cancelled" as const })
        .in(
          "id",
          conflicts.map((c) => c.id),
        );
      if (cancelError) {
        console.error(
          "[updateAvailabilitySettings] settings saved but failed to cancel conflicting appointments",
          cancelError,
        );
      } else {
        cancelledAppointments = conflicts;
        notifyCancelledAppointments(supabaseAdmin, conflicts).catch((e) =>
          console.error("[updateAvailabilitySettings] notification pass failed", e),
        );
      }
    }

    return { success: true, cancelledAppointments };
  });
