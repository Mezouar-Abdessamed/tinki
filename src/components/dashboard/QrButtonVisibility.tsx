import { useState } from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/app-supabase";

export function QrButtonVisibility({
  profileId,
  initial,
  onSaved,
}: {
  profileId: string;
  initial: boolean;
  onSaved: () => void;
}) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function change(next: boolean) {
    setOn(next);
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ show_qr_button: next })
      .eq("id", profileId);
    setSaving(false);
    if (error) {
      setOn(!next);
      toast.error("Could not save. Please try again");
      return;
    }
    toast.success(next ? "QR button is now visible" : "QR button is now hidden");
    onSaved();
  }

  return (
    <section className="panel flex items-center justify-between gap-4 p-6">
      <div>
        <h2 className="font-display text-lg font-semibold">QR code button</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Show the QR code button on your public page so visitors can open and download your QR code
        </p>
      </div>
      <Switch
        checked={on}
        disabled={saving}
        onCheckedChange={(v) => void change(v)}
        aria-label="Show QR code button on public page"
      />
    </section>
  );
}
