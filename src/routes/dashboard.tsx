import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { ClaimUsername } from "@/components/dashboard/ClaimUsername";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { supabase } from "@/lib/app-supabase";
import { useAuth } from "@/lib/auth";
import { useMyProfile } from "@/lib/use-profile";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard — Tinki" },
    { name: "description", content: "Manage your Tinki profile and links" },
    { property: "og:title", content: "Dashboard — Tinki" },
    { property: "og:description", content: "Manage your Tinki profile and links" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
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
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // Social accounts without a profile claim their username and password here.
  const signedInWithGoogle =
    user?.identities?.some((identity) => identity.provider !== "email") ?? false;

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <DashboardSidebar onLogout={logout} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <div className="mx-auto w-full max-w-4xl">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading your page…</p>
          ) : !profile ? (
            <ClaimUsername
              userId={userId}
              requirePassword={signedInWithGoogle}
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
