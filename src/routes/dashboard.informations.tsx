import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, UserRound } from "lucide-react";

import { EditInformationsForm } from "@/components/dashboard/EditInformationsForm";
import { AccountSecurity } from "@/components/dashboard/AccountSecurity";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useMyProfile } from "@/lib/use-profile";

export const Route = createFileRoute("/dashboard/informations")({
  head: () => ({
    meta: [
      { title: "My Information & Security — Tinki" },
      {
        name: "description",
        content: "Manage your Tinki profile photos, name, bio and account security",
      },
      { property: "og:title", content: "My Information & Security — Tinki" },
      {
        property: "og:description",
        content: "Manage your Tinki profile photos, name, bio and account security",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InformationsPage,
});

function InformationsPage() {
  const { profile, avatarUrl, refetch } = useMyProfile();
  const [tab, setTab] = useState("profile");
  const [dirty, setDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  if (!profile) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-normal sm:text-3xl">My Information &amp; Security</h1>
      </header>

      <Tabs value={tab} onValueChange={(next) => { if (dirty && tab === "profile") setPendingTab(next); else setTab(next); }}>
        <TabsList className="mb-5 grid h-auto w-full grid-cols-[1fr_1.6fr] sm:w-fit sm:grid-cols-2">
          <TabsTrigger value="profile" className="gap-2 whitespace-normal py-2"><UserRound className="size-4 shrink-0" />Profile</TabsTrigger>
          <TabsTrigger value="security" className="gap-2 whitespace-normal py-2"><ShieldCheck className="size-4 shrink-0" />Account &amp; Security</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><EditInformationsForm profile={profile} avatarUrl={avatarUrl} onSaved={refetch} onDirtyChange={setDirty} /></TabsContent>
        <TabsContent value="security"><AccountSecurity /></TabsContent>
      </Tabs>
      <AlertDialog open={pendingTab !== null} onOpenChange={(open) => { if (!open) setPendingTab(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle><AlertDialogDescription>Your changes have not been saved</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={() => { if (pendingTab) setTab(pendingTab); setDirty(false); setPendingTab(null); }}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
