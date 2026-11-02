// Drawn for this product: flat ink shapes with one spot color, like the rest of the print.
const ink = { stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function ArtWrite() {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <rect x="22" y="14" width="66" height="90" rx="3" fill="var(--paper)" {...ink} />
      <path d="M34 34h42M34 48h42M34 62h24" {...ink} />
      <path d="M34 34h42" stroke="var(--yellow)" strokeWidth="11" opacity=".9" />
      <path d="M34 34h42M34 48h42M34 62h24" {...ink} />
      <path d="M100 42 66 88l-12 8 2-14 34-46c3-4 7-4 10-2s3 5 0 8z" fill="var(--cobalt)" {...ink} />
    </svg>
  );
}

export function ArtWeb() {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <rect x="12" y="20" width="96" height="74" rx="4" fill="var(--paper)" {...ink} />
      <path d="M12 36h96" {...ink} />
      <circle cx="22" cy="28" r="2" fill="currentColor" />
      <circle cx="30" cy="28" r="2" fill="currentColor" />
      <path d="M26 50h46M26 62h30" {...ink} />
      <path d="M78 50v22a9 9 0 0 1-18 0" fill="none" stroke="var(--refused)" strokeWidth="4" strokeLinecap="round" />
      <path d="M78 50l-5 6M78 50l5 6" fill="none" stroke="var(--refused)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function ArtCompare() {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <rect x="10" y="26" width="44" height="60" rx="3" fill="var(--paper)" {...ink} />
      <rect x="66" y="26" width="44" height="60" rx="3" fill="var(--paper)" {...ink} />
      <path d="M20 42h24M20 54h24M20 66h14M76 42h24M76 54h24" {...ink} />
      <path d="M76 66h24" stroke="var(--refused)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="60" cy="58" r="20" fill="var(--yellow)" fillOpacity=".55" {...ink} />
      <path d="M74 72l18 20" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

export function ArtSafe() {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <rect x="20" y="22" width="80" height="76" rx="6" fill="var(--cobalt)" {...ink} />
      <circle cx="60" cy="60" r="18" fill="var(--paper)" {...ink} />
      <path d="M60 42v8M60 70v8M42 60h8M70 60h8" {...ink} />
      <path d="M32 98v8M88 98v8" {...ink} />
    </svg>
  );
}

export function Coin() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="17" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="3" />
      <circle cx="20" cy="20" r="11" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="2 3" />
      <path d="M15 26V14l10 12V14" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
