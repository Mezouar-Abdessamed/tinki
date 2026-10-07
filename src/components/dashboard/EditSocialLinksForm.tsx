import { useState } from "react";
import { toast } from "sonner";

import { SocialIcon } from "@/components/SocialIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/app-supabase";
import type { Profile } from "@/lib/profiles";
import { normalizeSocialUrl, SOCIAL_PLATFORMS, validateSocialUrl, type SocialField } from "@/lib/socials";

type SocialValues = Record<SocialField, string>;

function socialsFrom(profile: Profile): SocialValues {
  return SOCIAL_PLATFORMS.reduce((acc, platform) => {
    acc[platform.field] = profile[platform.field] ?? "";
    return acc;
  }, {} as SocialValues);
}

export function EditSocialLinksForm({
  profile,
  onSaved,
}: {
  profile: Profile;
  onSaved: () => void;
}) {
  const [socials, setSocials] = useState<SocialValues>(() => socialsFrom(profile));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    for (const platform of SOCIAL_PLATFORMS) {
      const message = validateSocialUrl(platform, socials[platform.field]);
      if (message) {
        setError(`${platform.label}: ${message}`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = SOCIAL_PLATFORMS.reduce(
        (acc, platform) => {
          acc[platform.field] = normalizeSocialUrl(socials[platform.field]) || null;
          return acc;
        },
        {} as Record<SocialField, string | null>,
      );

      const { error: updateError } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", profile.id);

      if (updateError) throw updateError;

      toast.success("Your links have been saved");
      onSaved();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Couldn't save your links";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-8" noValidate>
      <section className="panel p-6">
        <h2 className="font-display text-lg font-semibold">My Social Links</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste a full https link, or clear a field to remove that platform
        </p>
        <div className="mt-5 grid gap-4">
          {SOCIAL_PLATFORMS.map((platform) => (
            <div key={platform.key} className="grid gap-2 sm:grid-cols-[180px_1fr] sm:items-center">
              <div className="flex min-w-0 items-center gap-2">
                <SocialIcon platform={platform.key} className="h-4 w-4 shrink-0 text-primary" />
                <Label htmlFor={`social-${platform.key}`} className="truncate">
                  {platform.label}
                </Label>
              </div>
              <Input
                id={`social-${platform.key}`}
                value={socials[platform.field]}
                placeholder={platform.placeholder}
                onChange={(event) =>
                  setSocials((current) => ({ ...current, [platform.field]: event.target.value }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      <div className="panel flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Changes go live on your public page immediately
            </p>
          )}
        </div>
        <Button type="submit" disabled={saving} className="sm:w-auto">
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
