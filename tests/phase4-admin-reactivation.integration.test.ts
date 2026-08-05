import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { jerusalemTodayStr } from "@/lib/jerusalem-time";
import { futureOpenDate, pastDateStr } from "./helpers/businessDate";

// REAL Postgres/Supabase integration tests — nothing in this file is
// mocked. Requires a local, disposable Supabase stack (Docker) started
// via `npx supabase start` against supabase/config.toml, which uses the
// Supabase CLI's own standard default ports. If that stack isn't
// reachable, every test in this file is skipped (not failed, not
// silently passed) — see the console warning emitted below and the
// Phase 4 report for exactly what this means for concurrency/locking
// claims.
//
// Never connects to production Supabase. Defaults below are the fixed,
// publicly-documented Supabase CLI local-dev demo keys/URL (JWT_SECRET
// "super-secret-jwt-token-with-at-least-32-characters-long") — every
// local Supabase stack anywhere uses this exact key set by default; they
// are not a real project's secrets. Overridable via SUPABASE_TEST_URL /
// SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY for a machine
// whose local stack runs on non-default ports (e.g. because another,
// unrelated local Supabase project already occupies the default range)
// — set only as a local shell/CI env var, never committed here.
const LOCAL_URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// A bare "does something respond on this port" check isn't enough — on
// a machine that already has a different, unrelated local Supabase
// project running on the CLI's default port, that project's own stack
// would answer here too, and this suite would then crash confusingly
// mid-beforeAll (discovered while verifying this file) instead of
// skipping cleanly. Confirming the service-role-scoped OpenAPI document
// mentions google_calendar_sync_error — an appointments column that
// only exists in *this* project's migrations — verifies it's genuinely
// this project's schema, not just any reachable Postgres/PostgREST.
// (admin_update_appointment_status itself isn't a reliable marker here:
// PostgREST's OpenAPI generation doesn't surface it for either role in
// the CLI version this was verified against — confirmed directly with
// curl against both keys before settling on a column instead.)
async function isLocalStackUp(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_URL}/rest/v1/`, { headers: { apikey: SERVICE_ROLE_KEY } });
    if (!res.ok) return false;
    const body = await res.text();
    return body.includes("google_calendar_sync_error");
  } catch {
    return false;
  }
}

const stackUp = await isLocalStackUp();
if (!stackUp) {
  console.warn(
    `[phase4-integration] Local Supabase stack not reachable at ${LOCAL_URL} — ` +
      "skipping all real-database tests in this file. Run `npx supabase start` " +
      "first (see supabase/config.toml) to exercise them. Database concurrency, " +
      "RLS, and advisory-lock behavior are NOT verified when these are skipped.",
  );
}

describe.skipIf(!stackUp)("Phase 4 — admin_update_appointment_status (real Postgres)", () => {
  const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let serviceId: string;
  let serviceId2: string;
  let userId: string;
  let nonAdminUserId: string;
  let nonAdminAccessToken: string;
  const createdAppointmentIds: string[] = [];

  // Reserved exclusively as an INSERT-time placeholder for past-dated
  // fixtures below (see insertRawAppointment) — never used as a "real"
  // target date by any test, so it can never collide with one.
  const PLACEHOLDER_DATE = futureOpenDate(1);
  const todayStr = jerusalemTodayStr();

  async function insertRawAppointment(opts: {
    date: string;
    time: string;
    status: "pending" | "confirmed" | "completed" | "cancelled";
    userIdOverride?: string;
    serviceIdOverride?: string;
  }): Promise<string> {
    // The INSERT-only past-date trigger (and, incidentally, the legacy
    // appointments_service_id_appointment_date_appointment_time_key
    // unique constraint) only apply at INSERT time — a genuinely past
    // opts.date would be rejected outright by the trigger, so those
    // fixtures insert at a safe placeholder date first and are moved to
    // their real (past) target via a follow-up UPDATE, which neither
    // guard applies to. Every other fixture inserts directly at its real
    // target, since those dates are already valid.
    const insertDate = opts.date < todayStr ? PLACEHOLDER_DATE : opts.date;
    const { data, error } = await admin
      .from("appointments")
      .insert({
        user_id: opts.userIdOverride ?? userId,
        service_id: opts.serviceIdOverride ?? serviceId,
        appointment_date: insertDate,
        appointment_time: opts.time,
        customer_name: "Integration Test Customer",
        customer_phone: "0500000000",
        status: "pending",
        duration_minutes: 30,
        service_name: "Phase 4 Test Service",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to seed appointment: ${error?.message}`);
    createdAppointmentIds.push(data.id);

    const { error: updateError } = await admin
      .from("appointments")
      .update({ status: opts.status, appointment_date: opts.date })
      .eq("id", data.id);
    if (updateError) throw new Error(`Failed to set fixture status: ${updateError.message}`);

    return data.id;
  }

  async function getAvailabilitySettingsId(): Promise<string> {
    const { data, error } = await admin
      .from("availability_settings")
      .select("id")
      .limit(1)
      .single();
    if (error || !data) throw new Error("No availability_settings row found");
    return data.id;
  }

  async function callAdminRpc(client: SupabaseClient, appointmentId: string, status: string) {
    return client.rpc("admin_update_appointment_status", {
      p_appointment_id: appointmentId,
      p_status: status,
    });
  }

  beforeAll(async () => {
    const { data: service, error: serviceError } = await admin
      .from("services")
      .insert({ name: "Phase 4 Integration Test Service", category: "test", duration_minutes: 30 })
      .select("id")
      .single();
    if (serviceError || !service)
      throw new Error(`Failed to seed service: ${serviceError?.message}`);
    serviceId = service.id;

    // A second, same-duration service — used only so two DIFFERENT
    // appointments can legitimately target the exact same date/time in
    // a fixture (the overlap logic that actually matters is date+time+
    // duration across ALL services, not per-service) without tripping
    // the legacy appointments_service_id_appointment_date_appointment_time_key
    // unique constraint, which is scoped per-service and would otherwise
    // reject the second INSERT outright before the RPC is even involved.
    const { data: service2, error: service2Error } = await admin
      .from("services")
      .insert({
        name: "Phase 4 Integration Test Service 2",
        category: "test",
        duration_minutes: 30,
      })
      .select("id")
      .single();
    if (service2Error || !service2) {
      throw new Error(`Failed to seed second service: ${service2Error?.message}`);
    }
    serviceId2 = service2.id;

    const email = `phase4-owner-${Date.now()}@example.com`;
    const { data: userRes, error: userError } = await admin.auth.admin.createUser({
      email,
      password: "Test1234!Test1234!",
      email_confirm: true,
    });
    if (userError || !userRes.user) throw new Error(`Failed to seed user: ${userError?.message}`);
    userId = userRes.user.id;

    // A genuine non-admin, authenticated user — used to prove the RPC
    // rejects a real caller who isn't service_role, via a real sign-in
    // (real JWT), not a mocked one.
    const nonAdminEmail = `phase4-nonadmin-${Date.now()}@example.com`;
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

    const anonClient = createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: signInRes, error: signInError } = await anonClient.auth.signInWithPassword({
      email: nonAdminEmail,
      password: nonAdminPassword,
    });
    if (signInError || !signInRes.session) {
      throw new Error(`Failed to sign in non-admin test user: ${signInError?.message}`);
    }
    nonAdminAccessToken = signInRes.session.access_token;
  });

  afterAll(async () => {
    // Clean up everything this suite created — never leaves test data
    // behind in the (disposable, local-only) database.
    if (createdAppointmentIds.length > 0) {
      await admin.from("appointments").delete().in("id", createdAppointmentIds);
    }
    if (serviceId) await admin.from("services").delete().eq("id", serviceId);
    if (serviceId2) await admin.from("services").delete().eq("id", serviceId2);
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (nonAdminUserId) await admin.auth.admin.deleteUser(nonAdminUserId);
  });

  it("1. reactivation succeeds when the slot is free", async () => {
    const date = futureOpenDate(30);
    const id = await insertRawAppointment({ date, time: "10:00:00", status: "cancelled" });

    const { data, error } = await callAdminRpc(admin, id, "confirmed");

    expect(error).toBeNull();
    expect(data).toBe(id);

    const { data: row } = await admin.from("appointments").select("status").eq("id", id).single();
    expect(row?.status).toBe("confirmed");
  });

  it("2. reactivation fails when another active appointment occupies the slot", async () => {
    const date = futureOpenDate(31);
    const occupiedTime = "11:00:00";
    // A separate, already-active appointment occupying the slot (a
    // different service — same duration — so its own INSERT doesn't
    // collide with the per-service unique constraint against the
    // cancelled fixture below).
    await insertRawAppointment({
      date,
      time: occupiedTime,
      status: "confirmed",
      serviceIdOverride: serviceId2,
    });
    const cancelledId = await insertRawAppointment({
      date,
      time: occupiedTime,
      status: "cancelled",
    });

    const { error } = await callAdminRpc(admin, cancelledId, "confirmed");

    expect(error).not.toBeNull();
    expect(error?.message).toContain("APPOINTMENT_TIME_CONFLICT");

    const { data: row } = await admin
      .from("appointments")
      .select("status")
      .eq("id", cancelledId)
      .single();
    expect(row?.status).toBe("cancelled"); // unchanged — the failed call didn't partially apply
  });

  it("3. two concurrent reactivation attempts for the same slot cannot both succeed", async () => {
    const date = futureOpenDate(32);
    const time = "12:00:00";
    const idA = await insertRawAppointment({ date, time, status: "cancelled" });
    // Different service (same duration) so this second INSERT doesn't
    // collide with the per-service unique constraint against idA above
    // — both still target the identical date+time, which is what the
    // RPC's overlap check actually keys on.
    const idB = await insertRawAppointment({
      date,
      time,
      status: "cancelled",
      serviceIdOverride: serviceId2,
    });

    // Two genuinely concurrent HTTP requests -> two separate Postgres
    // backend connections, both attempting to reactivate into the exact
    // same slot at once. This is the actual scenario the Phase 4 bug
    // report describes.
    const [resA, resB] = await Promise.all([
      callAdminRpc(admin, idA, "confirmed"),
      callAdminRpc(admin, idB, "confirmed"),
    ]);

    const results = [resA, resB];
    const succeeded = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(failed[0]!.error?.message).toContain("APPOINTMENT_TIME_CONFLICT");

    const { data: rows } = await admin
      .from("appointments")
      .select("id, status")
      .in("id", [idA, idB]);
    const activeCount = (rows ?? []).filter((r) => r.status === "confirmed").length;
    expect(activeCount).toBe(1); // never both active at once
  });

  it("4. the appointment being reactivated is excluded from its own conflict check", async () => {
    const date = futureOpenDate(33);
    const time = "13:00:00";
    // status = 'completed' (not 'cancelled') specifically: the overlap
    // query's status filter alone (`status <> 'cancelled'`) would NOT
    // exclude a 'completed' row, so this case genuinely exercises the
    // `a.id <> p_appointment_id` self-exclusion — reactivating it back
    // into the exact slot it already occupies must succeed.
    const id = await insertRawAppointment({ date, time, status: "completed" });

    const { error } = await callAdminRpc(admin, id, "confirmed");

    expect(error).toBeNull();
    const { data: row } = await admin.from("appointments").select("status").eq("id", id).single();
    expect(row?.status).toBe("confirmed");
  });

  it("5. reactivating a past appointment fails", async () => {
    const pastDate = pastDateStr(5);
    const id = await insertRawAppointment({
      date: pastDate,
      time: "10:00:00",
      status: "cancelled",
    });

    const { error } = await callAdminRpc(admin, id, "confirmed");

    expect(error).not.toBeNull();
    expect(error?.message).toContain("APPOINTMENT_IN_PAST");
  });

  it("6. reactivation on a closed date fails", async () => {
    const date = futureOpenDate(34);
    const id = await insertRawAppointment({ date, time: "10:00:00", status: "cancelled" });

    const settingsId = await getAvailabilitySettingsId();
    const { data: before } = await admin
      .from("availability_settings")
      .select("closed_dates")
      .eq("id", settingsId)
      .single();
    await admin
      .from("availability_settings")
      .update({ closed_dates: [date] })
      .eq("id", settingsId);

    try {
      const { error } = await callAdminRpc(admin, id, "confirmed");
      expect(error).not.toBeNull();
      expect(error?.message).toContain("APPOINTMENT_ON_CLOSED_DATE");
    } finally {
      await admin
        .from("availability_settings")
        .update({ closed_dates: before?.closed_dates ?? [] })
        .eq("id", settingsId);
    }
  });

  it("7. reactivation overlapping a break fails", async () => {
    const date = futureOpenDate(35);
    // Break configured to fully cover this slot below.
    const id = await insertRawAppointment({ date, time: "13:00:00", status: "cancelled" });

    const settingsId = await getAvailabilitySettingsId();
    const { data: before } = await admin
      .from("availability_settings")
      .select("breaks")
      .eq("id", settingsId)
      .single();
    await admin
      .from("availability_settings")
      .update({ breaks: [{ start: "12:30", end: "14:00" }] })
      .eq("id", settingsId);

    try {
      const { error } = await callAdminRpc(admin, id, "confirmed");
      expect(error).not.toBeNull();
      expect(error?.message).toContain("APPOINTMENT_OUTSIDE_WORKING_HOURS");
    } finally {
      await admin
        .from("availability_settings")
        .update({ breaks: before?.breaks ?? [] })
        .eq("id", settingsId);
    }
  });

  it("8. reactivation outside working hours fails", async () => {
    const date = futureOpenDate(36);
    // 20:00 is after the default 19:00 close on every enabled weekday.
    const id = await insertRawAppointment({ date, time: "20:00:00", status: "cancelled" });

    const { error } = await callAdminRpc(admin, id, "confirmed");

    expect(error).not.toBeNull();
    expect(error?.message).toContain("APPOINTMENT_OUTSIDE_WORKING_HOURS");
  });

  it("9. a normal (non-admin) authenticated user cannot execute the admin RPC", async () => {
    const date = futureOpenDate(37);
    const id = await insertRawAppointment({ date, time: "10:00:00", status: "cancelled" });

    const nonAdminClient = createClient(LOCAL_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${nonAdminAccessToken}` } },
    });

    const { error } = await callAdminRpc(nonAdminClient, id, "confirmed");

    expect(error).not.toBeNull();
    // EXECUTE was never GRANTed to `authenticated` — PostgREST/Postgres
    // reject this before the function body ever runs.
    expect(error?.message.toLowerCase()).toMatch(/permission denied|not find the function/);

    const { data: row } = await admin.from("appointments").select("status").eq("id", id).single();
    expect(row?.status).toBe("cancelled"); // untouched
  });

  it("10. an invalid status transition (cancelled -> completed) fails", async () => {
    const date = futureOpenDate(38);
    const id = await insertRawAppointment({ date, time: "10:00:00", status: "cancelled" });

    const { error } = await callAdminRpc(admin, id, "completed");

    expect(error).not.toBeNull();
    expect(error?.message).toContain("INVALID_STATUS_TRANSITION");

    const { data: row } = await admin.from("appointments").select("status").eq("id", id).single();
    expect(row?.status).toBe("cancelled");
  });
});
