import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { ClaimUsernameForm } from "@/components/dashboard/ClaimUsernameForm";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { requiresInitialPasswordSetup } from "@/lib/account-helpers";
import { authApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { signOutFirebaseGoogle } from "@/lib/firebase-auth";
import { useMyProfile } from "@/hooks/use-my-profile";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Tinki" },
      { name: "description", content: "Manage your Tinki profile and links" },
      { property: "og:title", content: "Dashboard — Tinki" },
      { property: "og:description", content: "Manage your Tinki profile and links" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardLayout,
});

function DashboardLayout() {
  const navigate = useNavigate();
  const { session, user, loading } = useAuth();
  const { userId, profile, isLoading, refetch } = useMyProfile();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  async function logout() {
    await Promise.all([authApi.signOut(), signOutFirebaseGoogle()]);
    navigate({ to: "/" });
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // Social accounts without an email password or profile claim their username and password here.
  const requireInitialPassword = requiresInitialPasswordSetup(user);

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <DashboardSidebar onLogout={logout} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <div className="mx-auto w-full max-w-4xl">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your page…</p>
          ) : !profile ? (
            <ClaimUsernameForm
              userId={userId}
              requirePassword={requireInitialPassword}
              onDone={() => void refetch()}
            />
          ) : (
            <Outlet />
          )}
        </div>
      </main>
    </div>
  );
}
