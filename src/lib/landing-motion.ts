export interface AmbientLayerConfig {
  id: string;
  animationClass: string;
  backgroundImage: string;
  positionClass: string;
  opacity: number;
}

export function shouldAnimateAmbientBackground({
  reducedMotion,
  pageHidden,
}: {
  reducedMotion: boolean;
  pageHidden: boolean;
}): boolean {
  return !reducedMotion && !pageHidden;
}

/**
 * Cohesive emerald-mint & warm-white shimmer for the hero subheadline without
 * CPU-heavy SVG noise filters.
 */
export function getShinyHeadlineGradient(): string {
  return "linear-gradient(110deg, #f0fdf9 0%, #6ee7b7 28%, #2dd4bf 52%, #a7f3d0 76%, #f0fdf9 100%)";
}

/**
 * Pre-feathered radial gradients animated strictly with GPU-composited
 * transform3d keyframes (no CSS filter: blur() or video decode).
 */
export function getAmbientLayerConfigs(): AmbientLayerConfig[] {
  return [
    {
      id: "mint-focal",
      animationClass: "ambient-drift-a",
      positionClass: "-top-44 end-[-12%] h-[580px] w-[580px] sm:h-[760px] sm:w-[760px]",
      opacity: 0.72,
      backgroundImage:
        "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--primary) 16%, transparent) 0%, color-mix(in oklab, var(--primary) 6%, transparent) 38%, transparent 70%)",
    },
    {
      id: "teal-counter",
      animationClass: "ambient-drift-b",
      positionClass: "top-[32%] start-[-16%] h-[540px] w-[540px] sm:h-[720px] sm:w-[720px]",
      opacity: 0.65,
      backgroundImage:
        "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--chart-2) 15%, transparent) 0%, color-mix(in oklab, var(--primary) 5%, transparent) 42%, transparent 72%)",
    },
    {
      id: "deep-aurora",
      animationClass: "ambient-drift-c",
      positionClass: "bottom-[-18%] end-[8%] h-[560px] w-[560px] sm:h-[740px] sm:w-[740px]",
      opacity: 0.6,
      backgroundImage:
        "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--primary-glow) 11%, transparent) 0%, color-mix(in oklab, var(--chart-2) 6%, transparent) 40%, transparent 72%)",
    },
  ];
}
