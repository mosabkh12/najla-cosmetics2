import { createMiddleware } from "./fakeTanstackStart";

// requireSupabaseAuth/requireAdmin (real implementations) parse a live
// HTTP request's Authorization header via getRequest() from
// @tanstack/react-start/server, which only exists inside TanStack
// Start's real server runtime. These fakes are built with the same
// fakeTanstackStart.createMiddleware() used by the fake createServerFn
// (see fakeTanstackStart.ts) — structurally compatible with it — but
// skip request/JWT parsing entirely, injecting a fixed test context
// instead. Auth/role-check correctness is pre-existing behavior,
// untouched by Phase 1-3, and is not what these tests verify.
export const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";

export function fakeRequireSupabaseAuth(supabase: unknown, userId: string = TEST_USER_ID) {
  return createMiddleware().server(async ({ next }) => {
    return next({
      context: {
        supabase,
        userId,
        claims: { sub: userId },
      },
    });
  });
}

export function fakeRequireAdmin(supabase: unknown, userId: string = TEST_USER_ID) {
  return createMiddleware().server(async ({ next }) => {
    return next({
      context: {
        supabase,
        userId,
        claims: { sub: userId },
        isAdmin: true as const,
      },
    });
  });
}
