import React, { useEffect, useRef, useState } from "react";

type RevealTag = "div" | "section" | "article";

interface RevealOnScrollProps extends React.HTMLAttributes<HTMLElement> {
  as?: RevealTag;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export default function RevealOnScroll({
  as: Component = "div",
  children,
  className = "",
  delay = 0,
  style,
  ...props
}: RevealOnScrollProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return React.createElement(
    Component,
    {
      ...props,
      ref,
      className: `reveal-on-scroll ${visible ? "reveal-visible" : ""} ${className}`,
      style: { ...style, "--reveal-delay": `${delay}ms` } as React.CSSProperties,
    },
    children,
  );
}
