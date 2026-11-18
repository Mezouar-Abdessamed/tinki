import { ExternalLink } from "lucide-react";
import type { CSSProperties } from "react";

import { CustomLinkIcon, type CustomLink } from "@/lib/custom-links";

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

// eslint-disable-next-line react-refresh/only-export-components
export function safeHref(rawUrl: string | null | undefined): string | undefined {
  if (typeof rawUrl !== "string") return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed || hasControlChar(trimmed)) return undefined;

  if (/^https?:\/\/.+/i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return trimmed;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  if (/^mailto:.+/i.test(trimmed) || /^tel:.+/i.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

export function CustomLinksList({
  links,
  compact = false,
  onLinkClick,
  iconStyles,
}: {
  links: CustomLink[];
  compact?: boolean;
  onLinkClick?: ((linkId: string) => void) | undefined;
  iconStyles?: {
    wrapper: CSSProperties;
    icon: CSSProperties;
  };
}) {
  if (links.length === 0) return null;

  return (
    <div className="mt-7 w-full space-y-3 text-start">
      <p className="text-center font-display text-sm font-semibold">Custom Links</p>
      {links.map((link) => {
        const href = safeHref(link.url);
        const isSafeExternalLink = Boolean(href) && link.link_type === "link";
        return (
          <a
            key={link.id}
            href={href}
            target={isSafeExternalLink ? "_blank" : undefined}
            rel={isSafeExternalLink ? "noopener noreferrer" : undefined}
            onClick={(event) => {
              if (!href) {
                event.preventDefault();
                return;
              }
              onLinkClick?.(link.id);
            }}
            className={`group flex w-full items-center gap-3 rounded-lg border border-border bg-secondary transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${compact ? "min-h-12 px-4 py-3" : "min-h-14 px-5 py-3.5"}`}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background"
              style={iconStyles?.wrapper}
            >
              <CustomLinkIcon
                icon={link.icon}
                className="h-5 w-5 text-primary"
                style={iconStyles?.icon}
              />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-secondary-foreground">
              {link.name}
            </span>
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          </a>
        );
      })}
    </div>
  );
}
