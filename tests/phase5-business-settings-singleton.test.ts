import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createMockSupabaseAdmin } from "./helpers/mockSupabase";
import { ok, fail } from "./helpers/mockSupabase";
import { TEST_USER_ID } from "./helpers/mockMiddleware";

// Mocked unit tests only — see
// tests/phase5-business-settings-singleton.integration.test.ts for the
// real-Postgres scenarios this file cannot prove (the UNIQUE index
// actually rejecting a second row, real concurrent-upsert behavior).

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

vi.mock("@/api/storage/storage", () => ({
  deleteOldImageIfUnreferenced: vi.fn(async () => {}),
}));

// For the Google Calendar loader test (#8) — mocks only the actual
// external network boundary, same as tests/phase2-calendar-server-sync.test.ts.
vi.mock("@googleapis/calendar", () => {
  const events = { insert: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const calendarClient = { events };
  class FakeOAuth2 {
    setCredentials = vi.fn();
  }
  return {
    calendar: vi.fn(() => calendarClient),
    auth: { OAuth2: FakeOAuth2 },
    __events: events,
  };
});

type MockHandle = ReturnType<typeof createMockSupabaseAdmin>;

async function getMock(): Promise<MockHandle> {
  const mod = (await import("@/integrations/supabase/client.server")) as unknown as {
    __mock: MockHandle;
  };
  return mod.__mock;
}

function fromBuildersForTable(mock: MockHandle, table: string) {
  return mock.from.mock.calls
    .map((call, i) => (call[0] === table ? mock.from.mock.results[i]!.value : undefined))
    .filter((b): b is ReturnType<MockHandle["from"]> => b !== undefined) as Array<{
    eq: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  }>;
}

beforeEach(async () => {
  (await getMock()).reset();
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost/oauth-callback";
  process.env.GOOGLE_REFRESH_TOKEN = "test-refresh-token";
  process.env.GOOGLE_CALENDAR_ID = "test-calendar-id";
});

const SAVED_ROW = {
  id: "settings-1",
  singleton: true,
  business_name: "Najla Cosmetics",
  address: "Nazareth, Israel",
  phone: null,
  whatsapp_number: null,
  google_maps_url: null,
  hero_image_url: null,
  about_image_url: null,
  products_hero_image_url: null,
  services_hero_image_url: null,
  latitude: null,
  longitude: null,
  updated_at: "2026-01-01T00:00:00Z",
};

describe("Phase 5 — business_settings singleton (mocked)", () => {
  it("1. first save uses UPSERT, not plain INSERT", async () => {
    const mock = await getMock();
    mock.queueFrom("business_settings", () => ok(null)); // no previous row yet
    mock.queueFrom("business_settings", () => ok(SAVED_ROW)); // upsert().select().single()

    const { saveSettings } = await import("@/api/settings/settings");
    await saveSettings({ data: { payload: { business_name: "Najla Cosmetics" } } });

    const writeBuilder = fromBuildersForTable(mock, "business_settings")[1]!;
    expect(writeBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ singleton: true }),
      expect.objectContaining({ onConflict: "singleton" }),
    );
    expect(writeBuilder.insert).not.toHaveBeenCalled();
  });

  it("2. a later save updates the same singleton row via the same upsert path", async () => {
    const mock = await getMock();
    // A previous row already exists this time.
    mock.queueFrom("business_settings", () =>
      ok({
        hero_image_url: "https://x/images/settings/old.jpg",
        about_image_url: null,
        products_hero_image_url: null,
        services_hero_image_url: null,
      }),
    );
    mock.queueFrom("business_settings", () => ok(SAVED_ROW));

    const { saveSettings } = await import("@/api/settings/settings");
    const { deleteOldImageIfUnreferenced } = await import("@/api/storage/storage");
    const result = await saveSettings({
      data: {
        payload: {
          business_name: "Najla Cosmetics",
          hero_image_url: "https://x/images/settings/new.jpg",
        },
      },
    });

    const writeBuilder = fromBuildersForTable(mock, "business_settings")[1]!;
    expect(writeBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ singleton: true }),
      expect.objectContaining({ onConflict: "singleton" }),
    );
    // Same code path as a first save — no separate "update" branch exists.
    expect(writeBuilder.update).not.toHaveBeenCalled();
    expect(deleteOldImageIfUnreferenced).toHaveBeenCalledWith(
      expect.anything(),
      "https://x/images/settings/old.jpg",
    );
    expect(result).toEqual({ success: true, settings: SAVED_ROW });
  });

  it("3. a client-supplied id cannot create a second row or influence the write", async () => {
    const mock = await getMock();
    mock.queueFrom("business_settings", () => ok(null));
    mock.queueFrom("business_settings", () => ok(SAVED_ROW));

    const { saveSettings } = await import("@/api/settings/settings");
    // Simulates a raw client bypassing the (now id-less) TypeScript
    // validator entirely and still sending an id, e.g. to try to target
    // an arbitrary row.
    await saveSettings({
      data: { id: "attacker-chosen-id", payload: { business_name: "Najla Cosmetics" } } as never,
    });

    const writeBuilder = fromBuildersForTable(mock, "business_settings")[1]!;
    const [upsertPayload] = writeBuilder.upsert.mock.calls[0]!;
    expect(upsertPayload).not.toHaveProperty("id");
    expect(writeBuilder.insert).not.toHaveBeenCalled();
    // No .eq("id", ...) targeting anywhere in the write path — the
    // upsert's conflict target is exclusively the singleton column.
    expect(writeBuilder.eq).not.toHaveBeenCalledWith("id", expect.anything());
  });

  it("4. a database write failure is handled safely, not leaked to the caller", async () => {
    const mock = await getMock();
    mock.queueFrom("business_settings", () => ok(null));
    mock.queueFrom("business_settings", () =>
      fail({ code: "23505", message: "duplicate key value violates unique constraint" }),
    );

    const { saveSettings } = await import("@/api/settings/settings");

    try {
      await saveSettings({ data: { payload: { business_name: "Najla Cosmetics" } } });
      throw new Error("expected saveSettings to throw");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      expect(message).not.toContain("23505");
      expect(message).not.toContain("duplicate key value");
      expect(message).toBe("Failed to save settings. Please check the details and try again.");
    }
  });

  it("5. readers filter on the singleton discriminator", async () => {
    const mock = await getMock();
    mock.queueFrom("business_settings", () => ok(SAVED_ROW));

    const { getSettings } = await import("@/api/settings/settings");
    await getSettings();

    const readBuilder = fromBuildersForTable(mock, "business_settings")[0]!;
    expect(readBuilder.eq).toHaveBeenCalledWith("singleton", true);
  });

  it("6. a reader database failure is a real error, never mistaken for 'no settings'", async () => {
    const mock = await getMock();
    mock.queueFrom("business_settings", () => fail({ code: "500", message: "connection reset" }));

    const { getSettings } = await import("@/api/settings/settings");

    await expect(getSettings()).rejects.toThrow(
      "Could not load business settings. Please try again.",
    );
  });

  it("7. email branding still falls back safely when settings genuinely do not exist", async () => {
    const mock = await getMock();
    mock.queueFrom("business_settings", () => ok(null)); // no row — not an error

    const { getEmailBrand } = await import("@/api/email/brand");
    const brand = await getEmailBrand();

    expect(brand).toEqual({
      businessName: "Najla Cosmetics",
      address: null,
      phone: null,
      whatsappNumber: null,
    });
  });

  it("8. the Google Calendar sync loads the same singleton settings row", async () => {
    const mock = await getMock();
    mock.queueFrom("appointments", () =>
      ok({
        id: "appt-1",
        user_id: "user-1",
        status: "confirmed",
        customer_name: "Jane Doe",
        customer_phone: "0501234567",
        appointment_date: "2026-01-01",
        appointment_time: "10:00:00",
        notes: null,
        google_event_id: null,
        service: { name: "Facial", duration_minutes: 30 },
      }),
    );
    mock.queueFrom("profiles", () => ok({ email: "customer@example.com" }));
    mock.queueFrom("business_settings", () => ok({ address: "Nazareth, Israel" }));
    mock.queueFrom("appointments", () => ok({ id: "appt-1" })); // the CAS write

    const calendarEvents = (
      (await import("@googleapis/calendar")) as unknown as {
        __events: { insert: ReturnType<typeof vi.fn> };
      }
    ).__events;
    calendarEvents.insert.mockResolvedValue({ data: { id: "google-event-1" } });

    const { syncAppointmentToGoogleCalendar } =
      await import("@/integrations/google/calendar.server");
    await syncAppointmentToGoogleCalendar("appt-1");

    const settingsBuilder = fromBuildersForTable(mock, "business_settings")[0]!;
    expect(settingsBuilder.eq).toHaveBeenCalledWith("singleton", true);
    // The loaded address made it into the built event's location.
    expect(calendarEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ location: "Nazareth, Israel" }),
      }),
    );
  });
});
