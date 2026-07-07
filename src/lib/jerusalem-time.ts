// The single source of "what time is it right now, in Israel" — used by
// both server code (booking validation, the admin dashboard) and client
// code (the admin appointments page's "today" grouping) so every part of
// the app agrees on what day/time it is, regardless of the server's own
// timezone or the viewer's browser timezone. Before this existed, the
// admin dashboard computed "today" from UTC instead, which could disagree
// with the rest of the app for a few hours around midnight Israel time.
export function jerusalemNow(): { dateStr: string; minutes: number } {
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

export function jerusalemTodayStr(): string {
  return jerusalemNow().dateStr;
}

// Reverse of the above: given a wall-clock date+time as it reads on a
// clock in Jerusalem (which is what appointment_date/appointment_time are
// — plain local values, no timezone attached), returns the real UTC
// instant it corresponds to. Needed for the calendar feed, where every
// event time must be an unambiguous instant, not a local wall-clock pair.
//
// Standard "double format" technique: guess the instant by treating the
// wall time as if it were already UTC, check what that guess actually
// reads as in Jerusalem, then correct by the difference — this
// automatically accounts for DST since Intl resolves the real rule for
// that specific date, unlike a fixed UTC+2/+3 offset would.
export function jerusalemWallTimeToUtc(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const targetUtcMs = Date.UTC(y, m - 1, d, hh, mm);
  const guess = new Date(targetUtcMs);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const guessReadAsJerusalemMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
  );

  const offsetMs = guessReadAsJerusalemMs - targetUtcMs;
  return new Date(targetUtcMs - offsetMs);
}
