'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Runs once when the element first scrolls into view. */
export function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const watch = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setSeen(true);
        watch.disconnect();
      },
      { threshold: 0.2 },
    );
    if (ref.current) watch.observe(ref.current);
    return () => watch.disconnect();
  }, []);
  return [ref, seen] as const;
}

export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal ${seen ? 'seen' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** A number that climbs to its value, for figures read once while scrolling past. */
export function CountUp({ to, ms = 1100 }: { to: number; ms?: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [n, setN] = useState(to);
  useEffect(() => {
    if (!seen || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setN(Math.round(to * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, ms]);
  return <span ref={ref}>{n}</span>;
}

/** The torn edge between two sections, in the color of the section below it. */
export function Torn({ className = '' }: { className?: string }) {
  return (
    <svg className={`torn ${className}`} viewBox="0 0 1440 40" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 40V20l80 6 70-14 120 12 60-10 130 14 90-16 80 12 140-8 70 10 110-14 90 12 120-10 80 12 120-8 80 6V40z" />
    </svg>
  );
}

/** Shows how far down the page you are, and takes you back up. */
export function BackToTop() {
  const ring = useRef<SVGCircleElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const share = max > 0 ? scrollY / max : 0;
      ring.current?.setAttribute('stroke-dashoffset', String(1 - share));
      setShown(scrollY > innerHeight * 0.8);
    };
    update();
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    return () => {
      removeEventListener('scroll', update);
      removeEventListener('resize', update);
    };
  }, []);
  return (
    <button
      className={shown ? 'to-top shown' : 'to-top'}
      aria-label="Back to top"
      tabIndex={shown ? 0 : -1}
      onClick={() => scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
    >
      <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
        <circle className="to-top-track" cx="24" cy="24" r="21" pathLength="1" />
        <circle ref={ring} className="to-top-ring" cx="24" cy="24" r="21" pathLength="1" strokeDasharray="1" strokeDashoffset="1" transform="rotate(-90 24 24)" />
        <path className="to-top-arrow" d="M24 32V17M17 23l7-7 7 7" />
      </svg>
    </button>
  );
}
