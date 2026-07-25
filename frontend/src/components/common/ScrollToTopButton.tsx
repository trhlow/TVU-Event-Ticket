import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

interface ScrollToTopButtonProps {
  scrollContainerId?: string;
}

export default function ScrollToTopButton({ scrollContainerId }: ScrollToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const scrollTarget = scrollContainerId ? document.getElementById(scrollContainerId) : window;
    if (!scrollTarget) return undefined;

    const getScrollTop = () => (scrollTarget instanceof Window ? scrollTarget.scrollY : scrollTarget.scrollTop);
    const handleScroll = () => setVisible(getScrollTop() > 300);

    handleScroll();
    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });

    return () => scrollTarget.removeEventListener("scroll", handleScroll);
  }, [scrollContainerId]);

  const handleClick = () => {
    const scrollTarget = scrollContainerId ? document.getElementById(scrollContainerId) : window;

    if (scrollTarget instanceof Window) {
      scrollTarget.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    scrollTarget?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      aria-label="Quay lên đầu trang"
      onClick={handleClick}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={[
        "btn-press fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-white shadow-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-blue-300 sm:bottom-8 sm:right-8 sm:h-12 sm:w-12",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      ].join(" ")}
    >
      <ChevronUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
