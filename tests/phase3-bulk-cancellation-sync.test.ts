import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createMockSupabaseAdmin } from "./helpers/mockSupabase";
import { ok, fail, createDeferred, flushAsync } from "./helpers/mockSupabase";
import { TEST_USER_ID } from "./helpers/mockMiddleware";

vi.mock("@tanstack/react-start", async () => {
  const fake = await import("./helpers/fakeTanstackStart");
  return { createServerFn: fake.createServerFn, createMiddleware: fake.createMiddleware };
});

vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", async () => {
  const { createMockSupabaseAdmin } = await import("./helpers/mockSupabase");
  const mock = createMockSupabaseAdmin();
  return { supabaseAdmin: mock.client, __mock: mock };
});

vi.mock("@/api/admin/middleware", async () => {
  const { fakeRequireAdmin } = await import("./helpers/mockMiddleware");
  const { createMockSupabaseAdmin } = await import("./helpers/mockSupabase");
  const mock = createMockSupabaseAdmin();
  return { requireAdmin: fakeRequireAdmin(mock.client, TEST_USER_ID) };
});

vi.mock("@/api/email/appointment-emails", () => ({
  sendAvailabilityCancellationEmail: vi.fn(async () => {}),
}));

vi.mock("@/integrations/google/calendar.server", () => ({
  syncAppointmentToGoogleCalendar: vi.fn(async () => {}),
}));

type MockHandle = ReturnType<typeof createMockSupabaseAdmin>;

async function getMock(): Promise<MockHandle> {
  const mod = (await import("@/integrations/supabase/client.server")) as unknown as {
    __mock: MockHandle;
  };
  return mod.__mock;
}

async function getCalendarMock() {
  return import("@/integrations/google/calendar.server") as unknown as {
    syncAppointmentToGoogleCalendar: ReturnType<typeof vi.fn>;
  };
}

async function getEmailMock() {
  return import("@/api/email/appointment-emails") as unknown as {
    sendAvailabilityCancellationEmail: ReturnType<typeof vi.fn>;
  };
}

beforeEach(async () => {
  (await getMock()).reset();
  vi.clearAllMocks();
});

const OPEN_ALL_WEEK = {
  "0": { enabled: true, open: "09:00", close: "19:00" },
  "1": { enabled: true, open: "09:00", close: "19:00" },
  "2": { enabled: true, open: "09:00", close: "19:00" },
  "3": { enabled: true, open: "09:00", close: "19:00" },
  "4": { enabled: true, open: "09:00", close: "19:00" },
  "5": { enabled: true, open: "09:00", close: "19:00" },
  "6": { enabled: true, open: "09:00", close: "19:00" },
};

function makePayload(closedDates: string[]) {
  return {
    weekly_hours: OPEN_ALL_WEEK,
    breaks: [],
    slot_interval: 30,
    buffer_minutes: 0,
    max_per_day: null as number | null,
    closed_dates: closedDates,
  };
}

// A conflicting appointment: its date is in the proposed closed_dates, so
// isBlockedUnder() flags it regardless of time.
function conflictRow(id: string, date: string) {
  return {
    id,
    user_id: `user-${id}`,
    customer_name: `Customer ${id}`,
    appointment_date: date,
    appointment_time: "10:00:00",
    duration_minutes: 30,
    service_name: "Facial",
  };
}

async function primeSuccessfulSettingsSave(mock: MockHandle, appointmentRows: unknown[]) {
  mock.queueFrom("availability_settings", () => ok({ id: "settings-1" })); // existing row lookup
  mock.queueFrom("appointments", () => ok(appointmentRows)); // findConflictingAppointments
  mock.queueFrom("availability_settings", () => ok(null)); // the actual settings UPDATE
}

