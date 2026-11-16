export interface Point2D {
  x: number;
  y: number;
}

export interface GlowCursorGradients {
  outer: string;
  inner: string;
}

export function shouldEnableGlowCursor({
  coarsePointer,
  reducedMotion,
}: {
  coarsePointer: boolean;
  reducedMotion: boolean;
}): boolean {
  return !coarsePointer && !reducedMotion;
}

export function lerpCoordinate(current: number, target: number, factor: number): number {
  const diff = target - current;
  if (Math.abs(diff) < 0.1) return target;
  return current + diff * factor;
}

export function lerpPoint(current: Point2D, target: Point2D, factor: number): Point2D {
  return {
    x: lerpCoordinate(current.x, target.x, factor),
    y: lerpCoordinate(current.y, target.y, factor),
  };
}

export function isInteractiveCursorTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  return Boolean(
    (target as Element).closest('a, button, [role="button"], input, select, textarea, summary'),
  );
}

export function getGlowCursorGradients(): GlowCursorGradients {
  return {
    outer:
      "radial-gradient(circle, color-mix(in oklab, var(--primary) 18%, transparent) 0%, color-mix(in oklab, var(--primary) 7%, transparent) 40%, transparent 70%)",
    inner:
      "radial-gradient(circle, color-mix(in oklab, var(--primary-glow) 24%, transparent) 0%, color-mix(in oklab, var(--primary) 9%, transparent) 44%, transparent 72%)",
  };
}
