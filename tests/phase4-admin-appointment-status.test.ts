import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createMockSupabaseAdmin } from "./helpers/mockSupabase";
import { ok, fail, createDeferred, flushAsync } from "./helpers/mockSupabase";
import { TEST_USER_ID } from "./helpers/mockMiddleware";

// Mocked unit tests only — see tests/phase4-admin-reactivation.integration.test.ts
// for the real-Postgres scenarios this file cannot prove (advisory-lock
// concurrency, actual RLS/grant enforcement, real overlap detection).

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
  };
}

// Shared queue for the "genuine status change" email lookup path — used
// by every test whose currentStatus differs from the requested status.
function queueEmailLookup(mock: MockHandle) {
  mock.queueFrom("appointments", () =>
    ok({
      customer_name: "Jane Doe",
      appointment_date: "2026-02-01",
      appointment_time: "10:00",
      user_id: TEST_USER_ID,
      service_name: "Facial",
    }),
  );
  // No email configured -> sendStatusUpdateEmail is never actually
  // invoked; simplifies the mock while still exercising the full path.
  mock.queueFrom("profiles", () => ok({ email: null, language: "en" }));
}

beforeEach(async () => {
  (await getMock()).reset();
  vi.clearAllMocks();
});

describe("Phase 4 — updateAppointmentStatus via admin_update_appointment_status RPC", () => {
  it("1. a normal forward status change (confirmed -> completed) succeeds", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () => ok({ status: "confirmed" })); // pre-fetch currentStatus
    mock.queueRpc(() => ok("appt-1")); // RPC succeeds
    queueEmailLookup(mock);

    const { updateAppointmentStatus } = await import("@/api/appointments/appointments");
    const result = await updateAppointmentStatus({ data: { id: "appt-1", status: "completed" } });

    expect(result).toEqual({ success: true });
  });

  it("2. reactivating a cancelled appointment calls admin_update_appointment_status with the right args", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () => ok({ status: "cancelled" }));
    mock.queueRpc(() => ok("appt-1"));
    queueEmailLookup(mock);

    const { updateAppointmentStatus } = await import("@/api/appointments/appointments");
    await updateAppointmentStatus({ data: { id: "appt-1", status: "confirmed" } });

    expect(mock.rpc).toHaveBeenCalledWith(
      "admin_update_appointment_status",
      expect.objectContaining({ p_appointment_id: "appt-1", p_status: "confirmed" }),
    );
  });

  it("3. a database conflict error becomes a safe, mapped application error", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () => ok({ status: "cancelled" }));
    // Simulates the RPC's raw Postgres exception text, which would
    // normally include internal detail (e.g. the conflicting row).
    mock.queueRpc(() =>
      fail({
        message: "APPOINTMENT_TIME_CONFLICT: overlaps appointment abc-123-def on 2026-02-01",
      }),
    );

    const { updateAppointmentStatus } = await import("@/api/appointments/appointments");

    try {
      await updateAppointmentStatus({ data: { id: "appt-1", status: "confirmed" } });
      throw new Error("expected updateAppointmentStatus to throw");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      expect(message).toBe("APPOINTMENT_TIME_CONFLICT");
      expect(message).not.toContain("abc-123-def");
      expect(message).not.toContain("overlaps appointment");
    }
  });

  it("4. Calendar sync runs only after the RPC-based status update has succeeded", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () => ok({ status: "confirmed" }));

    const order: string[] = [];
    mock.queueRpc(() => {
      order.push("rpc-success");
      return ok("appt-1");
    });
    queueEmailLookup(mock);

    const calendar = await getCalendarMock();
    calendar.syncAppointmentToGoogleCalendar.mockImplementation(async () => {
      order.push("calendar-sync");
    });

    const { updateAppointmentStatus } = await import("@/api/appointments/appointments");
    await updateAppointmentStatus({ data: { id: "appt-1", status: "completed" } });

    expect(order).toEqual(["rpc-success", "calendar-sync"]);
  });

  it("5. Calendar sync is not called when the RPC fails", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () => ok({ status: "cancelled" }));
    mock.queueRpc(() => fail({ message: "APPOINTMENT_IN_PAST" }));

    const calendar = await getCalendarMock();
    const { updateAppointmentStatus } = await import("@/api/appointments/appointments");

    await expect(
      updateAppointmentStatus({ data: { id: "appt-1", status: "confirmed" } }),
    ).rejects.toThrow("APPOINTMENT_IN_PAST");

    expect(calendar.syncAppointmentToGoogleCalendar).not.toHaveBeenCalled();
  });

  it("6. Calendar sync is genuinely awaited before the function resolves", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () => ok({ status: "confirmed" }));
    mock.queueRpc(() => ok("appt-1"));
    queueEmailLookup(mock);

    const calendar = await getCalendarMock();
    const deferred = createDeferred<void>();
    let syncSettled = false;
    calendar.syncAppointmentToGoogleCalendar.mockImplementation(async () => {
      await deferred.promise;
      syncSettled = true;
    });

    const { updateAppointmentStatus } = await import("@/api/appointments/appointments");
    const resultPromise = updateAppointmentStatus({ data: { id: "appt-1", status: "completed" } });
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
  });

  it("7. an invalid status value is rejected before touching the database", async () => {
    const mock = await getMock();
    const { updateAppointmentStatus } = await import("@/api/appointments/appointments");

    await expect(
      updateAppointmentStatus({ data: { id: "appt-1", status: "bogus" } }),
    ).rejects.toThrow("INVALID_STATUS");
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("8. never calls a direct .update() on appointments for the status change — the RPC is the only write path", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () => ok({ status: "confirmed" }));
    mock.queueRpc(() => ok("appt-1"));
    queueEmailLookup(mock);

    const { updateAppointmentStatus } = await import("@/api/appointments/appointments");
    await updateAppointmentStatus({ data: { id: "appt-1", status: "completed" } });

    // Every builder ever returned by .from(...) during this call — for
    // "appointments" or any other table — must never have had .update()
    // invoked on it.
    for (const result of mock.from.mock.results) {
      const builder = result.value as { update: ReturnType<typeof vi.fn> };
      expect(builder.update).not.toHaveBeenCalled();
    }
    expect(mock.rpc).toHaveBeenCalledWith(
      "admin_update_appointment_status",
      expect.objectContaining({ p_appointment_id: "appt-1", p_status: "completed" }),
    );
  });
});
