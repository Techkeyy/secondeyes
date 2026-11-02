'use client';

import { useState } from 'react';
import { runDemoAgent, type AgentStep } from '@/lib/agent';
import { errorText } from '@/lib/near';
import type { Mandate } from '@/lib/types';

const PAGES = [
  { path: '/invoice/clean', label: 'Run on the clean invoice' },
  { path: '/invoice/poisoned', label: 'Run on the scam invoice' },
];

export function DemoAgent({ mandate, secret, onDone }: { mandate: Mandate; secret: string; onDone: () => void }) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  async function run(path: string) {
    setSteps([]);
    setError('');
    setRunning(true);
    try {
      await runDemoAgent(mandate, secret, path, (s) => setSteps((prev) => [...prev, s]));
    } catch (e) {
      setError(errorText(e));
    }
    setRunning(false);
    onDone();
  }

  return (
    <section>
      <h2>Try the demo agent</h2>
      <p>
        This agent runs in your browser with the agent key. It reads an invoice page, decides what to pay, asks the judge, then calls the
        contract. The scam page is the same invoice, but it says Acme's payment details changed and names a new payee.
      </p>
      <div className="actions">
        {PAGES.map((p, i) => (
          <button key={p.path} className={i === 0 ? 'primary' : ''} disabled={running} onClick={() => run(p.path)}>
            {running ? 'Working...' : p.label}
          </button>
        ))}
      </div>
      <ol className="steps" aria-live="polite">
        {steps.map((s, i) => (
          <li key={i}>
            {s.kind === 'read' && (
              <>
                <strong>1. Page read</strong> <span className="mono">{s.path}</span>
                <pre>{s.pageText}</pre>
              </>
            )}
            {s.kind === 'concluded' && (
              <>
                <strong>2. The agent concluded</strong>
                <div>
                  Pay <span className="mono">{s.payee}</span>, {s.amountNear} NEAR, purpose &ldquo;{s.purpose}&rdquo;
                </div>
              </>
            )}
            {s.kind === 'judge' && (
              <>
                <strong>3. Judge answered</strong> <span className="mono">{s.answer}</span>
              </>
            )}
            {s.kind === 'result' && (
              <>
                <strong>4. Contract result</strong> {s.ok ? <span className="mono">{s.text}</span> : <span className="error">{s.text}</span>}
                {s.txUrl && (
                  <>
                    {' '}
                    <a href={s.txUrl} target="_blank" rel="noreferrer">
                      Transaction
                    </a>
                  </>
                )}
              </>
            )}
          </li>
        ))}
        {running && <li className="muted">Working on the next step...</li>}
      </ol>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
