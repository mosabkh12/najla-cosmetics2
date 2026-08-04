import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createMockSupabaseAdmin } from "./helpers/mockSupabase";
import { ok, createDeferred, flushAsync } from "./helpers/mockSupabase";
import { TEST_USER_ID } from "./helpers/mockMiddleware";

vi.mock("@tanstack/react-start", async () => {
  const fake = await import("./helpers/fakeTanstackStart");
  return { createServerFn: fake.createServerFn, createMiddleware: fake.createMiddleware };
});

vi.mock("@/integrations/supabase/client.server", async () => {
  const { createMockSupabaseAdmin } = await import("./helpers/mockSupabase");
  const mock = createMockSupabaseAdmin();
  return { supabaseAdmin: mock.client, __mock: mock };
});

vi.mock("@/integrations/supabase/auth-middleware", async () => {
  const { fakeRequireSupabaseAuth } = await import("./helpers/mockMiddleware");
  const { createMockSupabaseAdmin } = await import("./helpers/mockSupabase");
  // Reuses the same supabaseAdmin mock as context.supabase — deleteAppointment
  // etc. only use supabaseAdmin (service-role) internally, so this binding
  // is only exercised for context.userId in these tests, not RLS-scoped reads.
  const mock = createMockSupabaseAdmin();
  return { requireSupabaseAuth: fakeRequireSupabaseAuth(mock.client, TEST_USER_ID) };
});

vi.mock("@/api/admin/middleware", async () => {
  const { fakeRequireAdmin } = await import("./helpers/mockMiddleware");
  const { createMockSupabaseAdmin } = await import("./helpers/mockSupabase");
  const mock = createMockSupabaseAdmin();
  return { requireAdmin: fakeRequireAdmin(mock.client, TEST_USER_ID) };
});

vi.mock("@/api/rate-limit/rate-limit.server", () => ({
  enforceRateLimit: vi.fn(async () => {}),
  getClientIp: vi.fn(() => "203.0.113.1"),
}));

vi.mock("@/api/email/appointment-emails", () => ({
  sendBookingConfirmation: vi.fn(async () => {}),
  sendAdminBookingNotification: vi.fn(async () => {}),
  sendStatusUpdateEmail: vi.fn(async () => {}),
}));

