'use client';

import { useEffect, useRef, useState } from 'react';
import { ArtCompare, ArtSafe, ArtWeb, ArtWrite, Coin } from './Art';

const STEPS = [
  { Art: ArtWrite, title: 'You say what is allowed', text: 'One plain sentence, and a small budget set aside. “Pay Acme 0.1 NEAR for invoice AC-1042.”' },
  { Art: ArtWeb, title: 'Your agent goes shopping', text: 'It reads invoices and web pages for you. Some of them lie, and an agent can believe them.' },
  { Art: ArtCompare, title: 'We check it before it pays', text: 'Every payment is compared with your sentence. We never look at the scam page, only at what your agent decided to do about it.' },
  { Art: ArtSafe, title: 'Your money only moves on a match', text: 'No match, no payment. Whatever is left comes back to you whenever you say.' },
];

/** The path from your words to your money, drawn as you scroll, with a coin travelling along it. */
export function Story() {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<SVGPathElement>(null);
  const coin = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const b = box.current!.getBoundingClientRect();
      const share = Math.min(1, Math.max(0, (innerHeight * 0.6 - b.top) / b.height));
      const path = line.current!;
      path.style.strokeDashoffset = String(1 - share);
      const svg = path.ownerSVGElement!;
      const point = path.getPointAtLength(path.getTotalLength() * share);
      const scaleX = svg.clientWidth / svg.viewBox.baseVal.width;
      const scaleY = svg.clientHeight / svg.viewBox.baseVal.height;
      coin.current!.style.transform = `translate(${point.x * scaleX - 20}px, ${point.y * scaleY - 20}px) rotate(${share * 720}deg)`;
      setActive(Math.min(STEPS.length - 1, Math.floor(share * STEPS.length)));
    };
    const ask = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    addEventListener('scroll', ask, { passive: true });
    addEventListener('resize', ask);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', ask);
      removeEventListener('resize', ask);
    };
  }, []);

  return (
    <div className="story" ref={box}>
      <div className="story-rail" aria-hidden="true">
        <svg viewBox="0 0 60 1000" preserveAspectRatio="none">
          <path className="story-track" d="M30 0C58 120 2 210 30 330S58 540 30 660 2 880 30 1000" vectorEffect="non-scaling-stroke" />
          <path ref={line} className="story-line" pathLength="1" d="M30 0C58 120 2 210 30 330S58 540 30 660 2 880 30 1000" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="story-coin" ref={coin}>
          <Coin />
        </div>
      </div>
      <ol className="story-steps">
        {STEPS.map(({ Art, title, text }, i) => (
          <li key={title} className={i <= active ? 'lit' : ''}>
            <div className="story-art">
              <Art />
            </div>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
