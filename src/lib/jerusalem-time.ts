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
