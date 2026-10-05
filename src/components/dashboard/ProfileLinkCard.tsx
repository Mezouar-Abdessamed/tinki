import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ProfileLinkCard({ url, username }: { url: string; username: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(silent = false) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    if (!silent) toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    const shareData = {
      title: `@${username} on Tinki`,
      text: `All my socials, one link.`,
      url,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // The visitor dismissed the share sheet — nothing to report.
        return;
      }
    }
    try {
      await copy(true);
      toast.success("Sharing isn't available here, so the link was copied instead.");
    } catch {
      toast.error("Couldn't share the link");
    }
  }

  return (
    <section className="panel p-6">
      <h2 className="font-display text-lg font-semibold">Your Link</h2>
      <p className="mt-3 truncate rounded-md border border-border bg-secondary px-3 py-2 text-sm">
        {url}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            copy().catch(() => toast.error("Couldn't copy the link"));
          }}
        >
          {copied ? <Check className="me-2 h-4 w-4" /> : <Copy className="me-2 h-4 w-4" />}
          {copied ? "Link copied!" : "Copy Link"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void share()}>
          <Share2 className="me-2 h-4 w-4" />
          Share Link
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="me-2 h-4 w-4" />
            Open page
          </a>
        </Button>
      </div>
    </section>
  );
}