vi.mock("@/integrations/google/calendar.server", () => ({
  syncAppointmentToGoogleCalendar: vi.fn(async () => {}),
  deleteGoogleCalendarEvent: vi.fn(async () => {}),
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
    deleteGoogleCalendarEvent: ReturnType<typeof vi.fn>;
  };
}

beforeEach(async () => {
  (await getMock()).reset();
  vi.clearAllMocks();
});

const APPT_INPUT = {
  service_id: "svc-1",
  appointment_date: "2026-01-01",
  appointment_time: "10:00",
  customer_name: "Jane Doe",
  customer_phone: "0501234567",
  notes: null as string | null,
  idempotency_key: null as string | null,
};

describe("Phase 2 — appointments.ts awaits Google Calendar sync/delete", () => {
  it("1. createAppointment awaits the Calendar sync attempt before resolving", async () => {
    const mock = await getMock();
    mock.queueRpc(() => ok([{ appointment_id: "appt-1", is_new: true }]));
    mock.queueFrom("services", () => ok({ name: "Facial", duration_minutes: 30, price: 100 }));
    mock.queueFrom("profiles", () => ok({ email: "customer@example.com", language: "en" }));

    const calendar = await getCalendarMock();
    const deferred = createDeferred<void>();
    let syncSettled = false;
    calendar.syncAppointmentToGoogleCalendar.mockImplementation(async () => {
      await deferred.promise;
      syncSettled = true;
    });

    const { createAppointment } = await import("@/api/appointments/appointments");
    const resultPromise = createAppointment({ data: APPT_INPUT });
    let handlerResolved = false;
    resultPromise.then(() => {
      handlerResolved = true;
    });

    await flushAsync();
    expect(syncSettled).toBe(false);
    expect(handlerResolved).toBe(false);

    deferred.resolve();
    const result = await resultPromise;

    expect(syncSettled).toBe(true);
    expect(handlerResolved).toBe(true);
    expect(result).toEqual({ success: true });
    expect(calendar.syncAppointmentToGoogleCalendar).toHaveBeenCalledWith("appt-1");
  });

  it("2. cancelAppointment awaits the Calendar sync attempt before resolving", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () => ok({ status: "confirmed", user_id: TEST_USER_ID }));
    mock.queueFrom("appointments", () => ok({ error: null }));

    const calendar = await getCalendarMock();
    const deferred = createDeferred<void>();
    let syncSettled = false;
    calendar.syncAppointmentToGoogleCalendar.mockImplementation(async () => {
      await deferred.promise;
      syncSettled = true;
    });

    const { cancelAppointment } = await import("@/api/appointments/appointments");
    const resultPromise = cancelAppointment({ data: { id: "appt-1" } });
    let handlerResolved = false;
    resultPromise.then(() => {
      handlerResolved = true;
    });

    await flushAsync();
    expect(syncSettled).toBe(false);
    expect(handlerResolved).toBe(false);

    deferred.resolve();
    await resultPromise;

    expect(syncSettled).toBe(true);
    expect(handlerResolved).toBe(true);
    expect(calendar.syncAppointmentToGoogleCalendar).toHaveBeenCalledWith("appt-1");
  });

  it("3. rescheduleAppointment awaits the Calendar sync attempt before resolving", async () => {
    const mock = await getMock();
    mock.queueRpc(() => ok([{ appointment_id: "appt-1", applied: true }]));
    mock.queueFrom("appointments", () =>
      ok({ customer_name: "Jane Doe", customer_phone: "0501234567" }),
    );
    mock.queueFrom("services", () => ok({ name: "Facial", duration_minutes: 30, price: 100 }));
    mock.queueFrom("profiles", () => ok({ email: "customer@example.com", language: "en" }));

    const calendar = await getCalendarMock();
    const deferred = createDeferred<void>();
    let syncSettled = false;
    calendar.syncAppointmentToGoogleCalendar.mockImplementation(async () => {
      await deferred.promise;
      syncSettled = true;
    });

    const { rescheduleAppointment } = await import("@/api/appointments/appointments");
    const resultPromise = rescheduleAppointment({
      data: {
        id: "appt-1",
        service_id: "svc-1",
        appointment_date: "2026-01-02",
        appointment_time: "11:00",
        idempotency_key: null,
      },
    });
    let handlerResolved = false;
    resultPromise.then(() => {
      handlerResolved = true;
    });

    await flushAsync();
    expect(syncSettled).toBe(false);
    expect(handlerResolved).toBe(false);

    deferred.resolve();
    await resultPromise;

    expect(syncSettled).toBe(true);
    expect(handlerResolved).toBe(true);
    expect(calendar.syncAppointmentToGoogleCalendar).toHaveBeenCalledWith("appt-1");
  });

  it("4. updateAppointmentStatus (admin) awaits the Calendar sync attempt before resolving", async () => {
    const mock = await getMock();
    // current === requested ("confirmed") so the function skips the
    // follow-up notification-email branch entirely — irrelevant to what
    // this test verifies (the calendar-sync await), and keeps the queue
    // setup focused. Phase 4 replaced the direct .update() with a call
    // to the admin_update_appointment_status RPC — see
    // tests/phase4-admin-appointment-status.test.ts for full coverage of
    // that RPC call itself; this test only needs it to succeed.
    mock.queueFrom("appointments", () => ok({ status: "confirmed" }));
    mock.queueRpc(() => ok("appt-1"));

    const calendar = await getCalendarMock();
    const deferred = createDeferred<void>();
    let syncSettled = false;
    calendar.syncAppointmentToGoogleCalendar.mockImplementation(async () => {
      await deferred.promise;
      syncSettled = true;
    });

    const { updateAppointmentStatus } = await import("@/api/appointments/appointments");
    const resultPromise = updateAppointmentStatus({ data: { id: "appt-1", status: "confirmed" } });
    let handlerResolved = false;
    resultPromise.then(() => {
      handlerResolved = true;
    });

    await flushAsync();
    expect(syncSettled).toBe(false);
    expect(handlerResolved).toBe(false);

    deferred.resolve();
    await resultPromise;

    expect(syncSettled).toBe(true);
    expect(handlerResolved).toBe(true);
    expect(calendar.syncAppointmentToGoogleCalendar).toHaveBeenCalledWith("appt-1");
  });

  it("5. deleteAppointment awaits the Calendar deletion attempt before resolving", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () =>
      ok({ status: "completed", user_id: TEST_USER_ID, google_event_id: "evt-1" }),
    );
    mock.queueFrom("appointments", () => ok({ error: null }));

    const calendar = await getCalendarMock();
    const deferred = createDeferred<void>();
    let deleteSettled = false;
    calendar.deleteGoogleCalendarEvent.mockImplementation(async () => {
      await deferred.promise;
      deleteSettled = true;
    });

    const { deleteAppointment } = await import("@/api/appointments/appointments");
    const resultPromise = deleteAppointment({ data: { id: "appt-1" } });
    let handlerResolved = false;
    resultPromise.then(() => {
      handlerResolved = true;
    });

    await flushAsync();
    expect(deleteSettled).toBe(false);
    expect(handlerResolved).toBe(false);

    deferred.resolve();
    await resultPromise;

    expect(deleteSettled).toBe(true);
    expect(handlerResolved).toBe(true);
    expect(calendar.deleteGoogleCalendarEvent).toHaveBeenCalledWith("evt-1");
  });

  it("6. clearAppointmentHistory awaits every Calendar deletion attempt before resolving", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () =>
      ok([{ google_event_id: "evt-1" }, { google_event_id: "evt-2" }]),
    );
    mock.queueFrom("appointments", () => ok({ error: null }));

    const calendar = await getCalendarMock();
    const deferredByEvent = new Map<string, ReturnType<typeof createDeferred<void>>>();
    const settled = new Set<string>();
    calendar.deleteGoogleCalendarEvent.mockImplementation(async (eventId: string) => {
      const d = deferredByEvent.get(eventId)!;
      await d.promise;
      settled.add(eventId);
    });
    deferredByEvent.set("evt-1", createDeferred<void>());
    deferredByEvent.set("evt-2", createDeferred<void>());

    const { clearAppointmentHistory } = await import("@/api/appointments/appointments");
    const resultPromise = clearAppointmentHistory({ data: undefined });
    let handlerResolved = false;
    resultPromise.then(() => {
      handlerResolved = true;
    });

    await flushAsync();
    expect(settled.size).toBe(0);
    expect(handlerResolved).toBe(false);

    // Resolve only one of the two — the whole batch must still be pending.
    deferredByEvent.get("evt-1")!.resolve();
    await flushAsync();
    expect(handlerResolved).toBe(false);

    deferredByEvent.get("evt-2")!.resolve();
    await resultPromise;

    expect(settled).toEqual(new Set(["evt-1", "evt-2"]));
    expect(handlerResolved).toBe(true);
  });

  it("7. deleteAppointmentsAdmin awaits every Calendar deletion attempt before resolving", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () =>
      ok([{ google_event_id: "evt-1" }, { google_event_id: "evt-2" }]),
    );
    mock.queueFrom("appointments", () => ok({ error: null }));

    const calendar = await getCalendarMock();
    const deferredByEvent = new Map<string, ReturnType<typeof createDeferred<void>>>();
    const settled = new Set<string>();
    calendar.deleteGoogleCalendarEvent.mockImplementation(async (eventId: string) => {
      const d = deferredByEvent.get(eventId)!;
      await d.promise;
      settled.add(eventId);
    });
    deferredByEvent.set("evt-1", createDeferred<void>());
    deferredByEvent.set("evt-2", createDeferred<void>());

    const { deleteAppointmentsAdmin } = await import("@/api/appointments/appointments");
    const resultPromise = deleteAppointmentsAdmin({ data: { ids: ["appt-1", "appt-2"] } });
    let handlerResolved = false;
    resultPromise.then(() => {
      handlerResolved = true;
    });

    await flushAsync();
    expect(settled.size).toBe(0);
    expect(handlerResolved).toBe(false);

    deferredByEvent.get("evt-1")!.resolve();
    deferredByEvent.get("evt-2")!.resolve();
    await resultPromise;

    expect(settled).toEqual(new Set(["evt-1", "evt-2"]));
    expect(handlerResolved).toBe(true);
  });

  it("8. a rejecting Calendar sync does not fail an otherwise-successful appointment operation", async () => {
    const mock = await getMock();
    mock.queueRpc(() => ok([{ appointment_id: "appt-1", is_new: true }]));
    mock.queueFrom("services", () => ok({ name: "Facial", duration_minutes: 30, price: 100 }));
    mock.queueFrom("profiles", () => ok({ email: "customer@example.com", language: "en" }));

    const calendar = await getCalendarMock();
    // The real syncAppointmentToGoogleCalendar never rejects (Phase 2), but
    // every call site still chains .catch(console.error) as a defensive
    // second layer — this proves that layer actually works, independent
    // of whether the real implementation currently needs it.
    calendar.syncAppointmentToGoogleCalendar.mockRejectedValue(
      new Error("simulated Google Calendar outage"),
    );

    const { createAppointment } = await import("@/api/appointments/appointments");

    await expect(createAppointment({ data: APPT_INPUT })).resolves.toEqual({ success: true });
  });
});
