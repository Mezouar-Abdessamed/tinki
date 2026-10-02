/**
 * Full-bleed background video layer, played muted and looping behind the
 * profile card. The parent element must be positioned (relative).
 */
export function PageBackgroundVideo({ src }: { src: string }) {
  return (
    <video
      key={src}
      src={src}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
    />
  );
}
