'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MAX_ATTEMPTS } from '@/lib/config';
import { errorText, mandatesByOwner } from '@/lib/near';
import type { Mandate } from '@/lib/types';
import { formatNear } from '@/lib/units';
import { useWallet } from '@/lib/wallet';
import { CreateForm } from './CreateForm';

/** Shows the connect step until a wallet is connected. */
function Connected({ children }: { children: (accountId: string) => ReactNode }) {
  const { accountId, ready, restoring, connect } = useWallet();
  const [error, setError] = useState('');
  if (accountId) return children(accountId);
  if (restoring) {
    return (
      <div className="page narrow" role="status">
        <span className="spinner" aria-hidden="true" />
        <h1>Finding your wallet</h1>
        <p className="lead">You connected on an earlier visit. It comes back by itself in a moment.</p>
      </div>
    );
  }
  return (
    <div className="page narrow">
      <h1>First, connect a wallet</h1>
      <p className="lead">It holds your test money and asks before anything leaves it. Connecting moves no money.</p>
      <div className="actions">
        <button
          className="on-desk"
          disabled={!ready}
          onClick={() => {
            setError('');
            connect().catch((e) => e.message !== 'cancelled' && setError(e.message));
          }}
        >
          {ready ? 'Connect' : 'Loading wallets'}
        </button>
      </div>
      {error && <p className="error-on-desk">{error}</p>}
    </div>
  );
}

export function NewBudget() {
  return <Connected>{(accountId) => <CreateForm accountId={accountId} />}</Connected>;
}

export function Budgets() {
  return <Connected>{(accountId) => <BudgetList accountId={accountId} />}</Connected>;
}

const stateOf = (m: Mandate) => {
  if (m.closed) return 'Closed';
  if (m.attempts.length >= MAX_ATTEMPTS) return 'Full';
  return BigInt(Date.now()) * 1_000_000n >= BigInt(m.expires_at) ? 'Expired' : 'Open';
};

function BudgetList({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [mandates, setMandates] = useState<Mandate[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setMandates(null);
    setError('');
    mandatesByOwner(accountId).then(
      (list) => {
        // Nothing to list yet, so go straight to making the first one.
        if (list.length === 0) router.replace('/budgets/new');
        else setMandates(list);
      },
      (e) => setError(errorText(e)),
    );
  }, [accountId, router]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Your budgets</h1>
        {mandates && (
          <Link href="/budgets/new" className="button on-desk">
            New budget
          </Link>
        )}
      </div>
      {error && <p className="alert">Could not read your budgets from the blockchain: {error}</p>}
      {mandates === null && !error && (
        <p className="desk-note" role="status">
          Reading your budgets
        </p>
      )}
      {mandates && (
        <ul className="budget-list">
          {[...mandates].reverse().map((m) => (
            <li key={m.id}>
              <Link href={`/budget/${m.id}`}>
                <span className="budget-id">#{m.id}</span>
                <span className="budget-text">{m.instruction}</span>
                <span className="budget-money">{m.closed ? `${formatNear(m.spent)} NEAR spent` : `${formatNear(m.balance)} NEAR left`}</span>
                <span className={`budget-state ${stateOf(m)}`}>{stateOf(m)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
