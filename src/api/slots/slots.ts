import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireAdmin } from "../admin/middleware";

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
    return { success: true };
  });
