import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createMockSupabaseAdmin } from "./helpers/mockSupabase";
import { ok } from "./helpers/mockSupabase";

// Layer B: tests the REAL syncAppointmentToGoogleCalendar (not a mock of
// it, as in the appointments.ts tests) — its own compare-and-swap logic
// is exactly what Phase 2's review added. Only the actual external
// network boundary (the Google Calendar API client) and the Supabase
// client are mocked; every line of calendar.server.ts's own logic runs
// for real.
vi.mock("@googleapis/calendar", () => {
  const events = { insert: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const calendarClient = { events };
  // Must be a real class, not a vi.fn()-wrapped arrow function — the
  // source code calls `new auth.OAuth2(...)`, which requires something
  // constructible.
  class FakeOAuth2 {
    setCredentials = vi.fn();
  }
  return {
    calendar: vi.fn(() => calendarClient),
    auth: { OAuth2: FakeOAuth2 },
    __events: events,
  };
});

vi.mock("@/integrations/supabase/client.server", async () => {
  const { createMockSupabaseAdmin } = await import("./helpers/mockSupabase");
  const mock = createMockSupabaseAdmin();
  return { supabaseAdmin: mock.client, __mock: mock };
});

type MockHandle = ReturnType<typeof createMockSupabaseAdmin>;

async function getMock(): Promise<MockHandle> {
  const mod = (await import("@/integrations/supabase/client.server")) as unknown as {
    __mock: MockHandle;
  };
  return mod.__mock;
}

async function getGoogleEvents() {
  const mod = (await import("@googleapis/calendar")) as unknown as {
    __events: {
      insert: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
  return mod.__events;
}

function fromBuildersForTable(mock: MockHandle, table: string) {
  return mock.from.mock.calls
    .map((call, i) => (call[0] === table ? mock.from.mock.results[i]!.value : undefined))
    .filter((b): b is ReturnType<MockHandle["from"]> => b !== undefined) as Array<{
    eq: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  }>;
}

const BASE_APPT = {
  id: "appt-1",
  user_id: "user-1",
  status: "confirmed" as const,
  customer_name: "Jane Doe",
  customer_phone: "0501234567",
  appointment_date: "2026-01-01",
  appointment_time: "10:00:00",
  notes: null,
  google_event_id: null as string | null,
  service: { name: "Facial", duration_minutes: 30 },
};

beforeEach(async () => {
  (await getMock()).reset();
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost/oauth-callback";
  process.env.GOOGLE_REFRESH_TOKEN = "test-refresh-token";
  process.env.GOOGLE_CALENDAR_ID = "test-calendar-id";
});

afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REDIRECT_URI;
  delete process.env.GOOGLE_REFRESH_TOKEN;
  delete process.env.GOOGLE_CALENDAR_ID;
});

describe("Phase 2 — calendar.server.ts compare-and-swap correctness", () => {
  it("9. a Google API failure is persisted to google_calendar_sync_error", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () => ok({ ...BASE_APPT, google_event_id: null }));
    mock.queueFrom("profiles", () => ok({ email: "customer@example.com" }));
    mock.queueFrom("business_settings", () => ok({ address: "123 Main St" }));
    // The error-recording write in the outer catch — a *third*
    // .from("appointments") call.
    mock.queueFrom("appointments", () => ok({}));

    const events = await getGoogleEvents();
    events.insert.mockRejectedValue(new Error("Google Calendar quota exceeded"));

    const { syncAppointmentToGoogleCalendar } =
      await import("@/integrations/google/calendar.server");
    await syncAppointmentToGoogleCalendar("appt-1");

    const errorWriteBuilder = fromBuildersForTable(mock, "appointments")[1];
    expect(errorWriteBuilder).toBeDefined();
    expect(errorWriteBuilder!.update).toHaveBeenCalledWith(
      expect.objectContaining({
        google_calendar_sync_error: expect.stringContaining("quota exceeded"),
      }),
    );
  });

  it("10a. compare-and-swap uses .is(google_event_id, null) when creating a fresh event", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () => ok({ ...BASE_APPT, google_event_id: null }));
    mock.queueFrom("profiles", () => ok({ email: "customer@example.com" }));
    mock.queueFrom("business_settings", () => ok({ address: "123 Main St" }));
    // The guarded write — second .from("appointments") call.
    mock.queueFrom("appointments", () => ok({ id: "appt-1" }));

    const events = await getGoogleEvents();
    events.insert.mockResolvedValue({ data: { id: "new-google-event-id" } });

    const { syncAppointmentToGoogleCalendar } =
      await import("@/integrations/google/calendar.server");
    await syncAppointmentToGoogleCalendar("appt-1");

    expect(events.insert).toHaveBeenCalled();
    expect(events.update).not.toHaveBeenCalled();

    const guardedWriteBuilder = fromBuildersForTable(mock, "appointments")[1]!;
    expect(guardedWriteBuilder.is).toHaveBeenCalledWith("google_event_id", null);
    expect(guardedWriteBuilder.eq).toHaveBeenCalledWith("id", "appt-1");
    // Must not have used an .eq("google_event_id", ...) guard in this branch.
    expect(guardedWriteBuilder.eq).not.toHaveBeenCalledWith("google_event_id", expect.anything());
  });

  it("10b. compare-and-swap uses .eq(google_event_id, previous) when updating an existing event", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () => ok({ ...BASE_APPT, google_event_id: "old-event-id" }));
    mock.queueFrom("profiles", () => ok({ email: "customer@example.com" }));
    mock.queueFrom("business_settings", () => ok({ address: "123 Main St" }));
    mock.queueFrom("appointments", () => ok({ id: "appt-1" }));

    const events = await getGoogleEvents();
    events.update.mockResolvedValue({ data: { id: "old-event-id" } });

    const { syncAppointmentToGoogleCalendar } =
      await import("@/integrations/google/calendar.server");
    await syncAppointmentToGoogleCalendar("appt-1");

    expect(events.update).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "old-event-id" }),
      expect.anything(), // Phase 9: gaxios timeout option, not under test here
    );
    expect(events.insert).not.toHaveBeenCalled();

    const guardedWriteBuilder = fromBuildersForTable(mock, "appointments")[1]!;
    expect(guardedWriteBuilder.eq).toHaveBeenCalledWith("google_event_id", "old-event-id");
    expect(guardedWriteBuilder.is).not.toHaveBeenCalled();
  });

  it("11. a lost compare-and-swap deletes its own just-created event instead of overwriting the winner's", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () => ok({ ...BASE_APPT, google_event_id: null }));
    mock.queueFrom("profiles", () => ok({ email: "customer@example.com" }));
    mock.queueFrom("business_settings", () => ok({ address: "123 Main St" }));
    // Simulates losing the race: another concurrent sync already changed
    // google_event_id, so the guarded .is("google_event_id", null) update
    // matches zero rows — .maybeSingle() resolves to no data.
    mock.queueFrom("appointments", () => ok(null));

    const events = await getGoogleEvents();
    events.insert.mockResolvedValue({ data: { id: "our-own-orphaned-event" } });
    events.delete.mockResolvedValue({});

    const { syncAppointmentToGoogleCalendar } =
      await import("@/integrations/google/calendar.server");
    await syncAppointmentToGoogleCalendar("appt-1");

    // Self-heals by deleting the event *this call* just created — never
    // touches whatever the winning call wrote to google_event_id.
    expect(events.delete).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "our-own-orphaned-event" }),
      expect.anything(), // Phase 9: gaxios timeout option, not under test here
    );
  });

  it("12. every Google Calendar API call is bounded by an explicit finite timeout (Phase 9)", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () => ok({ ...BASE_APPT, google_event_id: null }));
    mock.queueFrom("profiles", () => ok({ email: "customer@example.com" }));
    mock.queueFrom("business_settings", () => ok({ address: "123 Main St" }));
    mock.queueFrom("appointments", () => ok({ id: "appt-1" }));

    const events = await getGoogleEvents();
    events.insert.mockResolvedValue({ data: { id: "new-google-event-id" } });

    const { syncAppointmentToGoogleCalendar } =
      await import("@/integrations/google/calendar.server");
    await syncAppointmentToGoogleCalendar("appt-1");

    expect(events.insert).toHaveBeenCalledTimes(1);
    const [, options] = events.insert.mock.calls[0]!;
    expect(options).toBeDefined();
    expect(typeof (options as { timeout?: number }).timeout).toBe("number");
    expect((options as { timeout: number }).timeout).toBeGreaterThan(0);
    // gaxios has no default timeout at all — a hung request would
    // otherwise hang this (now-awaited, per Phase 2) call indefinitely.
    expect((options as { timeout: number }).timeout).toBeLessThanOrEqual(30_000);
  });
});
