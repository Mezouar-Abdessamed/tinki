import { describe, expect, it } from "vitest";

import {
  getGlowCursorGradients,
  isInteractiveCursorTarget,
  lerpCoordinate,
  lerpPoint,
  shouldEnableGlowCursor,
} from "@/lib/glow-cursor";

describe("GlowCursor helpers", () => {
  it("disables glow cursor for coarse pointers or reduced motion", () => {
    expect(shouldEnableGlowCursor({ coarsePointer: true, reducedMotion: false })).toBe(false);
    expect(shouldEnableGlowCursor({ coarsePointer: false, reducedMotion: true })).toBe(false);
    expect(shouldEnableGlowCursor({ coarsePointer: true, reducedMotion: true })).toBe(false);
    expect(shouldEnableGlowCursor({ coarsePointer: false, reducedMotion: false })).toBe(true);
  });

  it("lerps coordinates smoothly and snaps when within epsilon", () => {
    expect(lerpCoordinate(0, 100, 0.25)).toBe(25);
    expect(lerpCoordinate(99.95, 100, 0.25)).toBe(100);
    expect(lerpPoint({ x: 10, y: 20 }, { x: 110, y: 60 }, 0.5)).toEqual({ x: 60, y: 40 });
  });

  it("uses valid color-mix gradients compatible with oklch design tokens", () => {
    const gradients = getGlowCursorGradients();
    expect(gradients.outer).toContain("color-mix(in oklab, var(--primary)");
    expect(gradients.inner).toContain("color-mix(in oklab, var(--primary-glow)");
    expect(gradients.outer).not.toContain("hsl(var(");
    expect(gradients.inner).not.toContain("hsl(var(");
  });

  it("safely checks interactive targets without failing on non-elements", () => {
    expect(isInteractiveCursorTarget(null)).toBe(false);
    expect(
      isInteractiveCursorTarget({
        closest: (selector: string) => (selector.includes("button") ? ({} as Element) : null),
      } as unknown as EventTarget),
    ).toBe(true);
  });
});
