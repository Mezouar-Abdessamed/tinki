import { Link, Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { ClaimUsername } from "@/components/dashboard/ClaimUsername";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/app-supabase";
import { useAuth } from "@/lib/auth";
import { useMyProfile } from "@/lib/use-profile";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard — LinkMe" },
    { name: "description", content: "Manage your LinkMe profile and links." },
    { property: "og:title", content: "Dashboard — LinkMe" },
    { property: "og:description", content: "Manage your LinkMe profile and links." },
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

  // Google accounts arrive already verified; email sign-ups must confirm first.
  const signedInWithGoogle =
    user?.identities?.some((identity) => identity.provider !== "email") ?? false;
  const emailConfirmed = Boolean(user?.email_confirmed_at ?? user?.confirmed_at);

  if (!signedInWithGoogle && !emailConfirmed) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="panel max-w-md p-7 text-center">
          <h1 className="font-display text-2xl font-semibold">Verify your email first</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We sent a 6-digit code to {user?.email}. Enter it to activate your account.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/verify-email" search={{ email: user?.email ?? "" }}>
              Enter verification code
            </Link>
          </Button>
          <Button variant="ghost" className="mt-2" onClick={logout}>
            Back to log in
          </Button>
        </div>
      </div>
    );
  }

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
