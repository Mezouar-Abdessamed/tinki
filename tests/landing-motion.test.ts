import { describe, expect, it } from "vitest";

import {
  getAmbientLayerConfigs,
  getShinyHeadlineGradient,
  shouldAnimateAmbientBackground,
} from "@/lib/landing-motion";

describe("Landing motion helpers", () => {
  it("disables ambient motion when reduced motion or hidden tab is active", () => {
    expect(shouldAnimateAmbientBackground({ reducedMotion: false, pageHidden: false })).toBe(true);
    expect(shouldAnimateAmbientBackground({ reducedMotion: true, pageHidden: false })).toBe(false);
    expect(shouldAnimateAmbientBackground({ reducedMotion: false, pageHidden: true })).toBe(false);
    expect(shouldAnimateAmbientBackground({ reducedMotion: true, pageHidden: true })).toBe(false);
  });

  it("provides cohesive oklch/var(--primary) ambient layers without heavy CSS blur tokens", () => {
    const layers = getAmbientLayerConfigs();
    expect(layers.length).toBeGreaterThanOrEqual(3);
    for (const layer of layers) {
      expect(layer.backgroundImage).toContain("radial-gradient(");
      expect(layer.backgroundImage).toContain("transparent");
      expect(layer.positionClass).not.toContain("blur-");
      expect(layer.opacity).toBeGreaterThan(0);
      expect(layer.opacity).toBeLessThanOrEqual(0.85);
    }
  });

  it("provides a cohesive emerald-mint headline gradient without cobalt clashes", () => {
    const gradient = getShinyHeadlineGradient();
    expect(gradient).toContain("#6ee7b7");
    expect(gradient).toContain("#2dd4bf");
    expect(gradient).not.toContain("#00d2ff");
  });
});
