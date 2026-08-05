import { jerusalemToday } from "@/lib/jerusalem-time";

// Formats via LOCAL getters on an already-Jerusalem-anchored Date, never
// via `.toISOString()` — the exact bug this module replaces was
// `.getDay()`/`.setDate()` (device-local calendar fields) combined with
// `.toISOString().slice(0, 10)` (UTC calendar date) disagreeing near a
// timezone boundary, silently computing a Saturday instead of the
// intended Sunday whenever the two calendars fell on different days.
export function toDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// The Kth (1-indexed) open Sunday from "today" in Asia/Jerusalem terms,
// as a deterministic YYYY-MM-DD string. Built entirely from
// jerusalemToday() (itself Intl/Asia-Jerusalem-based, DST-safe) via
// pure calendar-day arithmetic (setDate/getDate on fixed Y/M/D fields)
// — never touches the device's local timezone or `.toISOString()`, so
// it can't disagree with itself the way the original buggy version
// could. Always 7 real days apart for consecutive weekNumbers, so
// distinct fixtures never alias onto the same calendar date.
export function futureOpenDate(weekNumber: number): string {
  const target = jerusalemToday();
  const daysUntilSunday = (7 - target.getDay()) % 7 || 7; // always 1-7, never 0
  target.setDate(target.getDate() + daysUntilSunday + (weekNumber - 1) * 7);
  return toDateStr(target);
}

// `daysAgo` days before "today" in Asia/Jerusalem terms, same safe
// construction as futureOpenDate.
export function pastDateStr(daysAgo: number): string {
  const target = jerusalemToday();
  target.setDate(target.getDate() - daysAgo);
  return toDateStr(target);
}
