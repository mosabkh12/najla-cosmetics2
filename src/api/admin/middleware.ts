import { createMiddleware } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// The admin dashboard fires several server-function calls per page (each
// its own HTTP request), and every one of them independently re-verifies
// the caller's JWT (requireSupabaseAuth, unchanged/untouched here) AND
// re-queries profiles.role — real, correct work, but the role query in
// particular is pure overhead when it's the same admin clicking around
// within the same few seconds. A short in-memory TTL cache, scoped to
// this warm serverless container (reset to empty on every cold start —
// never shared across instances, never persisted), cuts that repeat
// query out for back-to-back requests without weakening the JWT check
// itself. 15s bounds how long a just-revoked admin could still act to
// something negligible, while still meaningfully deduping a burst of
// calls from one page load.
const ROLE_CACHE_TTL_MS = 15_000;
const roleCache = new Map<string, { role: string | null; expiresAt: number }>();

async function getCachedRole(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const cached = roleCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.role;

  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = data?.role ?? null;
  roleCache.set(userId, { role, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
  return role;
}

export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;
    const role = await getCachedRole(supabase, userId);
    if (role !== "admin") throw new Error("Forbidden: Admin role required");
    return next({ context: { ...context, isAdmin: true as const } });
  });
