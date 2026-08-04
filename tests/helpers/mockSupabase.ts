import { vi } from "vitest";

export interface Resolution {
  data: unknown;
  error: unknown;
}

export function ok(data: unknown): Resolution {
  return { data, error: null };
}

export function fail(error: unknown): Resolution {
  return { data: null, error };
}

type Resolver = () => Resolution | Promise<Resolution>;

// A minimal, chainable stand-in for a PostgREST query builder. Every
// filter/modifier method (select/eq/neq/in/is/gte/order/limit/update/
// insert/delete) is a no-op that returns the same builder object, and the
// builder itself is "thenable" — matching real postgrest-js, where
// `await supabase.from(x).update(y).eq(...)` resolves directly without
// ever calling .single()/.maybeSingle().
function makeQueryBuilder(resolve: Resolver) {
  const builder: Record<string, unknown> = {};
  const passthroughMethods = [
    "select",
    "eq",
    "neq",
    "in",
    "is",
    "gte",
    "lte",
    "order",
    "limit",
    "update",
    "insert",
    "upsert",
    "delete",
  ];
  for (const method of passthroughMethods) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => resolve());
  builder.single = vi.fn(async () => resolve());
  builder.then = (onFulfilled?: (v: Resolution) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve().then(resolve).then(onFulfilled, onRejected);
  return builder;
}

// A sequence-based mock of `supabaseAdmin` (and the RLS-scoped
// `context.supabase`, same shape). Each call to `.from(table)` pops the
// next queued resolver for that table, in the order the source code is
// known (by direct reading) to issue its queries — a deliberately simple,
// explicit alternative to reimplementing PostgREST generically.
export function createMockSupabaseAdmin() {
  const queues = new Map<string, Resolver[]>();
  const rpcQueue: Resolver[] = [];

  function queueFrom(table: string, resolver: Resolver) {
    const q = queues.get(table) ?? [];
    q.push(resolver);
    queues.set(table, q);
  }

  function queueRpc(resolver: Resolver) {
    rpcQueue.push(resolver);
  }

  // Clears queued (but not yet consumed) responses and all vi.fn() call
  // history — call this in beforeEach so no state can leak between tests
  // sharing one mock instance across a file's hoisted vi.mock() factory.
  function reset() {
    queues.clear();
    rpcQueue.length = 0;
    from.mockClear();
    rpc.mockClear();
    listUsers.mockClear();
  }

  const from = vi.fn((table: string) => {
    const q = queues.get(table);
    const resolver = q && q.length > 0 ? q.shift()! : () => ok(null);
    return makeQueryBuilder(resolver);
  });

  const rpc = vi.fn((_name: string, _args: unknown) => {
    const resolver = rpcQueue.length > 0 ? rpcQueue.shift()! : () => ok(null);
    return Promise.resolve().then(resolver);
  });

  // Exercised explicitly by the Phase 1 tests to prove
  // auth.admin.listUsers() is never called anymore.
  const listUsers = vi.fn(async () => ({ data: { users: [] }, error: null }));

  return {
    client: { from, rpc, auth: { admin: { listUsers } } },
    from,
    rpc,
    listUsers,
    reset,
    queueFrom,
    queueRpc,
  };
}

// A deferred promise the test controls the settlement of, used to prove
// ordering: a mock can `await deferred.promise` before resolving, and the
// test can inspect whether the caller's own promise has settled yet
// *before* calling `deferred.resolve()`.
export function createDeferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Flushes pending microtasks/one macrotask tick — enough for every
// already-resolved mock in a call chain to settle, while a still-pending
// deferred keeps the outer promise from resolving.
export function flushAsync(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
