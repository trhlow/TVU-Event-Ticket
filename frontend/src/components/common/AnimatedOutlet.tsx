import { useEffect } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

/**
 * Drop-in replacement for react-router's <Outlet /> that fades/slides the new route in.
 * Remounting on pathname change restarts the CSS animation without any transition library;
 * prefers-reduced-motion disables it entirely and falls back to an instant swap.
 */
export default function AnimatedOutlet() {
  const location = useLocation();
  const element = useOutlet();
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (!target) return;
      // Wait a tick so the destination route has rendered (e.g. navigating from another
      // page to "/#faq" mounts LandingPage first, then the section can be measured).
      const timer = window.setTimeout(() => {
        target.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
      }, 60);
      return () => window.clearTimeout(timer);
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname, location.hash, reducedMotion]);

  return (
    <div key={location.pathname} className={reducedMotion ? undefined : "route-transition"}>
      {element}
    </div>
  );
}
