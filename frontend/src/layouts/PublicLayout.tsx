import React, { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";

const navItems = [
  { label: "Trang chủ", id: "home" },
  { label: "Sự kiện", id: "events" },
  { label: "Hướng dẫn", id: "guide" },
];

export default function PublicLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isLanding = location.pathname === "/" || location.pathname === "/home";

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleNavClick = (id: string) => {
    setMobileOpen(false);

    if (!isLanding) {
      navigate("/", { replace: false });
      window.setTimeout(() => scrollToSection(id), 80);
      return;
    }

    scrollToSection(id);
  };

  useEffect(() => {
    if (!isLanding) return undefined;

    const sections = navItems
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!sections.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target.id) setActiveSection(visible.target.id);
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [isLanding, location.pathname]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 12);

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <main className="flex min-h-screen w-full max-w-full flex-col overflow-x-hidden bg-transparent font-sans">
      <nav
        className={[
          "fixed inset-x-0 top-0 z-50 border-b px-4 backdrop-blur-xl transition-all duration-300 sm:px-5 lg:px-8",
          isScrolled ? "border-slate-200/70 bg-white/94 shadow-md shadow-slate-900/10" : "border-white/60 bg-white/82",
        ].join(" ")}
      >
        <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between gap-4">
          <button type="button" onClick={() => handleNavClick("home")} className="public-logo-link flex min-w-0 items-center gap-3 text-left">
            <img
              src="/src/assets/images/tvu_logo_1783065060265.jpg"
              alt="TVU Event"
              className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain p-1 shadow-sm ring-1 ring-slate-100"
            />
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-semibold leading-5 text-brand-800">TVU Event</span>
              <span className="block truncate text-xs font-medium leading-4 text-slate-500">Ticketing Platform</span>
            </span>
          </button>

          <div className="hidden h-full items-center gap-7 md:flex">
            {navItems.map((item) => {
              const active = isLanding && activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={[
                    "public-nav-link relative flex h-full items-center text-sm font-medium transition-colors",
                    active ? "text-brand-800" : "text-slate-600 hover:text-brand-800",
                  ].join(" ")}
                >
                  {item.label}
                  <span className={["public-nav-underline absolute bottom-3.5 left-0 h-0.5 w-full rounded-full bg-brand-600", active ? "scale-x-100" : "scale-x-0"].join(" ")} />
                </button>
              );
            })}
          </div>

          <div className="hidden items-center justify-end gap-3 md:flex">
            <Link
              to="/login"
              className="btn-press inline-flex h-9 items-center justify-center rounded-xl bg-brand-700 px-4 text-sm font-medium text-white shadow-sm shadow-brand-700/14 hover:bg-brand-800"
            >
              Đăng nhập
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            className="btn-press grid h-8 w-8 place-items-center justify-self-end rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm md:hidden"
            aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
            aria-expanded={mobileOpen}
            aria-controls="public-mobile-menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div id="public-mobile-menu" className="public-mobile-menu animate-fade-in mx-auto max-w-[1180px] border-t border-slate-100 py-3 md:hidden">
            <div className="grid gap-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={[
                    "rounded-xl px-3 py-2.5 text-left text-sm font-medium",
                    isLanding && activeSection === item.id
                      ? "bg-brand-50 text-brand-800"
                      : "text-slate-700 hover:bg-brand-50 hover:text-brand-800",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              ))}
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl bg-brand-700 px-4 py-2.5 text-center text-sm font-medium text-white"
              >
                Đăng nhập
              </Link>
            </div>
          </div>
        )}
      </nav>

      <section className="flex w-full flex-1 flex-col pt-14">
        <Outlet />
      </section>

      <footer className="border-t border-white/70 bg-white/78 px-6 py-8 text-xs font-semibold text-slate-500">
        <div className="mx-auto grid max-w-[1180px] gap-5 text-left md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="font-display text-sm font-semibold text-brand-800">TVU Event & Ticketing Platform</p>
            <p className="mt-2 max-w-xl leading-6">
              He thong do an quan ly su kien va ve dien tu cho cac cau lac bo tai Truong Dai hoc Tra Vinh.
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Lien he</p>
            <p className="mt-2 leading-6">Truong Dai hoc Tra Vinh</p>
            <p className="leading-6">Phong Cong tac Sinh vien va cac CLB phu trach</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Thong tin</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              <Link to="/guide" className="hover:text-brand-700">Huong dan</Link>
              <Link to="/events" className="hover:text-brand-700">Su kien</Link>
              <Link to="/login" className="hover:text-brand-700">Dang nhap</Link>
            </div>
            <p className="mt-3 leading-6">© 2026 Truong Dai hoc Tra Vinh.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
