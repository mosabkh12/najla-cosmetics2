import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // `loading` must only clear once the admin-role check itself has
    // resolved. It used to clear as soon as the session was known (via a
    // separate, independently-racing getSession() call) while this role
    // fetch was still in flight — a route guard checking `!loading &&
    // !isAdmin` (see admin.tsx) could catch isAdmin still at its default
    // `false` in that window and bounce a genuine admin back to "/" right
    // after sign-in or on a fresh page load/refresh.
    //
    // supabase-js fires an initial event here with the current session as
    // soon as this subscribes, so a separate getSession() call to seed
    // the initial state is redundant — this is the single source of truth.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s?.user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      setTimeout(() => {
        supabase
          .from("profiles")
          .select("role")
          .eq("id", s.user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (cancelled) return;
            setIsAdmin(data?.role === "admin");
            setLoading(false);
          });
      }, 0);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        isAdmin,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth requires AuthProvider");
  return c;
}
