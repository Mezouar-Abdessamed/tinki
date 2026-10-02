import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { supabase } from "@/lib/app-supabase";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(import.meta.env['VITE_SUPABASE_URL'] && import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY']));

  useEffect(() => {
    // The public pages should remain visible before an account service is connected.
    if (!import.meta.env['VITE_SUPABASE_URL'] || !import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY']) {
      setLoading(false);
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    supabase.auth.getSession()
      .then(({ data: { session: current } }) => setSession(current))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));

    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, loading }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
