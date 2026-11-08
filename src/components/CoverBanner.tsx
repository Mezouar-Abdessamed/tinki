import { useRef, useState } from "react";

/** Shared crop and loading treatment for the public card and the edit preview. */
export function CoverBanner({ url, x = 50, y = 50, className = "", onPositionChange }: { url: string | null; x?: number; y?: number; className?: string; onPositionChange?: ((x: number, y: number) => void) | undefined }) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number; overflowX: number; overflowY: number } | null>(null);
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  return (
    <div
      className={`aspect-[851/315] overflow-hidden bg-secondary ${onPositionChange ? "touch-none cursor-move focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""} ${className}`}
      tabIndex={onPositionChange ? 0 : undefined}
      aria-label={onPositionChange ? "Cover photo position" : undefined}
      onPointerDown={(event) => {
        if (!onPositionChange || event.button !== 0) return;
        const image = event.currentTarget.querySelector("img");
        if (!image?.naturalWidth || !image.naturalHeight) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const scale = Math.max(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x, y, overflowX: image.naturalWidth * scale - bounds.width, overflowY: image.naturalHeight * scale - bounds.height };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!onPositionChange || !start || start.pointerId !== event.pointerId) return;
        onPositionChange(
          start.overflowX > 1 ? clamp(start.x - (event.clientX - start.startX) / start.overflowX * 100) : start.x,
          start.overflowY > 1 ? clamp(start.y - (event.clientY - start.startY) / start.overflowY * 100) : start.y,
        );
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={(event) => {
        if (!onPositionChange || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        onPositionChange(clamp(x + (event.key === "ArrowLeft" ? 2 : event.key === "ArrowRight" ? -2 : 0)), clamp(y + (event.key === "ArrowUp" ? 2 : event.key === "ArrowDown" ? -2 : 0)));
      }}
    >
      {url && <img
        src={url}
        alt="Cover photo"
        draggable={false}
        onLoad={() => setLoadedUrl(url)}
        className={`h-full w-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${loadedUrl === url ? "opacity-100" : "opacity-0"}`}
        style={{ objectPosition: `${x}% ${y}%` }}
      />}
    </div>
  );
}