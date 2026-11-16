import { useEffect } from "react";

/**
 * Lightweight native smooth-scrolling for in-page anchor links without an
 * always-running requestAnimationFrame loop, keeping idle CPU usage at 0%.
 */
export function SmoothScroll() {
  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target as Element | null;
      const anchor = target?.closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!anchor) return;

      const hash = anchor.getAttribute("href");
      if (!hash || hash === "#") return;

      const destination = document.getElementById(hash.slice(1));
      if (!destination) return;

      event.preventDefault();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      destination.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
      if (window.location.hash !== hash) {
        window.history.pushState(null, "", hash);
      }
    };

    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  return null;
}
