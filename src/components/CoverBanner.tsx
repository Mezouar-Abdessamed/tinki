import { useState } from "react";

/** Shared crop and loading treatment for the public card and the edit preview. */
export function CoverBanner({ url, x = 50, y = 50, className = "" }: { url: string | null; x?: number; y?: number; className?: string }) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  return (
    <div className={`aspect-[851/315] overflow-hidden bg-secondary ${className}`}>
      {url && <img
        src={url}
        alt="Cover photo"
        onLoad={() => setLoadedUrl(url)}
        className={`h-full w-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${loadedUrl === url ? "opacity-100" : "opacity-0"}`}
        style={{ objectPosition: `${x}% ${y}%` }}
      />}
    </div>
  );
}