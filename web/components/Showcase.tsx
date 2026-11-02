'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SHOWCASE_MANDATE } from '@/lib/config';
import { errorText, getMandate } from '@/lib/near';
import type { Attempt, Mandate } from '@/lib/types';
import { formatNear } from '@/lib/units';
import { useInView } from './Motion';
import { Stamp } from './Stamp';

const AUTO_MS = 6000;

/** What this attempt was, worked out from the record itself. The judge gives no reasons, so these are ours. */
function describe(m: Mandate, a: Attempt) {
  const paidBefore = m.attempts.some(
    (p) => p.nonce < a.nonce && p.outcome === 'Paid' && p.payee === a.payee && p.amount === a.amount && p.purpose === a.purpose,
  );
  if (a.outcome === 'Paid') return { tab: 'Honest invoice', flag: null };
  if (!m.instruction.includes(a.payee)) return { tab: 'Scam invoice', flag: 'payee' as const };
  if (paidBefore) return { tab: 'Same invoice twice', flag: 'repeat' as const };
  return { tab: `Attempt ${a.nonce + 1}`, flag: null };
}

/** One real budget's record, read live from the chain, so a visitor sees real verdicts before connecting anything. */
export function Showcase() {
  const [m, setM] = useState<Mandate | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(0);
  const [touched, setTouched] = useState(false);
  const [ref, seen] = useInView<HTMLDivElement>();

  const load = useCallback(() => {
    setError('');
    getMandate(SHOWCASE_MANDATE).then(setM, (e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  // Walks through the attempts by itself until someone takes over.
  const count = m?.attempts.length ?? 0;
  useEffect(() => {
    if (!seen || touched || !count || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setPicked((p) => (p + 1) % count), AUTO_MS);
    return () => clearInterval(timer);
  }, [seen, touched, count]);

  if (error || m === null) {
    return (
      <div className="sheet voucher">
        <p>The real record could not be loaded from the blockchain right now.</p>
        <button className="small" onClick={load}>
          Try again
        </button>
      </div>
    );
  }
  if (!m) return <div ref={ref} className="sheet voucher voucher-loading" role="status" aria-label="Reading a real record from the blockchain" />;

  const a = m.attempts[picked];
  const info = describe(m, a);
  return (
    <figure className="showcase" ref={ref}>
      <div className="tabs">
        {m.attempts.map((x, i) => (
          <button
            key={x.nonce}
            className={i === picked ? `tab on ${x.outcome}` : `tab ${x.outcome}`}
            aria-pressed={i === picked}
            onClick={() => {
              setTouched(true);
              setPicked(i);
            }}
          >
            {describe(m, x).tab}
          </button>
        ))}
      </div>
      <div className="sheet voucher">
        <p className="field-label">The owner wrote</p>
        <p className="written">{m.instruction}</p>
        <hr />
        <p className="field-label">The agent asked to pay</p>
        <dl className="slip">
          <dt>To</dt>
          <dd className={info.flag === 'payee' ? 'mono flagged' : 'mono'}>{a.payee}</dd>
          <dt>Amount</dt>
          <dd className="mono">{formatNear(a.amount)} NEAR</dd>
          <dt>For</dt>
          <dd>{a.purpose}</dd>
        </dl>
        <p className="voucher-note">
          {info.flag === 'payee' && 'That is not the account the owner named. The invoice said the payment details had changed, and the agent believed it. '}
          {info.flag === 'repeat' && 'This exact payment had already been made once. '}
          {a.outcome === 'Paid' ? `It matched, so ${formatNear(a.amount)} NEAR was sent.` : 'It did not match, so the money stayed put.'}
        </p>
        <div className="voucher-stamp" key={a.nonce}>
          <Stamp outcome={a.outcome} />
        </div>
      </div>
      <Link href={`/budget/${m.id}`} className="showcase-link">
        Open this record
      </Link>
    </figure>
  );
}
