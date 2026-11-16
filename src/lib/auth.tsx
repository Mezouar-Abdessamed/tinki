import { onAuthStateChanged } from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { authApi, subscribeAuth, type AuthSession, type AuthUser } from "@/lib/api";
import {
  completeGoogleRedirectIfPending,
  getFirebaseAuth,
  syncSessionFromFirebaseUser,
} from "@/lib/firebase-auth";

type AuthState = {
  session: AuthSession | null;
  user: AuthUser | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const unsubscribeApi = subscribeAuth((nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });

    const fbAuth = getFirebaseAuth();
    let initialized = false;

    const unsubscribeFb = onAuthStateChanged(fbAuth, (fbUser) => {
      if (!active) return;
      if (fbUser) {
        void syncSessionFromFirebaseUser(fbUser)
          .then((synced) => {
            if (!active) return;
            setSession(synced);
            setLoading(false);
          })
          .catch(() => {
            if (!active) return;
            setLoading(false);
          });
      } else if (initialized) {
        void authApi
          .getSession()
          .then((serverSession) => {
            if (!active) return;
            setSession(serverSession);
          })
          .catch(() => {
            /* keep existing state */
          })
          .finally(() => {
            if (active) setLoading(false);
          });
      }
    });

    (async () => {
      try {
        await fbAuth.authStateReady();
        const redirectSession = await completeGoogleRedirectIfPending().catch(() => null);
        if (redirectSession) {
          if (active) {
            setSession(redirectSession);
            setLoading(false);
          }
          initialized = true;
          return;
        }

        const currentFbUser = fbAuth.currentUser;
        if (currentFbUser) {
          const synced = await syncSessionFromFirebaseUser(currentFbUser);
          if (active) {
            setSession(synced);
            setLoading(false);
          }
          initialized = true;
          return;
        }

        const serverSession = await authApi.getSession();
        if (active) {
          setSession(serverSession);
          setLoading(false);
        }
        initialized = true;
      } catch {
        initialized = true;
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      unsubscribeApi();
      unsubscribeFb();
    };
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
