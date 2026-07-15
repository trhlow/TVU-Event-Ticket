import { useEffect, useRef, useState } from "react";

/**
 * Animates a numeric KPI value from 0 to `value` once it scrolls into view. Runs off
 * requestAnimationFrame (no interval), disconnects its IntersectionObserver after the first
 * reveal, and snaps straight to the final value under prefers-reduced-motion.
 */
export function useCountUp(value: number, durationMs = 900) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || !Number.isFinite(value)) {
      setDisplay(value);
      return undefined;
    }

    if (!("IntersectionObserver" in window)) {
      setDisplay(value);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const start = performance.now();
        const from = 0;

        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / durationMs);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(from + (value - from) * eased));
          if (progress < 1) requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return { ref, display };
}
