import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Mail, MapPin, Menu, Phone, Share2, Users, X } from "lucide-react";

const navItems = [
  { label: "Trang chủ", id: "home" },
  { label: "Sự kiện", id: "events" },
  { label: "Hướng dẫn", id: "guide" },
];

export default function PublicLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const [isScrolled, setIsScrolled] = useState(false);
  const [previewSection, setPreviewSection] = useState<string | null>(null);
  const [navIndicator, setNavIndicator] = useState({ left: 0, width: 0, visible: false });
  const desktopNavRef = useRef<HTMLDivElement | null>(null);
  const navButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const location = useLocation();
  const navigate = useNavigate();
  const isLanding = location.pathname === "/" || location.pathname === "/home";
  const isLoginPage = location.pathname === "/login";

  const getCurrentNavId = useCallback(() => {
    if (isLanding) return activeSection;
    if (location.pathname.includes("events")) return "events";
    if (location.pathname.includes("guide")) return "guide";
    return "home";
  }, [activeSection, isLanding, location.pathname]);

  const moveNavIndicator = useCallback((id: string) => {
    const nav = desktopNavRef.current;
    const button = navButtonRefs.current[id];
    if (!nav || !button) return;

    const navRect = nav.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    setNavIndicator({
      left: buttonRect.left - navRect.left,
      width: buttonRect.width,
      visible: true,
    });
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleNavClick = (id: string) => {
    setMobileOpen(false);
    setPreviewSection(id);
    setActiveSection(id);
    moveNavIndicator(id);

    if (!isLanding) {
      navigate("/", { replace: false });
      window.setTimeout(() => scrollToSection(id), 100);
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
      { rootMargin: "-38% 0px -52% 0px", threshold: [0.12, 0.35, 0.6] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [isLanding, location.pathname]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 14);

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const target = getCurrentNavId();
    const update = () => moveNavIndicator(target);

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [getCurrentNavId, moveNavIndicator]);

  if (isLoginPage) {
    return <Outlet />;
  }

  return (
    <main className="flex min-h-screen w-full max-w-full flex-col overflow-x-hidden bg-slate-50 font-sans">
      <nav
        className={[
          "fixed inset-x-0 top-0 z-50 border-b px-4 transition-all duration-300 sm:px-5 lg:px-8",
          isScrolled
            ? "border-blue-100/80 bg-white/94 shadow-lg shadow-blue-950/8 backdrop-blur-xl"
            : "border-white/70 bg-white/82 backdrop-blur-md",
        ].join(" ")}
      >
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4">
          <button type="button" onClick={() => handleNavClick("home")} className="public-logo-link flex min-w-0 items-center gap-3 text-left">
            <img
              src="/tvu_logo_1783065060265.jpg"
              alt="Logo Trường Đại học Trà Vinh"
              className="h-9 w-9 shrink-0 rounded-full bg-white object-contain p-1 shadow-sm ring-1 ring-blue-100"
            />
            <span className="min-w-0">
              <span className="block truncate font-display text-lg font-extrabold leading-5 text-brand-800">TVU Ticket</span>
            </span>
          </button>

          <div
            ref={desktopNavRef}
            className="public-nav-group relative hidden h-full items-center gap-8 md:flex"
            onMouseLeave={() => {
              setPreviewSection(null);
              moveNavIndicator(getCurrentNavId());
            }}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setPreviewSection(null);
                moveNavIndicator(getCurrentNavId());
              }
            }}
          >
            <span
              className={["public-nav-active-indicator", navIndicator.visible ? "opacity-100" : "opacity-0"].join(" ")}
              style={{
                width: `${navIndicator.width}px`,
                transform: `translate3d(${navIndicator.left}px, 0, 0)`,
              }}
              aria-hidden="true"
            />
            {navItems.map((item) => {
              const active = isLanding && activeSection === item.id;
              const highlighted = previewSection ? previewSection === item.id : active || getCurrentNavId() === item.id;
              return (
                <button
                  key={item.id}
                  ref={(node) => {
                    navButtonRefs.current[item.id] = node;
                  }}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  onMouseEnter={() => {
                    setPreviewSection(item.id);
                    moveNavIndicator(item.id);
                  }}
                  onFocus={() => {
                    setPreviewSection(item.id);
                    moveNavIndicator(item.id);
                  }}
                  className={[
                    "public-nav-link relative flex h-full items-center text-sm font-bold transition-colors",
                    highlighted ? "text-brand-800" : "text-slate-600 hover:text-brand-800",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="hidden items-center justify-end gap-3 md:flex">
            <Link
              to="/login"
              className="btn-press inline-flex h-10 items-center justify-center rounded-xl bg-brand-700 px-5 text-sm font-bold text-white shadow-md shadow-blue-900/18 hover:bg-brand-600 hover:shadow-lg hover:shadow-blue-900/20"
            >
              Đăng nhập
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((value) => !value)}
            className="btn-press grid h-10 w-10 place-items-center justify-self-end rounded-xl border border-blue-100 bg-white text-brand-800 shadow-sm md:hidden"
            aria-label={mobileOpen ? "Đóng menu" : "Mở menu"}
            aria-expanded={mobileOpen}
            aria-controls="public-mobile-menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div id="public-mobile-menu" className="public-mobile-menu mx-auto max-w-[1180px] border-t border-blue-50 py-3 md:hidden">
            <div className="grid gap-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={[
                    "rounded-xl px-3 py-2.5 text-left text-sm font-bold",
                    isLanding && activeSection === item.id
                      ? "bg-blue-50 text-brand-800"
                      : "text-slate-700 hover:bg-blue-50 hover:text-brand-800",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              ))}
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl bg-brand-700 px-4 py-2.5 text-center text-sm font-bold text-white"
              >
                Đăng nhập
              </Link>
            </div>
          </div>
        )}
      </nav>

      <section className="flex w-full flex-1 flex-col pt-16">
        <Outlet />
      </section>

      {!isLanding && (
        <footer className="border-t border-blue-100 bg-white px-6 py-8 text-sm text-slate-600">
          <div className="mx-auto grid max-w-[1180px] gap-6 md:grid-cols-[1.3fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-3">
                <img src="/tvu_logo_1783065060265.jpg" alt="Logo TVU" className="h-9 w-9 rounded-full object-contain ring-1 ring-blue-100" />
                <p className="font-display text-lg font-extrabold text-brand-800">TVU Ticket</p>
              </div>
              <p className="mt-3 max-w-xl leading-6">
                Hệ thống quản lý và phân phối vé sự kiện chính thức dành cho sinh viên và các Câu lạc bộ trực thuộc Trường Đại học Trà Vinh.
              </p>
            </div>
            <div>
              <p className="font-bold text-slate-900">Liên hệ</p>
              <p className="mt-3 flex items-center gap-2 leading-6"><MapPin className="h-4 w-4 text-brand-700" /> 126 Nguyễn Thiện Thành, Trà Vinh</p>
              <p className="flex items-center gap-2 leading-6"><Mail className="h-4 w-4 text-brand-700" /> support@tvu.edu.vn</p>
              <p className="flex items-center gap-2 leading-6"><Phone className="h-4 w-4 text-brand-700" /> 0294 3855 246</p>
            </div>
            <div>
              <p className="font-bold text-slate-900">Khám phá</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                <Link to="/" className="hover:text-brand-800 hover:underline">Trang chủ</Link>
                <Link to="/events" className="hover:text-brand-800 hover:underline">Sự kiện</Link>
                <Link to="/#guide" className="hover:text-brand-800 hover:underline">Hướng dẫn</Link>
              </div>
              <div className="mt-4 flex gap-2 text-brand-800">
                <Share2 className="h-4 w-4" aria-hidden="true" />
                <Users className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
          </div>
        </footer>
      )}
    </main>
  );
}
