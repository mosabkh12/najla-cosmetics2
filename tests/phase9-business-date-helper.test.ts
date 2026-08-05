import { afterEach, describe, expect, it, vi } from "vitest";
import { futureOpenDate, pastDateStr, toDateStr } from "./helpers/businessDate";

// Proves the fixed shared test-date helper (tests/helpers/businessDate.ts)
// used by the Phase 4/7 real-Postgres integration suites is safe exactly
// where the original buggy version wasn't: near the UTC/Jerusalem day
// boundary. The original bug was `.getDay()`/`.setDate()` (device-local
// calendar fields) combined with `.toISOString().slice(0, 10)` (UTC
// calendar date) silently disagreeing whenever local "today" and UTC
// "today" fell on different calendar days — which, depending on the
// machine's timezone, could compute a Saturday instead of the intended
// Sunday. The fix removes `.toISOString()` from the final answer
// entirely and anchors "today" to Asia/Jerusalem via jerusalemToday(),
// which is itself Intl-based and DST-safe (see jerusalem-time.test.ts's
// own coverage of that layer).

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

function isSunday(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!).getDay() === 0;
}

describe("Phase 9 — futureOpenDate/pastDateStr near timezone boundaries", () => {
  it("1. always resolves to a Sunday, even when Jerusalem has already rolled over past UTC midnight (winter, UTC+2)", () => {
    // 22:30 UTC on a given day is already 00:30 the NEXT day in
    // Jerusalem (winter, UTC+2) — the exact class of instant that broke
    // the original implementation.
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T22:30:00Z"));
    const date = futureOpenDate(1);
    expect(isSunday(date)).toBe(true);
  });

  it("2. always resolves to a Sunday deep in DST (summer, UTC+3)", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-07-15T21:30:00Z")); // 00:30 Jerusalem
    const date = futureOpenDate(1);
    expect(isSunday(date)).toBe(true);
  });

  it("3. result does not depend on the device/process timezone", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T22:30:00Z"));
    const zones = ["America/New_York", "Asia/Tokyo", "Europe/London", "Asia/Jerusalem", "UTC"];
    const results = zones.map((tz) => {
      process.env.TZ = tz;
      return futureOpenDate(6);
    });
    for (const r of results) expect(r).toBe(results[0]);
    expect(isSunday(results[0]!)).toBe(true);
  });

  it("4. consecutive week numbers are always exactly 7 real days apart across a large range, every one a Sunday", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T22:30:00Z"));
    let previous: Date | null = null;
    for (let week = 1; week <= 40; week++) {
      const dateStr = futureOpenDate(week);
      expect(isSunday(dateStr)).toBe(true);
      const [y, m, d] = dateStr.split("-").map(Number);
      const current = new Date(Date.UTC(y!, m! - 1, d!));
      if (previous) {
        const diffDays = (current.getTime() - previous.getTime()) / 86_400_000;
        expect(diffDays).toBe(7);
      }
      previous = current;
    }
  });

  it("5. remains correct across the Israel DST transition seasons (deep winter vs deep summer)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T10:00:00Z"));
    const winterDate = futureOpenDate(1);
    vi.setSystemTime(new Date("2026-07-15T10:00:00Z"));
    const summerDate = futureOpenDate(1);
    expect(isSunday(winterDate)).toBe(true);
    expect(isSunday(summerDate)).toBe(true);
  });

  it("6. pastDateStr(5) is exactly 5 calendar days before jerusalemToday(), and stays correct near the UTC boundary", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T22:30:00Z")); // Jerusalem: 2026-01-16
    const date = pastDateStr(5);
    expect(date).toBe("2026-01-11");
  });

  it("7. toDateStr never round-trips through UTC (a negative-offset device timezone would previously shift the date)", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T22:30:00Z")); // Jerusalem: 2026-01-16
    process.env.TZ = "America/Los_Angeles";
    const date = futureOpenDate(1);
    expect(isSunday(date)).toBe(true);
    // Independently reconstructing the local date from the string and
    // re-serializing must be a no-op — proves toDateStr and its input
    // agree on the same calendar day under a negative UTC offset too.
    const [y, m, d] = date.split("-").map(Number);
    expect(toDateStr(new Date(y!, m! - 1, d!))).toBe(date);
  });
});
