import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createMockSupabaseAdmin } from "./helpers/mockSupabase";
import { ok, fail } from "./helpers/mockSupabase";

vi.mock("@tanstack/react-start", async () => {
  const fake = await import("./helpers/fakeTanstackStart");
  return { createServerFn: fake.createServerFn, createMiddleware: fake.createMiddleware };
});

// The mock instance is created *inside* the factory (which Vitest hoists
// above all imports) rather than referenced from an outer `const`, so
// there is no temporal-dead-zone issue between the hoisted vi.mock() call
// and this file's own module-scope initialization. The instance is
// exposed via `__mock` so tests below can configure/inspect it.
vi.mock("@/integrations/supabase/client.server", async () => {
  const { createMockSupabaseAdmin } = await import("./helpers/mockSupabase");
  const mock = createMockSupabaseAdmin();
  return { supabaseAdmin: mock.client, __mock: mock };
});

vi.mock("@/api/rate-limit/rate-limit.server", () => ({
  enforceRateLimit: vi.fn(async () => {}),
  getClientIp: vi.fn(() => "203.0.113.1"),
}));

type MockHandle = ReturnType<typeof createMockSupabaseAdmin>;

async function getMock(): Promise<MockHandle> {
  const mod = (await import("@/integrations/supabase/client.server")) as unknown as {
    __mock: MockHandle;
  };
  return mod.__mock;
}

async function callCheckEmailAvailable(email: unknown) {
  const { checkEmailAvailable } = await import("@/api/profiles/profiles");
  return checkEmailAvailable({ data: { email: email as string } });
}

describe("checkEmailAvailable (Phase 1)", () => {
  beforeEach(async () => {
    (await getMock()).reset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports an existing email as unavailable", async () => {
    const mock = await getMock();
    mock.queueFrom("profiles", () => ok([{ id: "row-1" }]));

    const result = await callCheckEmailAvailable("existing@example.com");

    expect(result).toEqual({ available: false });
  });

  it("still reports an existing email as unavailable beyond the old 50-user page limit", async () => {
    // The whole point of the Phase 1 fix: this queries `profiles` directly
    // by an indexed column, not a paginated Auth API list, so there is no
    // "first page" to fall outside of. Simulating "user #73" is simply
    // "the query still finds exactly one matching row" — page size is
    // structurally irrelevant now.
    const mock = await getMock();
    mock.queueFrom("profiles", () => ok([{ id: "user-number-73" }]));

    const result = await callCheckEmailAvailable("user73@example.com");

    expect(result).toEqual({ available: false });
  });

  it("reports a new email as available", async () => {
    const mock = await getMock();
    mock.queueFrom("profiles", () => ok([]));

    const result = await callCheckEmailAvailable("brand-new@example.com");

    expect(result).toEqual({ available: true });
  });

  it("normalizes uppercase letters and surrounding whitespace before querying", async () => {
    const mock = await getMock();
    mock.queueFrom("profiles", () => ok([]));

    await callCheckEmailAvailable("  SomeOne@Example.COM  ");

    // The mocked query builder's .eq() is a vi.fn() spy — assert the
    // normalized value was actually sent to the database query.
    const builder = mock.from.mock.results[0]!.value as { eq: ReturnType<typeof vi.fn> };
    expect(builder.eq).toHaveBeenCalledWith("email", "someone@example.com");
  });

  it("rejects a malformed email without querying the database", async () => {
    const mock = await getMock();

    await expect(callCheckEmailAvailable("not-an-email")).rejects.toThrow("INVALID_EMAIL");
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("rejects missing/non-string email input at runtime, not just at the type layer", async () => {
    const mock = await getMock();

    // Simulates a raw client that bypasses TypeScript entirely (e.g. a
    // hand-crafted request body) — the validator itself performs no
    // runtime check, so this must be caught inside the handler.
    await expect(callCheckEmailAvailable(undefined)).rejects.toThrow("INVALID_EMAIL");
    await expect(callCheckEmailAvailable(12345)).rejects.toThrow("INVALID_EMAIL");
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("does not report available:true when the Supabase query itself fails", async () => {
    const mock = await getMock();
    mock.queueFrom("profiles", () => fail({ code: "500", message: "connection reset" }));

    await expect(callCheckEmailAvailable("someone@example.com")).rejects.toThrow();
  });

  it("never exposes raw database error details to the caller", async () => {
    const mock = await getMock();
    const sensitiveDbError = {
      code: "42501",
      message: "permission denied for table profiles: role service_role violates row security",
      hint: "internal schema detail",
    };
    mock.queueFrom("profiles", () => fail(sensitiveDbError));

    try {
      await callCheckEmailAvailable("someone@example.com");
      throw new Error("expected checkEmailAvailable to throw");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      expect(message).not.toContain("42501");
      expect(message).not.toContain("permission denied");
      expect(message).not.toContain("row security");
      expect(message).toBe("Could not check email availability. Please try again.");
    }
  });

  it("never calls auth.admin.listUsers() — the Phase 1 fix removed this entirely", async () => {
    const mock = await getMock();
    mock.queueFrom("profiles", () => ok([]));

    await callCheckEmailAvailable("someone@example.com");

    expect(mock.listUsers).not.toHaveBeenCalled();
    // And the query that *did* run went to `profiles`, not the Auth API.
    expect(mock.from).toHaveBeenCalledWith("profiles");
  });

  it("still enforces rate limiting", async () => {
    const mock = await getMock();
    mock.queueFrom("profiles", () => ok([]));
    const { enforceRateLimit } = await import("@/api/rate-limit/rate-limit.server");

    await callCheckEmailAvailable("someone@example.com");

    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "check_email_available" }),
    );
  });
});
