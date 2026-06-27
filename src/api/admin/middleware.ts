import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.rpc("has_role", { _role: "admin", _user_id: userId });
    if (!data) throw new Error("Forbidden: Admin role required");
    return next({ context: { ...context, isAdmin: true as const } });
  });
