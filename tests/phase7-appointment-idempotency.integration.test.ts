import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { futureOpenDate } from "./helpers/businessDate";

// REAL Postgres/Supabase integration tests — nothing in this file is
// mocked. Requires a local, disposable Supabase stack (Docker) started
// via `npx supabase start` against supabase/config.toml, which uses the
// Supabase CLI's own standard default ports. If that stack isn't
// reachable, every test in this file is skipped (not failed, not
// silently passed) — see the console warning emitted below and the
// Phase 7 report for exactly what this means for concurrency claims.
//
// Never connects to production Supabase. Defaults below are the fixed,
// publicly-documented Supabase CLI local-dev demo keys/URL — every local
// Supabase stack anywhere uses this exact key set by default; they are
// not a real project's secrets. Overridable via SUPABASE_TEST_URL /
// SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY for a machine
// whose local stack runs on non-default ports.
const LOCAL_URL = process.env.SUPABASE_TEST_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Same reachability check as the Phase 4/5 integration suites — confirms
// this is genuinely this project's schema (not just any Postgres/
// PostgREST answering on the default port), so this file skips cleanly
// instead of crashing confusingly if a different local Supabase project
// happens to be running instead.
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
    `[phase7-integration] Local Supabase stack not reachable at ${LOCAL_URL} — ` +
      "skipping all real-database tests in this file. Run `npx supabase start` " +
      "first (see supabase/config.toml) to exercise them. Concurrent-idempotency " +
      "and advisory-lock behavior are NOT verified when these are skipped.",
  );
}

