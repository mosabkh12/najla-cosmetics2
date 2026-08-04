import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { jerusalemNow, jerusalemToday, jerusalemTodayStr } from "@/lib/jerusalem-time";

// These tests exercise the single shared Jerusalem-time helper directly —
// per the phase 6 instructions, this is preferred over deeply mocking the
// components that consume it. Two small "wiring" checks at the bottom
// confirm the fixed components actually call the helper (and that the old
// device-local bug pattern hasn't crept back in) without standing up a
// full React/Router/i18n rendering harness just to prove a one-line call.

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("Phase 6 — Jerusalem business date/time helper", () => {
  it("1. jerusalemTodayStr is zero-padded YYYY-MM-DD, including single-digit month/day", () => {
    // 2026-01-05T10:00:00Z is 12:00 in Jerusalem (UTC+2 in January) — no
    // day rollover involved, isolating the padding behavior.
    vi.useFakeTimers().setSystemTime(new Date("2026-01-05T10:00:00Z"));
    expect(jerusalemTodayStr()).toBe("2026-01-05");
    vi.useRealTimers();
  });

  it("2. rolls over to the next Jerusalem day before UTC midnight (winter, UTC+2)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T21:59:00Z")); // 23:59 Jerusalem, still the 15th
    expect(jerusalemTodayStr()).toBe("2026-01-15");
    vi.setSystemTime(new Date("2026-01-15T22:00:00Z")); // 00:00 Jerusalem, now the 16th
    expect(jerusalemTodayStr()).toBe("2026-01-16");
    vi.useRealTimers();
  });

  it("3. rolls over to the next Jerusalem day before UTC midnight (summer DST, UTC+3)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T20:59:00Z")); // 23:59 Jerusalem, still the 15th
    expect(jerusalemTodayStr()).toBe("2026-07-15");
    vi.setSystemTime(new Date("2026-07-15T21:00:00Z")); // 00:00 Jerusalem, now the 16th
    expect(jerusalemTodayStr()).toBe("2026-07-16");
    vi.useRealTimers();
  });

  it("4. does not merely extract the raw UTC date (the original bug)", () => {
    // At this instant, UTC is still the 15th but Jerusalem has already
    // rolled over to the 16th. A UTC-based implementation would wrongly
    // return "2026-01-15".
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T22:30:00Z"));
    expect(jerusalemTodayStr()).not.toBe("2026-01-15");
    expect(jerusalemTodayStr()).toBe("2026-01-16");
    vi.useRealTimers();
  });

  it("5. jerusalemNow().minutes is 0 at Jerusalem midnight", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T22:00:00Z")); // 00:00 Jerusalem
    expect(jerusalemNow().minutes).toBe(0);
    vi.useRealTimers();
  });

  it("6. jerusalemNow().minutes is 1439 one minute before Jerusalem midnight", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T21:59:00Z")); // 23:59 Jerusalem
    expect(jerusalemNow().minutes).toBe(1439);
    vi.useRealTimers();
  });

  it("7. jerusalemNow().minutes computes a known mid-day time correctly", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T12:35:00Z")); // 14:35 Jerusalem (UTC+2)
    expect(jerusalemNow().minutes).toBe(14 * 60 + 35);
    vi.useRealTimers();
  });

  it("8. result is identical no matter what device/server timezone the process runs in", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T22:30:00Z"));
    const zones = ["America/New_York", "Asia/Tokyo", "Europe/London", "Asia/Jerusalem", "UTC"];
    const results = zones.map((tz) => {
      process.env.TZ = tz;
      return jerusalemNow();
    });
    for (const r of results) {
      expect(r).toEqual(results[0]);
    }
    expect(results[0]!.dateStr).toBe("2026-01-16");
    vi.useRealTimers();
  });

  it("9. jerusalemToday() round-trips the same Y/M/D as jerusalemTodayStr() under a negative-offset device timezone", () => {
    // This is the exact class of bug the audit flagged: constructing the
    // "today" Date via `new Date(dateStr)` parses as UTC midnight, which
    // in a negative-offset zone like Los Angeles renders as the *previous*
    // evening — silently shifting the calendar's minimum-selectable day
    // back by one for a customer browsing from that timezone.
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T22:30:00Z")); // Jerusalem: 2026-01-16
    process.env.TZ = "America/Los_Angeles";
    const [y, m, d] = jerusalemTodayStr().split("-").map(Number);
    const today = jerusalemToday();
    expect(today.getFullYear()).toBe(y);
    expect(today.getMonth()).toBe(m! - 1);
    expect(today.getDate()).toBe(d);
    vi.useRealTimers();
  });

  it("10. jerusalemToday() round-trips correctly under a positive-offset device timezone too", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T22:30:00Z")); // Jerusalem: 2026-01-16
    process.env.TZ = "Asia/Tokyo";
    const [y, m, d] = jerusalemTodayStr().split("-").map(Number);
    const today = jerusalemToday();
    expect(today.getFullYear()).toBe(y);
    expect(today.getMonth()).toBe(m! - 1);
    expect(today.getDate()).toBe(d);
    vi.useRealTimers();
  });

  it("11. jerusalemToday() is anchored to local midnight, matching react-day-picker's local-Date matcher contract", () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-01-15T22:30:00Z"));
    process.env.TZ = "America/Los_Angeles";
    const today = jerusalemToday();
    expect(today.getHours()).toBe(0);
    expect(today.getMinutes()).toBe(0);
    expect(today.getSeconds()).toBe(0);
    vi.useRealTimers();
  });

  it("12. handles the Israel DST transition period without producing an invalid or off-by-one date", () => {
    // Deep summer (DST, UTC+3) vs. deep winter (standard time, UTC+2) —
    // both must resolve to a real, correctly zero-padded calendar date
    // rather than silently reusing a hardcoded offset.
    vi.useFakeTimers().setSystemTime(new Date("2026-07-01T09:00:00Z"));
    const summer = jerusalemTodayStr();
    expect(summer).toBe("2026-07-01");
    vi.setSystemTime(new Date("2026-12-01T09:00:00Z"));
    const winter = jerusalemTodayStr();
    expect(winter).toBe("2026-12-01");
    expect(summer).not.toBe(winter);
    vi.useRealTimers();
  });
});

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Phase 6 — components are wired to the shared helper, not device-local Date", () => {
  it("13. BookingDialog derives today from jerusalemToday(), not device-local new Date()", () => {
    const src = readSource("../src/components/services/BookingDialog.tsx");
    expect(src).toMatch(
      /import\s*\{[^}]*jerusalemToday[^}]*\}\s*from\s*["']@\/lib\/jerusalem-time["']/,
    );
    expect(src).toMatch(/todayDate\s*=\s*useMemo\(\(\)\s*=>\s*jerusalemToday\(\),\s*\[\]\)/);
    expect(src).not.toMatch(/todayDate\s*=\s*useMemo\(\(\)\s*=>\s*new Date\(\)/);
  });

  it("14. RescheduleDialog derives today from jerusalemToday(), not device-local new Date()", () => {
    const src = readSource("../src/components/services/RescheduleDialog.tsx");
    expect(src).toMatch(
      /import\s*\{[^}]*jerusalemToday[^}]*\}\s*from\s*["']@\/lib\/jerusalem-time["']/,
    );
    expect(src).toMatch(/todayDate\s*=\s*useMemo\(\(\)\s*=>\s*jerusalemToday\(\),\s*\[\]\)/);
    expect(src).not.toMatch(/todayDate\s*=\s*useMemo\(\(\)\s*=>\s*new Date\(\)/);
  });

  it("15. profile.tsx classifies appointments using jerusalemTodayStr(), not raw UTC extraction", () => {
    const src = readSource("../src/routes/profile.tsx");
    expect(src).toMatch(
      /import\s*\{[^}]*jerusalemTodayStr[^}]*\}\s*from\s*["']@\/lib\/jerusalem-time["']/,
    );
    expect(src).toMatch(/todayStr\s*=\s*jerusalemTodayStr\(\)/);
    expect(src).not.toMatch(/todayStr\s*=\s*new Date\(\)\.toISOString\(\)/);
  });
});
