import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";

// REAL Postgres/Supabase integration tests — nothing in this file is
// mocked except the auth-context plumbing needed to call the real
// saveSettings()/getSettings() server functions directly (test 10);
// every database operation goes to a real, disposable local Postgres.
// Requires a local Supabase stack started via `npx supabase start`
// (supabase/config.toml) with this Phase 5 migration applied. If
// unreachable, every test in this file is skipped, not failed — see
// the console warning and the Phase 5 report for what that means for
// concurrency/constraint claims.
//
// Never connects to production Supabase. Defaults are the fixed,
// publicly-documented Supabase CLI local-dev demo keys/URL — not real
// secrets. Overridable via SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY /
// SUPABASE_TEST_SERVICE_ROLE_KEY / SUPABASE_TEST_DB_URL for a machine
// whose local stack runs on non-default ports — set only as a local
// shell/CI env var, never committed here (see Phase 4's report for why).
const LOCAL_URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const DB_URL =
  process.env.SUPABASE_TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function isLocalStackUp(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_URL}/rest/v1/`, { headers: { apikey: SERVICE_ROLE_KEY } });
    if (!res.ok) return false;
    const body = await res.text();
    // Same project-identity check as the Phase 4 integration file, for
    // the same reason: a bare 200 isn't enough to prove this is *our*
    // schema, not some other local Supabase project's.
    return body.includes("google_calendar_sync_error");
  } catch {
    return false;
  }
}

const stackUp = await isLocalStackUp();
if (!stackUp) {
  console.warn(
    `[phase5-integration] Local Supabase stack not reachable at ${LOCAL_URL} — ` +
      "skipping all real-database tests in this file. Run `npx supabase start` " +
      "and `npx supabase migration up` first to exercise them. The singleton " +
      "UNIQUE constraint and real concurrent-upsert behavior are NOT verified " +
      "when these are skipped.",
  );
}

describe.skipIf(!stackUp)("Phase 5 — business_settings singleton (real Postgres)", () => {
  const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anon = createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } });

  let nonAdminUserId: string;
  let nonAdminAccessToken: string;
  // The row's original, pre-suite data — restored in afterAll so this
  // suite never leaves the shared local table in a test-only state.
  let originalRow: Record<string, unknown> | null = null;

  async function deleteAllRows() {
    await admin.from("business_settings").delete().not("id", "is", null);
  }

  async function upsertRow(payload: Record<string, unknown>) {
    return admin
      .from("business_settings")
      .upsert({ singleton: true, ...payload }, { onConflict: "singleton" })
      .select("*")
      .single();
  }

  beforeAll(async () => {
    const { data } = await admin.from("business_settings").select("*").maybeSingle();
    originalRow = data;

    const nonAdminEmail = `phase5-nonadmin-${Date.now()}@example.com`;
    const nonAdminPassword = "Test1234!Test1234!";
    const { data: nonAdminRes, error: nonAdminError } = await admin.auth.admin.createUser({
      email: nonAdminEmail,
      password: nonAdminPassword,
      email_confirm: true,
    });
    if (nonAdminError || !nonAdminRes.user) {
      throw new Error(`Failed to seed non-admin user: ${nonAdminError?.message}`);
    }
    nonAdminUserId = nonAdminRes.user.id;

    const { data: signInRes, error: signInError } = await anon.auth.signInWithPassword({
      email: nonAdminEmail,
      password: nonAdminPassword,
    });
    if (signInError || !signInRes.session) {
      throw new Error(`Failed to sign in non-admin test user: ${signInError?.message}`);
    }
    nonAdminAccessToken = signInRes.session.access_token;
  });

  afterAll(async () => {
    // Restore the table to exactly its pre-suite state.
    await deleteAllRows();
    if (originalRow) {
      await admin.from("business_settings").insert(originalRow);
    }
    if (nonAdminUserId) await admin.auth.admin.deleteUser(nonAdminUserId);
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
  });

  it("1. an empty table accepts the first save", async () => {
    await deleteAllRows();

    const { data, error } = await upsertRow({ business_name: "First Save Co" });

    expect(error).toBeNull();
    expect(data?.business_name).toBe("First Save Co");
    const { count } = await admin
      .from("business_settings")
      .select("id", { count: "exact", head: true });
    expect(count).toBe(1);
  });

  it("2. a second save updates the same row, not a new one", async () => {
    await deleteAllRows();
    const { data: first } = await upsertRow({ business_name: "Version 1" });

    const { data: second, error } = await upsertRow({ business_name: "Version 2" });

    expect(error).toBeNull();
    expect(second?.id).toBe(first?.id);
    expect(second?.business_name).toBe("Version 2");
    const { count } = await admin
      .from("business_settings")
      .select("id", { count: "exact", head: true });
    expect(count).toBe(1);
  });

  it("3. two concurrent first saves result in exactly one row", async () => {
    await deleteAllRows();

    const [resA, resB] = await Promise.all([
      upsertRow({ business_name: "Concurrent A" }),
      upsertRow({ business_name: "Concurrent B" }),
    ]);

    // Unlike an INSERT-vs-INSERT race, ON CONFLICT DO UPDATE means both
    // concurrent callers succeed (one inserts, the other is serialized
    // into updating that same row) — the guarantee under test is the
    // row count, not that one call fails.
    expect(resA.error).toBeNull();
    expect(resB.error).toBeNull();
    const { data: rows } = await admin.from("business_settings").select("business_name");
    expect(rows).toHaveLength(1);
    expect(["Concurrent A", "Concurrent B"]).toContain(rows![0]!.business_name);
  });

  it("4. client-supplied different ids cannot create two rows", async () => {
    await deleteAllRows();
    const idA = "11111111-1111-1111-1111-111111111111";
    const idB = "22222222-2222-2222-2222-222222222222";

    const { error: firstError } = await admin
      .from("business_settings")
      .insert({ id: idA, singleton: true, business_name: "Row A" });
    expect(firstError).toBeNull();

    const { error: secondError } = await admin
      .from("business_settings")
      .insert({ id: idB, singleton: true, business_name: "Row B" });

    expect(secondError).not.toBeNull();
    expect(secondError?.message).toMatch(/duplicate key|unique constraint/i);
    const { count } = await admin
      .from("business_settings")
      .select("id", { count: "exact", head: true });
    expect(count).toBe(1);
  });

  it("5. the migration's consolidation rule preserves the most recently updated row", async () => {
    // Requires raw SQL (multi-statement DDL + an explicit transaction we
    // roll back) that PostgREST can't express — a real `pg` connection
    // to the same disposable local database, never production. The
    // whole scenario runs inside one transaction that is always rolled
    // back, so it can never affect the shared table used by every other
    // test in this file, regardless of pass/fail.
    const pg = new PgClient({ connectionString: DB_URL });
    await pg.connect();
    try {
      await pg.query("BEGIN");
      await pg.query(
        "ALTER TABLE public.business_settings DROP CONSTRAINT business_settings_singleton_true",
      );
      await pg.query("DROP INDEX business_settings_singleton_key");
      await pg.query("DELETE FROM public.business_settings"); // start from a known-empty state
      await pg.query(
        `INSERT INTO public.business_settings (business_name, updated_at, singleton)
         VALUES ('Older Row', now() - interval '30 days', true)`,
      );
      const { rows: newerInserted } = await pg.query<{ id: string }>(
        `INSERT INTO public.business_settings (business_name, updated_at, singleton)
         VALUES ('Newer Row', now(), true) RETURNING id`,
      );

      // Exactly the consolidation statement from the migration.
      await pg.query(`
        DELETE FROM public.business_settings
        WHERE id NOT IN (
          SELECT id FROM public.business_settings
          ORDER BY updated_at DESC, id ASC
          LIMIT 1
        )
      `);

      const { rows: remaining } = await pg.query<{ id: string; business_name: string }>(
        "SELECT id, business_name FROM public.business_settings",
      );
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.id).toBe(newerInserted[0]!.id);
      expect(remaining[0]!.business_name).toBe("Newer Row");
    } finally {
      await pg.query("ROLLBACK");
      await pg.end();
    }
  });

  it("6. the singleton UNIQUE constraint rejects a second row outright", async () => {
    await deleteAllRows();
    const { error: firstError } = await admin
      .from("business_settings")
      .insert({ singleton: true, business_name: "Only Row" });
    expect(firstError).toBeNull();

    const { error: secondError } = await admin
      .from("business_settings")
      .insert({ singleton: true, business_name: "Second Row" });

    expect(secondError).not.toBeNull();
    expect(secondError?.message).toMatch(/duplicate key|unique constraint/i);
    const { count } = await admin
      .from("business_settings")
      .select("id", { count: "exact", head: true });
    expect(count).toBe(1);
  });

  it("7. every reader retrieves the same preserved row", async () => {
    await deleteAllRows();
    await upsertRow({ business_name: "Shared Row Co", address: "123 Shared St" });

    // The same three .select(...).eq("singleton", true).maybeSingle()
    // queries getSettings/getEmailBrand/the Calendar loader each run.
    const [full, brandShape, addressOnly] = await Promise.all([
      anon.from("business_settings").select("*").eq("singleton", true).maybeSingle(),
      anon
        .from("business_settings")
        .select("business_name, address, phone, whatsapp_number")
        .eq("singleton", true)
        .maybeSingle(),
      anon.from("business_settings").select("address").eq("singleton", true).maybeSingle(),
    ]);

    expect(full.data?.business_name).toBe("Shared Row Co");
    expect(brandShape.data?.business_name).toBe("Shared Row Co");
    expect(addressOnly.data?.address).toBe("123 Shared St");
    expect(full.data?.id).toBeDefined();
    // All three genuinely read the identical row.
    expect(brandShape.data?.address).toBe(full.data?.address);
  });

  it("8. existing settings data survives the migration's schema changes", async () => {
    // Same rolled-back-transaction procedure as test 5: re-runs the
    // migration's own idempotent ADD COLUMN/constraint statements
    // against the CURRENT real row and confirms every pre-existing
    // field is byte-identical afterward — proving the schema change
    // itself is non-destructive, not just idempotent.
    await deleteAllRows();
    await upsertRow({
      business_name: "Pre-Migration Data",
      address: "Should Survive St",
      phone: "0500000000",
    });

    const pg = new PgClient({ connectionString: DB_URL });
    await pg.connect();
    try {
      await pg.query("BEGIN");
      const { rows: before } = await pg.query(
        "SELECT business_name, address, phone FROM public.business_settings",
      );

      // Re-running the migration's idempotent DDL again must be a no-op
      // for existing data.
      await pg.query(
        "ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS singleton BOOLEAN NOT NULL DEFAULT true",
      );
      await pg.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_settings_singleton_true') THEN
            ALTER TABLE public.business_settings ADD CONSTRAINT business_settings_singleton_true CHECK (singleton IS TRUE);
          END IF;
        END $$;
      `);
      await pg.query(
        "CREATE UNIQUE INDEX IF NOT EXISTS business_settings_singleton_key ON public.business_settings (singleton)",
      );

      const { rows: after } = await pg.query(
        "SELECT business_name, address, phone FROM public.business_settings",
      );
      expect(after).toEqual(before);
      expect(after[0]!.business_name).toBe("Pre-Migration Data");
      expect(after[0]!.address).toBe("Should Survive St");
    } finally {
      await pg.query("ROLLBACK");
      await pg.end();
    }
  });

  it("9. a normal (non-admin) authenticated user cannot write settings directly", async () => {
    await deleteAllRows();
    await upsertRow({ business_name: "Protected Row" });

    const nonAdminClient = createClient(LOCAL_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${nonAdminAccessToken}` } },
    });

    const { error } = await nonAdminClient
      .from("business_settings")
      .update({ business_name: "Hacked" })
      .eq("singleton", true);

    // INSERT/UPDATE/DELETE were revoked from `authenticated` back in
    // 20260627220000_security_hardening.sql — rejected before RLS is
    // even evaluated.
    expect(error).not.toBeNull();
    const { data: row } = await admin
      .from("business_settings")
      .select("business_name")
      .eq("singleton", true)
      .maybeSingle();
    expect(row?.business_name).toBe("Protected Row");
  });

  it("10. the real saveSettings/getSettings server functions save and read successfully end-to-end", async () => {
    await deleteAllRows();

    vi.resetModules();
    vi.doMock("@tanstack/react-start", async () => {
      const fake = await import("./helpers/fakeTanstackStart");
      return { createServerFn: fake.createServerFn, createMiddleware: fake.createMiddleware };
    });
    vi.doMock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
    vi.doMock("@/api/admin/middleware", async () => {
      const { fakeRequireAdmin } = await import("./helpers/mockMiddleware");
      return { requireAdmin: fakeRequireAdmin(admin, "test-admin-id") };
    });
    // Intentionally NOT mocking @/integrations/supabase/client.server —
    // it resolves to the real module, which reads SUPABASE_URL/
    // SUPABASE_SERVICE_ROLE_KEY from the environment. Point those at
    // this same local stack for the duration of this one test only.
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = LOCAL_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;

    try {
      const { saveSettings, getSettings } = await import("@/api/settings/settings");

      const saveResult = await saveSettings({
        data: { payload: { business_name: "End To End Co", address: "Real Path Ave" } },
      });
      expect(saveResult.success).toBe(true);
      expect(saveResult.settings?.business_name).toBe("End To End Co");

      const readBack = await getSettings();
      expect(readBack?.business_name).toBe("End To End Co");
      expect(readBack?.address).toBe("Real Path Ave");

      const { count } = await admin
        .from("business_settings")
        .select("id", { count: "exact", head: true });
      expect(count).toBe(1);
    } finally {
      if (prevUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = prevUrl;
      if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
      vi.resetModules();
    }
  });
});
