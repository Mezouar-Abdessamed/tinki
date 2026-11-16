import { useEffect, useMemo, useState } from "react";

import { getAmbientLayerConfigs, shouldAnimateAmbientBackground } from "@/lib/landing-motion";

/**
 * Lightweight, GPU-composited ambient motion background tuned to Tinki's
 * ink-and-mint palette. Uses pre-feathered radial gradients animated strictly via
 * transform3d and pauses automatically when hidden or when reduced motion is active.
 */
export function AmbientBackground() {
  const layers = useMemo(() => getAmbientLayerConfigs(), []);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(query.matches);
    const syncVisibility = () => setPageHidden(document.hidden);

    syncMotion();
    syncVisibility();

    query.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      query.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  const animating = shouldAnimateAmbientBackground({ reducedMotion, pageHidden });

  return (
    <div
      data-testid="landing-ambient-bg"
      data-animating={animating ? "true" : "false"}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background"
    >
      {/* Subtle static top atmospheric wash that anchors contrast behind hero text */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(80% 55% at 50% 0%, color-mix(in oklab, var(--primary) 8%, transparent) 0%, transparent 70%), linear-gradient(180deg, oklch(0.14 0.018 265 / 40%) 0%, oklch(0.16 0.018 265 / 0%) 35%, oklch(0.13 0.016 265 / 55%) 100%)",
        }}
      />

      {layers.map((layer) => (
        <div
          key={layer.id}
          data-paused={animating ? "false" : "true"}
          className={`absolute rounded-full will-change-transform ${layer.positionClass} ${layer.animationClass}`}
          style={{
            opacity: layer.opacity,
            backgroundImage: layer.backgroundImage,
          }}
        />
      ))}
    </div>
  );
}
