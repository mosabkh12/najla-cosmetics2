import type { Lang } from "@/lib/i18n";
import type { DayHours } from "@/api/slots/slots";

// The single place day names are translated — both the admin Availability
// page and every public page that displays real business hours import
// this, so there's exactly one Hebrew/Arabic/English spelling of each day
// instead of copies that could quietly drift apart.
export const DAY_NAMES: Record<string, [string, string, string]> = {
  "0": ["ראשון", "الأحد", "Sunday"],
  "1": ["שני", "الإثنين", "Monday"],
  "2": ["שלישי", "الثلاثاء", "Tuesday"],
  "3": ["רביעי", "الأربعاء", "Wednesday"],
  "4": ["חמישי", "الخميس", "Thursday"],
  "5": ["שישי", "الجمعة", "Friday"],
  "6": ["שבת", "السبت", "Saturday"],
};

export function dayName(d: string, lang: Lang): string {
  const n = DAY_NAMES[d];
  if (!n) return d;
  return lang === "ar" ? n[1] : lang === "en" ? n[2] : n[0];
}

export interface HoursLine {
  label: string;
  text: string;
}

const WEEK_ORDER = ["0", "1", "2", "3", "4", "5", "6"];

// Groups consecutive days (Sun→Sat, no wraparound) that share the exact
// same open/close/enabled state into one line — e.g. four identical
// weekdays render as "Sun–Wed: 09:00–19:00" instead of four separate rows.
// This is the ONE place that turns the real availability_settings data
// into customer-facing text — the public pages must never hardcode hours
// themselves, or they can silently drift out of sync with what's actually
// bookable (which is exactly what happened before this existed).
export function formatWeeklyHours(
  weekly: Record<string, DayHours>,
  lang: Lang,
  closedLabel: string,
): HoursLine[] {
  const lines: HoursLine[] = [];
  let i = 0;
  while (i < WEEK_ORDER.length) {
    const day = weekly[WEEK_ORDER[i]];
    let j = i;
    while (j + 1 < WEEK_ORDER.length) {
      const next = weekly[WEEK_ORDER[j + 1]];
      const same =
        !!next &&
        !!day &&
        next.enabled === day.enabled &&
        next.open === day.open &&
        next.close === day.close;
      if (!same) break;
      j++;
    }

    const startName = dayName(WEEK_ORDER[i], lang);
    const label = i === j ? startName : `${startName}–${dayName(WEEK_ORDER[j], lang)}`;
    const text = day?.enabled ? `${day.open}–${day.close}` : closedLabel;
    lines.push({ label, text });
    i = j + 1;
  }
  return lines;
}
