import type { Outcome } from '@/lib/types';

const LABEL: Record<Outcome, string> = { Paid: 'Paid', Refused: 'Refused', PayoutFailed: 'Not sent' };

/** The rubber stamp: this product's one mark of an outcome. Only ever shown for a recorded on-chain attempt. */
export function Stamp({ outcome, small }: { outcome: Outcome; small?: boolean }) {
  return <span className={`stamp ${outcome}${small ? ' small' : ''}`}>{LABEL[outcome]}</span>;
}

/** Roughens the stamp's edges and leaves small gaps in the ink. Rendered once, by SiteHeader. */
export function StampInk() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <filter id="stamp-ink">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" result="rough" />
        <feColorMatrix in="noise" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -7 5" result="gaps" />
        <feComposite in="rough" in2="gaps" operator="in" />
      </filter>
    </svg>
  );
}
