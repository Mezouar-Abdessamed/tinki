import { Link } from "@tanstack/react-router";
import { LinkIcon } from "lucide-react";

import { SocialIcon } from "@/components/SocialIcon";
import { Button } from "@/components/ui/button";
import { SOCIAL_PLATFORMS, type SocialField } from "@/lib/socials";

type Props = { profile: Partial<Record<SocialField, string | null>> };

/** Read-only listing of configured social links. No inputs here by design. */
export function SocialLinksReadonly({ profile }: Props) {
  const links = SOCIAL_PLATFORMS.filter((platform) => {
    const value = profile[platform.field];
    return typeof value === "string" && value.trim().length > 0;
  });

  return (
    <section className="panel p-6">
      <h2 className="font-display text-lg font-semibold">Your Social Links</h2>

      {links.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <LinkIcon className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            You haven't added any social links yet.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/dashboard/informations">Add your links</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {links.map((platform) => (
            <li
              key={platform.key}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border border-border bg-secondary px-3 py-2.5 sm:grid-cols-[auto_auto_minmax(0,1fr)]"
            >
              <SocialIcon platform={platform.key} className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate text-sm">{platform.label}</span>
              <span className="col-span-2 truncate text-xs text-muted-foreground sm:col-span-1 sm:text-end">
                {profile[platform.field]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
