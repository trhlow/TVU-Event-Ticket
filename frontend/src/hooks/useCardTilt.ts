import { useEffect, useRef } from "react";

interface UseCardTiltOptions {
  /** Maximum rotation in degrees. Kept small on purpose — this is a depth cue, not a toy. */
  maxTilt?: number;
  disabled?: boolean;
}

/**
 * Mouse-based 3D tilt + spotlight for the `.tilt-card` CSS primitive (see index.css).
 * Writes --tilt-x/--tilt-y/--mouse-x/--mouse-y directly on the DOM node instead of React state,
 * so tilting never triggers a re-render — safe to use on cards inside long lists.
 * No-ops entirely on touch devices and under prefers-reduced-motion (CSS already hard-disables
 * `.tilt-card` there too, but skipping the listeners avoids doing pointless work on every move).
 */
export function useCardTilt<T extends HTMLElement>(options: UseCardTiltOptions = {}) {
  const ref = useRef<T | null>(null);
  const maxTilt = options.maxTilt ?? 6;

  useEffect(() => {
    const node = ref.current;
    if (!node || options.disabled) return undefined;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isCoarsePointer = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    if (prefersReducedMotion || isCoarsePointer) return undefined;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = node.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      const rotateY = (px - 0.5) * maxTilt * 2;
      const rotateX = (0.5 - py) * maxTilt * 2;

      node.style.setProperty("--tilt-x", `${rotateX.toFixed(2)}deg`);
      node.style.setProperty("--tilt-y", `${rotateY.toFixed(2)}deg`);
      node.style.setProperty("--mouse-x", `${(px * 100).toFixed(1)}%`);
      node.style.setProperty("--mouse-y", `${(py * 100).toFixed(1)}%`);
    };

    const handleMouseLeave = () => {
      node.style.setProperty("--tilt-x", "0deg");
      node.style.setProperty("--tilt-y", "0deg");
    };

    node.addEventListener("mousemove", handleMouseMove, { passive: true });
    node.addEventListener("mouseleave", handleMouseLeave, { passive: true });

    return () => {
      node.removeEventListener("mousemove", handleMouseMove);
      node.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [maxTilt, options.disabled]);

  return ref;
}
