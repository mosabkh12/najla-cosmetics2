import { createServerFn } from "@tanstack/react-start";
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
      const { error } = await supabaseAdmin
        .from("availability_settings")
        .insert(payload);
      if (error) throw error;
    }
    return { success: true };
  });
