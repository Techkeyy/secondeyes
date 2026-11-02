'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MAX_ATTEMPTS, NETWORK } from '@/lib/config';
import { errorText, mandatesByOwner, provider } from '@/lib/near';
import type { Mandate } from '@/lib/types';
import { formatNear } from '@/lib/units';
import { useWallet } from '@/lib/wallet';
import { CreateForm } from './CreateForm';

export function Home() {
  const { accountId, ready, connect } = useWallet();
  const [mandates, setMandates] = useState<Mandate[] | null>(null);
  const [error, setError] = useState('');
  const [connectError, setConnectError] = useState('');
  const [unfunded, setUnfunded] = useState(false);

  useEffect(() => {
    setMandates(null);
    setError('');
    setUnfunded(false);
    if (!accountId) return;
    // A new wallet's account does not exist on the network until it first receives NEAR.
    provider.viewAccount({ accountId }).catch(() => setUnfunded(true));
    mandatesByOwner(accountId).then(setMandates, (e) => setError(errorText(e)));
  }, [accountId]);

  return (
    <>
      <h1>A second pair of eyes on every payment your AI agent makes.</h1>
      <p className="lead">
        You give an agent a small budget and write down what it may pay for. Before any payment leaves, an AI judge compares it with your
        instruction. A payment that matches goes through. One that does not is refused, and the money stays put. Name the payee and amount for the strongest check.
      </p>
      <p>
        The judge never reads web pages. It sees only your instruction and the payment details, so a scam on a page can only reach it through those details.
        Try it with an{' '}
        <Link href="/invoice/clean">honest invoice</Link> and a <Link href="/invoice/poisoned">scam one</Link>.
      </p>

      {!accountId && (
        <div className="actions">
          <button className="primary" disabled={!ready} onClick={() => connect().catch((e) => setConnectError(e.message))}>
            Connect a NEAR wallet to start
          </button>
          <p className="hint">After you pick a wallet, its panel can stay blank while it downloads. On a slow connection, Meteor can take a minute or more. Intear Wallet loads fastest.</p>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {connectError && !accountId && <p className="error">{connectError}</p>}

      {accountId && (
        <>
          {unfunded && (
            <p className="error">
              This wallet account has no NEAR on {NETWORK} yet, so creating a mandate will fail. Send it some {NETWORK} NEAR first, then reload this page.
            </p>
          )}
          <h2>Your mandates</h2>
          {mandates === null && <p className="muted">Loading from the blockchain...</p>}
          {mandates?.length === 0 && <p className="muted">None yet. Create your first one below.</p>}
          {mandates && mandates.length > 0 && (
            <ul className="plain">
              {[...mandates].reverse().map((m) => (
                <li key={m.id}>
                  <Link href={`/mandate/${m.id}`}>Mandate #{m.id}</Link>{' '}
                  <span className="muted">
                    {m.closed ? 'closed' : `${formatNear(m.balance)} NEAR left`}, {m.attempts.length} of {MAX_ATTEMPTS} attempts
                  </span>
                  <div className="wrap">{m.instruction.length > 120 ? `${m.instruction.slice(0, 120)}...` : m.instruction}</div>
                </li>
              ))}
            </ul>
          )}
          <CreateForm accountId={accountId} />
        </>
      )}
    </>
  );
}
