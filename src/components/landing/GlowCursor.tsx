import { useEffect, useMemo, useRef, useState } from "react";

import {
  getGlowCursorGradients,
  isInteractiveCursorTarget,
  lerpPoint,
  shouldEnableGlowCursor,
  type Point2D,
} from "@/lib/glow-cursor";

/**
 * Dual-layer electric mint glow that smoothly tracks the pointer across the landing page.
 * Disabled on coarse/touch pointers and when the user prefers reduced motion.
 */
export function GlowCursor() {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const gradients = useMemo(() => getGlowCursorGradients(), []);

  useEffect(() => {
    const coarseQuery = window.matchMedia("(pointer: coarse)");
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const updateCapability = () => {
      setEnabled(
        shouldEnableGlowCursor({
          coarsePointer: coarseQuery.matches,
          reducedMotion: reducedQuery.matches,
        }),
      );
    };

    updateCapability();
    coarseQuery.addEventListener("change", updateCapability);
    reducedQuery.addEventListener("change", updateCapability);
    return () => {
      coarseQuery.removeEventListener("change", updateCapability);
      reducedQuery.removeEventListener("change", updateCapability);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const target: Point2D = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    let outerPos: Point2D = { ...target };
    let innerPos: Point2D = { ...target };
    let hasMoved = false;
    let raf = 0;

    const applyTransforms = (interactiveHover: boolean) => {
      const scale = interactiveHover ? 1.24 : 1;
      if (outerRef.current) {
        outerRef.current.style.transform = `translate3d(${outerPos.x}px, ${outerPos.y}px, 0) translate(-50%, -50%) scale(${scale})`;
      }
      if (innerRef.current) {
        innerRef.current.style.transform = `translate3d(${innerPos.x}px, ${innerPos.y}px, 0) translate(-50%, -50%) scale(${scale})`;
      }
    };

    let hoveringInteractive = false;

    const tick = () => {
      raf = 0;
      outerPos = lerpPoint(outerPos, target, 0.18);
      innerPos = lerpPoint(innerPos, target, 0.45);
      applyTransforms(hoveringInteractive);

      const outerDelta = Math.abs(target.x - outerPos.x) + Math.abs(target.y - outerPos.y);
      const innerDelta = Math.abs(target.x - innerPos.x) + Math.abs(target.y - innerPos.y);
      if (outerDelta > 0.2 || innerDelta > 0.2) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    const scheduleTick = () => {
      if (!raf) raf = window.requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      target.x = event.clientX;
      target.y = event.clientY;
      if (!hasMoved) {
        hasMoved = true;
        outerPos = { ...target };
        innerPos = { ...target };
        applyTransforms(hoveringInteractive);
        setVisible(true);
      } else {
        setVisible(true);
      }

      const nextInteractive = isInteractiveCursorTarget(event.target);
      if (nextInteractive !== hoveringInteractive) {
        hoveringInteractive = nextInteractive;
        setInteractive(nextInteractive);
        applyTransforms(nextInteractive);
      }

      scheduleTick();
    };

    const onMouseLeave = () => {
      setVisible(false);
      hoveringInteractive = false;
      setInteractive(false);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("blur", onMouseLeave);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("blur", onMouseLeave);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      data-testid="landing-glow-cursor"
      data-visible={visible ? "true" : "false"}
      data-interactive={interactive ? "true" : "false"}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-30 overflow-hidden transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        ref={outerRef}
        data-testid="landing-glow-cursor-outer"
        className="absolute left-0 top-0 h-80 w-80 rounded-full will-change-transform transition-[opacity] duration-200"
        style={{
          opacity: interactive ? 0.78 : 0.58,
          backgroundImage: gradients.outer,
        }}
      />
      <div
        ref={innerRef}
        data-testid="landing-glow-cursor-inner"
        className="absolute left-0 top-0 h-28 w-28 rounded-full will-change-transform transition-[opacity] duration-150"
        style={{
          opacity: interactive ? 0.85 : 0.62,
          backgroundImage: gradients.inner,
        }}
      />
    </div>
  );
}
