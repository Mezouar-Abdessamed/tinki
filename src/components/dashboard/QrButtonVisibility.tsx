import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { updateMyProfile } from "@/lib/profiles";

export function QrButtonVisibility({
  profileId: _profileId,
  initial,
  onSaved,
}: {
  profileId: string;
  initial: boolean;
  onSaved: () => void;
}) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function change(next: boolean) {
    setOn(next);
    setSaved(false);
    setSaving(true);
    try {
      await updateMyProfile({ show_qr_button: next });
      toast.success(next ? "QR button is now visible" : "QR button is now hidden");
      setSaved(true);
      onSaved();
    } catch {
      setOn(!next);
      toast.error("Could not save. Please try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 pb-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">QR code button</p>
        <p
          role="status"
          aria-live="polite"
          className="mt-1 flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground"
        >
          {saving ? (
            <>
              <Loader2 className="size-3 shrink-0 animate-spin" />
              Saving…
            </>
          ) : saved ? (
            <>
              <Check className="size-3 shrink-0 text-primary" />
              Saved
            </>
          ) : on ? (
            "Visible on your public page"
          ) : (
            "Hidden on your public page"
          )}
        </p>
      </div>
      <Switch
        className="shrink-0"
        checked={on}
        disabled={saving}
        onCheckedChange={(v) => void change(v)}
        aria-label="Show QR code button on public page"
      />
    </div>
  );
}
