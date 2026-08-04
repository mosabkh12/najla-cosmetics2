import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createMockSupabaseAdmin } from "./helpers/mockSupabase";
import { ok } from "./helpers/mockSupabase";
import { TEST_USER_ID } from "./helpers/mockMiddleware";

// A dedicated file so the Google Calendar module can be mocked as
// *permanently* failing to load, without affecting the working mock used
// by every other Phase 3 test (module mocks are cached per test file, so
// isolating this scenario in its own file avoids fragile per-test
// resetModules()/doMock() juggling against a shared cache).
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

vi.mock("@/integrations/google/calendar.server", () => {
  throw new Error("simulated: Google Calendar integration module failed to load");
});

type MockHandle = ReturnType<typeof createMockSupabaseAdmin>;

async function getMock(): Promise<MockHandle> {
  const mod = (await import("@/integrations/supabase/client.server")) as unknown as {
    __mock: MockHandle;
  };
  return mod.__mock;
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

describe("Phase 3 — Google Calendar module-load failure", () => {
  it("10. reports zero attempts and a known (not unknown) failed count equal to the cancelled total", async () => {
    const mock = await getMock();
    mock.queueFrom("availability_settings", () => ok({ id: "settings-1" }));
    mock.queueFrom("appointments", () =>
      ok([conflictRow("a1", "2026-02-01"), conflictRow("a2", "2026-02-01")]),
    );
    mock.queueFrom("availability_settings", () => ok(null));
    mock.queueFrom("appointments", () => ok(null)); // cancel UPDATE succeeds

    const { updateAvailabilitySettings } = await import("@/api/slots/slots");
    const result = await updateAvailabilitySettings({ data: makePayload(["2026-02-01"]) });

    // The DB cancellation still succeeded despite the module never loading.
    expect(result.success).toBe(true);
    expect(result.cancelledAppointments.map((c) => c.id).sort()).toEqual(["a1", "a2"]);

    // Zero real sync calls were made — not the cancelled-count number.
    expect(result.googleCalendarSyncAttempted).toBe(0);
    // A known count (everything is unsynced), not null/"unknown" — the
    // module load failure happens before any per-appointment ambiguity
    // could exist.
    expect(result.googleCalendarSyncFailed).toBe(2);
  });
});
