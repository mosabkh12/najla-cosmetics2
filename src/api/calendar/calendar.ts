import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "crypto";
import { requireAdmin } from "../admin/middleware";
import { CALENDAR_FEED_PATH } from "@/lib/calendar-feed";

// 32 bytes of randomness, hex-encoded — long enough that guessing it is
// infeasible, short enough to be a normal-looking URL.
function randomToken(): string {
  return randomBytes(32).toString("hex");
}

// Returns the feed's relative path + token, never a full origin — the
// admin's own browser knows its current origin (dev/preview/prod all
// differ), so the client assembles the full URL from that instead of this
// guessing at a canonical domain.
export const getCalendarFeedInfo = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("business_settings")
      .select("id, calendar_feed_token")
      .maybeSingle();

    let token = existing?.calendar_feed_token ?? null;
    if (existing && !token) {
      token = randomToken();
      const { error } = await supabaseAdmin
        .from("business_settings")
        .update({ calendar_feed_token: token })
        .eq("id", existing.id);
      if (error) throw error;
    }

    return { path: CALENDAR_FEED_PATH, token };
  });

// Invalidates the previous URL (e.g. if it was ever shared/leaked) by
// swapping in a fresh token — anyone still using the old link starts
// getting 403s immediately.
export const regenerateCalendarFeedToken = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const token = randomToken();

    const { data: existing } = await supabaseAdmin
      .from("business_settings")
      .select("id")
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("business_settings")
        .update({ calendar_feed_token: token })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("business_settings")
        .insert({ business_name: "Najla Cosmetics", calendar_feed_token: token });
      if (error) throw error;
    }

    return { path: CALENDAR_FEED_PATH, token };
  });