describe("Phase 3 — updateAvailabilitySettings bulk-cancellation Calendar sync", () => {
  it("1. cancels conflicting appointments before attempting any Calendar sync", async () => {
    const mock = await getMock();
    const order: string[] = [];

    await primeSuccessfulSettingsSave(mock, [conflictRow("a1", "2026-02-01")]);
    // The cancel-status UPDATE — its resolver records that the DB write
    // happened before recording completion.
    mock.queueFrom("appointments", () => {
      order.push("db-cancel");
      return ok(null);
    });
    mock.queueFrom("appointments", () => ok([{ id: "a1", google_calendar_sync_error: null }]));

    const calendar = await getCalendarMock();
    calendar.syncAppointmentToGoogleCalendar.mockImplementation(async () => {
      order.push("calendar-sync");
    });

    const { updateAvailabilitySettings } = await import("@/api/slots/slots");
    await updateAvailabilitySettings({ data: makePayload(["2026-02-01"]) });

    expect(order).toEqual(["db-cancel", "calendar-sync"]);
  });

  it("2. every successfully cancelled appointment gets a Calendar sync attempt", async () => {
    const mock = await getMock();
    const rows = [conflictRow("a1", "2026-02-01"), conflictRow("a2", "2026-02-01")];
    await primeSuccessfulSettingsSave(mock, rows);
    mock.queueFrom("appointments", () => ok(null)); // cancel UPDATE
    mock.queueFrom("appointments", () =>
      ok([
        { id: "a1", google_calendar_sync_error: null },
        { id: "a2", google_calendar_sync_error: null },
      ]),
    );

    const calendar = await getCalendarMock();
    const { updateAvailabilitySettings } = await import("@/api/slots/slots");
    const result = await updateAvailabilitySettings({ data: makePayload(["2026-02-01"]) });

    expect(calendar.syncAppointmentToGoogleCalendar).toHaveBeenCalledWith("a1");
    expect(calendar.syncAppointmentToGoogleCalendar).toHaveBeenCalledWith("a2");
    expect(calendar.syncAppointmentToGoogleCalendar).toHaveBeenCalledTimes(2);
    expect(result.cancelledAppointments.map((c) => c.id).sort()).toEqual(["a1", "a2"]);
  });

  it("3. an appointment that is not a conflict under the new settings is not synchronized", async () => {
    const mock = await getMock();
    const rows = [
      conflictRow("a1", "2026-02-01"), // in closed_dates -> conflict
      conflictRow("a2", "2026-02-02"), // not in closed_dates -> still bookable
    ];
    await primeSuccessfulSettingsSave(mock, rows);
    mock.queueFrom("appointments", () => ok(null)); // cancel UPDATE (only a1)
    mock.queueFrom("appointments", () => ok([{ id: "a1", google_calendar_sync_error: null }]));

    const calendar = await getCalendarMock();
    const { updateAvailabilitySettings } = await import("@/api/slots/slots");
    const result = await updateAvailabilitySettings({ data: makePayload(["2026-02-01"]) });

    expect(calendar.syncAppointmentToGoogleCalendar).toHaveBeenCalledWith("a1");
    expect(calendar.syncAppointmentToGoogleCalendar).not.toHaveBeenCalledWith("a2");
    expect(calendar.syncAppointmentToGoogleCalendar).toHaveBeenCalledTimes(1);
    expect(result.cancelledAppointments.map((c) => c.id)).toEqual(["a1"]);
  });

  it("4. no more than three Calendar sync calls run concurrently", async () => {
    const mock = await getMock();
    const ids = ["a1", "a2", "a3", "a4", "a5"];
    const rows = ids.map((id) => conflictRow(id, "2026-02-01"));
    await primeSuccessfulSettingsSave(mock, rows);
    mock.queueFrom("appointments", () => ok(null)); // cancel UPDATE
    mock.queueFrom("appointments", () =>
      ok(ids.map((id) => ({ id, google_calendar_sync_error: null }))),
    );

    const calendar = await getCalendarMock();
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    calendar.syncAppointmentToGoogleCalendar.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
    });

    const { updateAvailabilitySettings } = await import("@/api/slots/slots");
    const resultPromise = updateAvailabilitySettings({ data: makePayload(["2026-02-01"]) });

    await flushAsync();
    expect(active).toBe(3); // exactly the concurrency cap, not more
    releases.splice(0).forEach((r) => r());

    await flushAsync();
    // Second wave: the remaining 2 items.
    expect(active).toBeLessThanOrEqual(2);
    releases.splice(0).forEach((r) => r());

    await resultPromise;

    expect(maxActive).toBe(3);
    expect(calendar.syncAppointmentToGoogleCalendar).toHaveBeenCalledTimes(5);
  });

  it("5. a rejecting Calendar sync does not roll back the database cancellation", async () => {
    const mock = await getMock();
    const rows = [conflictRow("a1", "2026-02-01")];
    await primeSuccessfulSettingsSave(mock, rows);
    mock.queueFrom("appointments", () => ok(null)); // cancel UPDATE succeeds
    mock.queueFrom("appointments", () => ok([{ id: "a1", google_calendar_sync_error: "boom" }]));

    const calendar = await getCalendarMock();
    calendar.syncAppointmentToGoogleCalendar.mockRejectedValue(new Error("Google outage"));

    const { updateAvailabilitySettings } = await import("@/api/slots/slots");
    const result = await updateAvailabilitySettings({ data: makePayload(["2026-02-01"]) });

    // The function resolved successfully and still reports the
    // already-committed cancellation — a Calendar failure never
    // surfaces as a failure of this request.
    expect(result.success).toBe(true);
    expect(result.cancelledAppointments.map((c) => c.id)).toEqual(["a1"]);
  });

  it("6. an unexpected thrown sync failure is counted as failed even with no persisted error", async () => {
    const mock = await getMock();
    const rows = [conflictRow("a1", "2026-02-01")];
    await primeSuccessfulSettingsSave(mock, rows);
    mock.queueFrom("appointments", () => ok(null)); // cancel UPDATE
    // Verification query shows NO persisted error for a1, simulating a
    // throw that happened before syncAppointmentToGoogleCalendar's own
    // internal try/catch could record anything.
    mock.queueFrom("appointments", () => ok([{ id: "a1", google_calendar_sync_error: null }]));

    const calendar = await getCalendarMock();
    calendar.syncAppointmentToGoogleCalendar.mockRejectedValue(
      new Error("threw before recording anything"),
    );

    const { updateAvailabilitySettings } = await import("@/api/slots/slots");
    const result = await updateAvailabilitySettings({ data: makePayload(["2026-02-01"]) });

    expect(result.googleCalendarSyncAttempted).toBe(1);
    expect(result.googleCalendarSyncFailed).toBe(1);
  });

  it("7. a persisted google_calendar_sync_error is counted as failed", async () => {
    const mock = await getMock();
    const rows = [conflictRow("a1", "2026-02-01")];
    await primeSuccessfulSettingsSave(mock, rows);
    mock.queueFrom("appointments", () => ok(null)); // cancel UPDATE
    mock.queueFrom("appointments", () =>
      ok([{ id: "a1", google_calendar_sync_error: "Google Calendar quota exceeded" }]),
    );

    const calendar = await getCalendarMock();
    // Resolves normally (no throw) — exactly like the real
    // syncAppointmentToGoogleCalendar, which catches its own errors and
    // never rethrows, only persisting google_calendar_sync_error.
    calendar.syncAppointmentToGoogleCalendar.mockResolvedValue(undefined);

    const { updateAvailabilitySettings } = await import("@/api/slots/slots");
    const result = await updateAvailabilitySettings({ data: makePayload(["2026-02-01"]) });

    expect(result.googleCalendarSyncAttempted).toBe(1);
    expect(result.googleCalendarSyncFailed).toBe(1);
  });

  it("8. an appointment that both throws and has a persisted error is not double-counted", async () => {
    const mock = await getMock();
    const rows = [conflictRow("a1", "2026-02-01")];
    await primeSuccessfulSettingsSave(mock, rows);
    mock.queueFrom("appointments", () => ok(null)); // cancel UPDATE
    mock.queueFrom("appointments", () =>
      ok([{ id: "a1", google_calendar_sync_error: "also persisted an error" }]),
    );

    const calendar = await getCalendarMock();
    calendar.syncAppointmentToGoogleCalendar.mockRejectedValue(new Error("threw too"));

    const { updateAvailabilitySettings } = await import("@/api/slots/slots");
    const result = await updateAvailabilitySettings({ data: makePayload(["2026-02-01"]) });

    // Only 1 conflict existed — a double-count would show 2.
    expect(result.googleCalendarSyncFailed).toBe(1);
  });

  it("9. a failed verification query reports an unknown failure count, not zero", async () => {
    const mock = await getMock();
    const rows = [conflictRow("a1", "2026-02-01")];
    await primeSuccessfulSettingsSave(mock, rows);
    mock.queueFrom("appointments", () => ok(null)); // cancel UPDATE
    mock.queueFrom("appointments", () => fail({ code: "500", message: "connection reset" }));

    const calendar = await getCalendarMock();
    calendar.syncAppointmentToGoogleCalendar.mockResolvedValue(undefined);

    const { updateAvailabilitySettings } = await import("@/api/slots/slots");
    const result = await updateAvailabilitySettings({ data: makePayload(["2026-02-01"]) });

    expect(result.googleCalendarSyncAttempted).toBe(1);
    expect(result.googleCalendarSyncFailed).toBeNull();
  });

  it("11. cancellation emails are not duplicated by the Calendar-sync logic", async () => {
    const mock = await getMock();
    const rows = [conflictRow("a1", "2026-02-01")];
    await primeSuccessfulSettingsSave(mock, rows);
    mock.queueFrom("appointments", () => ok(null)); // cancel UPDATE
    // notifyCancelledAppointments's own profile lookup (fire-and-forget).
    mock.queueFrom("profiles", () => ok({ email: "customer@example.com", language: "en" }));
    mock.queueFrom("appointments", () => ok([{ id: "a1", google_calendar_sync_error: null }]));

    const calendar = await getCalendarMock();
    calendar.syncAppointmentToGoogleCalendar.mockResolvedValue(undefined);
    const emailMock = await getEmailMock();

    const { updateAvailabilitySettings } = await import("@/api/slots/slots");
    await updateAvailabilitySettings({ data: makePayload(["2026-02-01"]) });
    // The email pass is fire-and-forget; give its microtask chain a tick
    // to finish before asserting the call count.
    await flushAsync();
    await flushAsync();

    expect(emailMock.sendAvailabilityCancellationEmail).toHaveBeenCalledTimes(1);
  });

  it("12. the returned summary accurately reports cancelled/attempted/failed counts", async () => {
    const mock = await getMock();
    const rows = [
      conflictRow("a1", "2026-02-01"),
      conflictRow("a2", "2026-02-01"),
      conflictRow("a3", "2026-02-01"),
    ];
    await primeSuccessfulSettingsSave(mock, rows);
    mock.queueFrom("appointments", () => ok(null)); // cancel UPDATE
    mock.queueFrom("appointments", () =>
      ok([
        { id: "a1", google_calendar_sync_error: null }, // succeeded
        { id: "a2", google_calendar_sync_error: "failed to sync" }, // failed
        { id: "a3", google_calendar_sync_error: null }, // succeeded
      ]),
    );

    const calendar = await getCalendarMock();
    calendar.syncAppointmentToGoogleCalendar.mockResolvedValue(undefined);

    const { updateAvailabilitySettings } = await import("@/api/slots/slots");
    const result = await updateAvailabilitySettings({ data: makePayload(["2026-02-01"]) });

    expect(result.cancelledAppointments.map((c) => c.id).sort()).toEqual(["a1", "a2", "a3"]);
    expect(result.googleCalendarSyncAttempted).toBe(3);
    expect(result.googleCalendarSyncFailed).toBe(1);
  });
});
