import { useEffect, useRef, useState } from "react";

/**
 * Soft glow that follows the pointer across the landing page.
 * Hidden on touch devices and when the user prefers reduced motion.
 */
export function GlowCursor() {
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (coarsePointer || reducedMotion) return;
    setEnabled(true);

    let raf = 0;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;

    const paint = () => {
      raf = 0;
      const el = ref.current;
      if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    };

    const onMove = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (!raf) raf = window.requestAnimationFrame(paint);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  if (!enabled) return null;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-30 h-72 w-72 rounded-full opacity-70 mix-blend-screen blur-3xl will-change-transform dark:opacity-60"
      style={{
        background:
          "radial-gradient(circle, hsl(var(--primary) / 0.35) 0%, hsl(var(--primary) / 0.12) 40%, transparent 70%)",
      }}
    />
  );
}