describe.skipIf(!stackUp)("Phase 7 — appointment idempotency (real Postgres)", () => {
  const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let serviceId: string;
  let serviceId2: string;
  const createdAppointmentIds: string[] = [];
  const createdUserIds: string[] = [];

  // A fresh user per test that needs a clean "0 active appointments"
  // slate — create_appointment's MAX_APPOINTMENTS_REACHED cap (2 active
  // per user) would otherwise make later tests fail for reasons unrelated
  // to what they're actually verifying, since every successful create in
  // this file leaves a 'confirmed' (active) row behind.
  async function createTestUser(): Promise<string> {
    const email = `phase7-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "Test1234!Test1234!",
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Failed to seed user: ${error?.message}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  interface CreateRow {
    appointment_id: string;
    is_new: boolean;
  }

  interface RescheduleRow {
    appointment_id: string;
    applied: boolean;
  }

  function callCreateRpc(
    client: SupabaseClient,
    opts: {
      userId: string;
      serviceId: string;
      date: string;
      time: string;
      name?: string;
      phone?: string;
      notes?: string | null;
      idempotencyKey?: string | null;
    },
  ): Promise<{ data: CreateRow[] | null; error: { message: string } | null }> {
    return client.rpc("create_appointment", {
      p_user_id: opts.userId,
      p_service_id: opts.serviceId,
      p_appointment_date: opts.date,
      p_appointment_time: opts.time,
      p_customer_name: opts.name ?? "Integration Test Customer",
      p_customer_phone: opts.phone ?? "0500000000",
      p_notes: opts.notes ?? null,
      p_idempotency_key: opts.idempotencyKey ?? null,
    }) as unknown as Promise<{ data: CreateRow[] | null; error: { message: string } | null }>;
  }

  function callRescheduleRpc(
    client: SupabaseClient,
    opts: {
      userId: string;
      appointmentId: string;
      serviceId: string;
      date: string;
      time: string;
      idempotencyKey?: string | null;
    },
  ): Promise<{ data: RescheduleRow[] | null; error: { message: string } | null }> {
    return client.rpc("reschedule_appointment", {
      p_user_id: opts.userId,
      p_appointment_id: opts.appointmentId,
      p_service_id: opts.serviceId,
      p_appointment_date: opts.date,
      p_appointment_time: opts.time,
      p_idempotency_key: opts.idempotencyKey ?? null,
    }) as unknown as Promise<{ data: RescheduleRow[] | null; error: { message: string } | null }>;
  }

  // create_appointment/reschedule_appointment now RETURN TABLE(...), so
  // supabase-js's `data` comes back as a one-row array — unwrap it the
  // same way appointments.ts's server handlers do.
  function row<T>(res: { data: T[] | null; error: unknown }): T | undefined {
    return res.data?.[0];
  }

  beforeAll(async () => {
    const { data: service, error: serviceError } = await admin
      .from("services")
      .insert({ name: "Phase 7 Integration Test Service", category: "test", duration_minutes: 30 })
      .select("id")
      .single();
    if (serviceError || !service)
      throw new Error(`Failed to seed service: ${serviceError?.message}`);
    serviceId = service.id;

    // A second, same-duration service — needed only so two genuinely
    // different appointments can target the exact same date/time in a
    // fixture without tripping the legacy per-service
    // appointments_..._key unique constraint, which is scoped per
    // service and unrelated to the idempotency logic under test here.
    const { data: service2, error: service2Error } = await admin
      .from("services")
      .insert({
        name: "Phase 7 Integration Test Service 2",
        category: "test",
        duration_minutes: 30,
      })
      .select("id")
      .single();
    if (service2Error || !service2)
      throw new Error(`Failed to seed second service: ${service2Error?.message}`);
    serviceId2 = service2.id;
  });

  afterAll(async () => {
    if (createdAppointmentIds.length > 0) {
      await admin.from("appointments").delete().in("id", createdAppointmentIds);
    }
    if (serviceId) await admin.from("services").delete().eq("id", serviceId);
    if (serviceId2) await admin.from("services").delete().eq("id", serviceId2);
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("1. two concurrent identical creates with the same key return one appointment", async () => {
    const userId = await createTestUser();
    const date = futureOpenDate(1);
    const key = crypto.randomUUID();
    const payload = { userId, serviceId, date, time: "10:00:00", idempotencyKey: key };

    const [resA, resB] = await Promise.all([
      callCreateRpc(admin, payload),
      callCreateRpc(admin, payload),
    ]);

    expect(resA.error).toBeNull();
    expect(resB.error).toBeNull();
    const rowA = row(resA)!;
    const rowB = row(resB)!;
    if (rowA.appointment_id) createdAppointmentIds.push(rowA.appointment_id);

    expect(rowA.appointment_id).toBe(rowB.appointment_id);
    // Exactly one of the two calls actually created the row.
    expect([rowA.is_new, rowB.is_new].filter(Boolean).length).toBe(1);

    const { data: rows } = await admin
      .from("appointments")
      .select("id")
      .eq("user_id", userId)
      .eq("appointment_date", date)
      .eq("appointment_time", "10:00:00");
    expect(rows?.length).toBe(1);
  });

  it("2. the same key and same payload return the same appointment ID", async () => {
    const userId = await createTestUser();
    const date = futureOpenDate(2);
    const key = crypto.randomUUID();
    const payload = { userId, serviceId, date, time: "10:00:00", idempotencyKey: key };

    const first = row(await callCreateRpc(admin, payload))!;
    createdAppointmentIds.push(first.appointment_id);
    expect(first.is_new).toBe(true);

    const second = row(await callCreateRpc(admin, payload))!;
    expect(second.appointment_id).toBe(first.appointment_id);
    expect(second.is_new).toBe(false);

    const { data: rows } = await admin.from("appointments").select("id").eq("user_id", userId);
    expect(rows?.length).toBe(1);
  });

  it("3. the same key with different payload is rejected", async () => {
    const userId = await createTestUser();
    const date = futureOpenDate(3);
    const key = crypto.randomUUID();

    const first = row(
      await callCreateRpc(admin, {
        userId,
        serviceId,
        date,
        time: "10:00:00",
        idempotencyKey: key,
      }),
    )!;
    createdAppointmentIds.push(first.appointment_id);

    // Same key, different time — a materially different request.
    const second = await callCreateRpc(admin, {
      userId,
      serviceId,
      date,
      time: "11:00:00",
      idempotencyKey: key,
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.message).toContain("IDEMPOTENCY_PAYLOAD_MISMATCH");

    const { data: rows } = await admin.from("appointments").select("id").eq("user_id", userId);
    expect(rows?.length).toBe(1); // the mismatched retry created nothing
  });

  it("4. a different key for an occupied slot fails normally", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const date = futureOpenDate(4);
    const time = "10:00:00";

    const first = row(
      await callCreateRpc(admin, {
        userId: userA,
        serviceId,
        date,
        time,
        idempotencyKey: crypto.randomUUID(),
      }),
    )!;
    createdAppointmentIds.push(first.appointment_id);

    // A genuinely new attempt (different user, brand-new key) for the
    // exact same slot must still conflict normally — idempotency only
    // ever short-circuits a *recognized* retry, never a new one.
    const second = await callCreateRpc(admin, {
      userId: userB,
      serviceId,
      date,
      time,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.message).toContain("TIME_TAKEN");
  });

  it("5. keys are isolated between users", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const date = futureOpenDate(5);
    const sharedKey = crypto.randomUUID();

    const resA = row(
      await callCreateRpc(admin, {
        userId: userA,
        serviceId,
        date,
        time: "10:00:00",
        idempotencyKey: sharedKey,
      }),
    )!;
    // A different time (not just a different service — the conflict
    // check is cross-service, a single shared resource) so this is a
    // genuinely independent booking, isolating what this test actually
    // verifies (key scoping) from ordinary slot-conflict behavior.
    const resB = row(
      await callCreateRpc(admin, {
        userId: userB,
        serviceId: serviceId2,
        date,
        time: "11:00:00",
        idempotencyKey: sharedKey,
      }),
    )!;
    createdAppointmentIds.push(resA.appointment_id, resB.appointment_id);

    expect(resA.is_new).toBe(true);
    expect(resB.is_new).toBe(true);
    expect(resA.appointment_id).not.toBe(resB.appointment_id);
  });

  it("6. two concurrent identical reschedules apply once", async () => {
    const userId = await createTestUser();
    const originalDate = futureOpenDate(6);
    const created = row(
      await callCreateRpc(admin, {
        userId,
        serviceId,
        date: originalDate,
        time: "10:00:00",
        idempotencyKey: crypto.randomUUID(),
      }),
    )!;
    createdAppointmentIds.push(created.appointment_id);

    const targetDate = futureOpenDate(16);
    const key = crypto.randomUUID();
    const payload = {
      userId,
      appointmentId: created.appointment_id,
      serviceId,
      date: targetDate,
      time: "14:00:00",
      idempotencyKey: key,
    };

    const [resA, resB] = await Promise.all([
      callRescheduleRpc(admin, payload),
      callRescheduleRpc(admin, payload),
    ]);

    expect(resA.error).toBeNull();
    expect(resB.error).toBeNull();
    const rowA = row(resA)!;
    const rowB = row(resB)!;
    expect(rowA.appointment_id).toBe(created.appointment_id);
    expect(rowB.appointment_id).toBe(created.appointment_id);
    // Exactly one call actually performed the write.
    expect([rowA.applied, rowB.applied].filter(Boolean).length).toBe(1);

    const { data: finalRow } = await admin
      .from("appointments")
      .select("appointment_date, appointment_time")
      .eq("id", created.appointment_id)
      .single();
    expect(finalRow?.appointment_date).toBe(targetDate);
    expect(String(finalRow?.appointment_time)).toBe("14:00:00");
  });

  it("7. reschedule key reuse with a different target is rejected", async () => {
    const userId = await createTestUser();
    const originalDate = futureOpenDate(7);
    const created = row(
      await callCreateRpc(admin, {
        userId,
        serviceId,
        date: originalDate,
        time: "10:00:00",
        idempotencyKey: crypto.randomUUID(),
      }),
    )!;
    createdAppointmentIds.push(created.appointment_id);

    const key = crypto.randomUUID();
    const targetA = futureOpenDate(17);
    const first = await callRescheduleRpc(admin, {
      userId,
      appointmentId: created.appointment_id,
      serviceId,
      date: targetA,
      time: "14:00:00",
      idempotencyKey: key,
    });
    expect(first.error).toBeNull();

    const targetB = futureOpenDate(18);
    const second = await callRescheduleRpc(admin, {
      userId,
      appointmentId: created.appointment_id,
      serviceId,
      date: targetB,
      time: "15:00:00",
      idempotencyKey: key,
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.message).toContain("IDEMPOTENCY_PAYLOAD_MISMATCH");

    const { data: finalRow } = await admin
      .from("appointments")
      .select("appointment_date, appointment_time")
      .eq("id", created.appointment_id)
      .single();
    // Unchanged by the rejected mismatched retry — still at target A.
    expect(finalRow?.appointment_date).toBe(targetA);
    expect(String(finalRow?.appointment_time)).toBe("14:00:00");
  });

  it("8. ownership checks still work", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const date = futureOpenDate(8);
    const created = row(
      await callCreateRpc(admin, {
        userId: owner,
        serviceId,
        date,
        time: "10:00:00",
        idempotencyKey: crypto.randomUUID(),
      }),
    )!;
    createdAppointmentIds.push(created.appointment_id);

    const { error } = await callRescheduleRpc(admin, {
      userId: intruder,
      appointmentId: created.appointment_id,
      serviceId,
      date: futureOpenDate(19),
      time: "14:00:00",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("NOT_FOUND");

    const { data: finalRow } = await admin
      .from("appointments")
      .select("appointment_date")
      .eq("id", created.appointment_id)
      .single();
    expect(finalRow?.appointment_date).toBe(date); // untouched
  });

  it("9. existing advisory-lock conflict behavior still works", async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    const date = futureOpenDate(9);
    const time = "10:00:00";

    // Two different users, two different (brand-new) idempotency keys,
    // genuinely concurrent — this is ordinary double-booking protection,
    // unrelated to any recognized retry, and must behave exactly as it
    // did before Phase 7.
    const [resA, resB] = await Promise.all([
      callCreateRpc(admin, {
        userId: userA,
        serviceId,
        date,
        time,
        idempotencyKey: crypto.randomUUID(),
      }),
      callCreateRpc(admin, {
        userId: userB,
        serviceId: serviceId2,
        date,
        time,
        idempotencyKey: crypto.randomUUID(),
      }),
    ]);

    const results = [resA, resB];
    const succeeded = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(failed[0]!.error?.message).toContain("TIME_TAKEN");

    const winner = row(succeeded[0]!)!;
    createdAppointmentIds.push(winner.appointment_id);
  });

  it("10. idempotency does not bypass booking limits or availability validation", async () => {
    const userId = await createTestUser();
    const dateA = futureOpenDate(10);
    const dateB = futureOpenDate(11);
    const dateC = futureOpenDate(12);

    const first = row(
      await callCreateRpc(admin, {
        userId,
        serviceId,
        date: dateA,
        time: "10:00:00",
        idempotencyKey: crypto.randomUUID(),
      }),
    )!;
    const second = row(
      await callCreateRpc(admin, {
        userId,
        serviceId,
        date: dateB,
        time: "10:00:00",
        idempotencyKey: crypto.randomUUID(),
      }),
    )!;
    createdAppointmentIds.push(first.appointment_id, second.appointment_id);

    // A third booking attempt, with a brand-new (never-seen) idempotency
    // key — the presence of a key must not itself grant any exemption
    // from MAX_APPOINTMENTS_REACHED, since this key has no prior row to
    // match against and the request goes through full normal validation.
    const third = await callCreateRpc(admin, {
      userId,
      serviceId,
      date: dateC,
      time: "10:00:00",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(third.error).not.toBeNull();
    expect(third.error?.message).toContain("MAX_APPOINTMENTS_REACHED");

    const { data: rows } = await admin.from("appointments").select("id").eq("user_id", userId);
    expect(rows?.length).toBe(2); // the rejected third attempt created nothing
  });
});
