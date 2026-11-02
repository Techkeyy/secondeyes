'use client';

import { useEffect, useRef, useState } from 'react';
import { runDemoAgent, type AgentStep } from '@/lib/agent';
import { PAYEE_ACME, PAYEE_ATTACKER } from '@/lib/config';
import { explainAttempt } from '@/lib/explain';
import { errorText } from '@/lib/near';
import type { Mandate } from '@/lib/types';
import { Stamp } from './Stamp';

const SCAM = '/invoice/poisoned';
const HONEST = '/invoice/clean';
const INVOICES = [
  { path: SCAM, name: 'Scam invoice', text: 'The same bill, but it says Acme changed its payment account.', payee: PAYEE_ATTACKER },
  { path: HONEST, name: 'Honest invoice', text: 'The real bill from Acme, with the right account.', payee: PAYEE_ACME },
];
const STAGES = ['The agent reads the invoice', 'It decides what to pay', 'The judge compares that with your instruction', 'The contract acts on the answer'];

/** The one thing to try next, from what this budget has already recorded. */
function nextTry(m: Mandate) {
  const paidAt = m.attempts.findIndex((a) => a.outcome === 'Paid');
  if (paidAt >= 0 && m.attempts.slice(paidAt).some((a) => a.outcome === 'Refused')) {
    return { path: null, title: 'That is the whole check', text: 'A scam refused, the real bill paid, a repeat refused. Now connect your own agent below, or close this budget to take back what is left.' };
  }
  if (paidAt >= 0) {
    return { path: HONEST, title: 'Now try paying it twice', text: 'Give the agent the honest invoice again. It is already paid, so the judge should refuse it.' };
  }
  if (m.attempts.some((a) => a.outcome === 'Refused')) {
    return { path: HONEST, title: 'Now the honest invoice', text: 'Same bill, right account. This one matches your instruction, so the money should move.' };
  }
  return { path: SCAM, title: 'Hand your agent a scam invoice', text: 'A small agent runs here in your browser. It reads the page, decides what to pay, then asks the judge. Watch where the money goes.' };
}

export function DemoAgent({ mandate, secret, onDone }: { mandate: Mandate; secret: string; onDone: () => void }) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [countAtStart, setCountAtStart] = useState<number | null>(null);

  async function run(path: string) {
    setSteps([]);
    setError('');
    setCountAtStart(mandate.attempts.length);
    setRunning(true);
    try {
      await runDemoAgent(mandate, secret, path, (s) => setSteps((prev) => [...prev, s]));
    } catch (e) {
      setError(errorText(e));
    }
    setRunning(false);
    onDone();
  }

  const next = nextTry(mandate);
  const fits = mandate.instruction.includes('AC-1042') && mandate.instruction.includes(PAYEE_ACME);
  const read = steps.find((s) => s.kind === 'read');
  const concluded = steps.find((s) => s.kind === 'concluded');
  const judge = steps.find((s) => s.kind === 'judge');
  const result = steps.find((s) => s.kind === 'result');
  const done = [!!read, !!concluded, !!judge, !!result];
  // The stamp comes from the attempt the chain recorded, once this run has added one.
  const recorded = !running && countAtStart !== null && mandate.attempts.length > countAtStart ? mandate.attempts[mandate.attempts.length - 1] : null;

  // Keep the run in view as it grows, so nobody misses the stamp below the fold.
  const runBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    runBox.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [running, steps.length, recorded?.nonce]);

  const paidAt = mandate.attempts.findIndex((a) => a.outcome === 'Paid');
  const trail = [
    { label: 'Scam stopped', done: mandate.attempts.some((a) => a.outcome === 'Refused' && !mandate.instruction.includes(a.payee)) },
    { label: 'Real bill paid', done: paidAt >= 0 },
    { label: 'Repeat stopped', done: paidAt >= 0 && mandate.attempts.slice(paidAt).some((a) => a.outcome === 'Refused' && a.payee === mandate.attempts[paidAt].payee) },
  ];

  return (
    <section className="stage" aria-labelledby="stage-title">
      <ol className="trail">
        {trail.map((t) => (
          <li key={t.label} className={t.done ? 'done' : ''}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path pathLength="1" d="M7 12.5l3.5 3.5L17 8.5" />
            </svg>
            {t.label}
          </li>
        ))}
      </ol>
      <h2 id="stage-title">{next.title}</h2>
      <p className="section-lead">{next.text}</p>
      {!fits && <p className="alert">These sample invoices are for Acme AC-1042, which your instruction does not cover, so expect both to be refused.</p>}
      <div className="invoices">
        {INVOICES.map((inv) => (
          <div key={inv.path} className={inv.path === next.path ? 'sheet invoice-tile next' : 'sheet invoice-tile'}>
            <h3>{inv.name}</h3>
            <p>{inv.text}</p>
            <p className="mono tile-payee">{inv.payee}</p>
            <div className="tile-actions">
              <button className={inv.path === next.path ? 'primary' : ''} disabled={running} onClick={() => run(inv.path)}>
                Give it to the agent
              </button>
              <a href={inv.path} target="_blank" rel="noreferrer">
                Read it
              </a>
            </div>
          </div>
        ))}
      </div>

      {(running || steps.length > 0 || error) && (
        <div className="sheet run" ref={runBox}>
          <ol className="run-steps" aria-live="polite">
            {STAGES.map((label, i) => {
              const state = done[i] ? 'done' : running && done.indexOf(false) === i ? 'now' : 'wait';
              return (
                <li key={label} className={state}>
                  <span className="run-label">{label}</span>
                  {i === 0 && read?.kind === 'read' && (
                    <details>
                      <summary>See the page text it read</summary>
                      <pre>{read.pageText}</pre>
                    </details>
                  )}
                  {i === 1 && concluded?.kind === 'concluded' && (
                    <div>
                      Pay <span className="mono wrap">{concluded.payee}</span>, {concluded.amountNear} NEAR, for “{concluded.purpose}”.
                      {!mandate.instruction.includes(concluded.payee) && <strong className="caught"> That is not the account in your instruction.</strong>}
                    </div>
                  )}
                  {i === 2 && judge?.kind === 'judge' && (
                    <div>
                      It answered <span className="mono">{judge.answer}</span>
                    </div>
                  )}
                  {i === 3 && result?.kind === 'result' && (
                    <div>
                      {result.ok ? 'Recorded on the blockchain.' : <span className="error">{result.text}</span>}{' '}
                      {result.txUrl && (
                        <a href={result.txUrl} target="_blank" rel="noreferrer">
                          See the transaction
                        </a>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {error && (
            <p className="error" role="alert">
              The run stopped: {error}. If an attempt was recorded it shows in the list below. You can try again.
            </p>
          )}
          {recorded && (
            <div className="run-outcome" key={recorded.nonce}>
              <Stamp outcome={recorded.outcome} />
              <p>{explainAttempt(recorded)}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
