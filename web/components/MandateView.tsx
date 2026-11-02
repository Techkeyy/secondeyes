'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CONTRACT_ID, EXPLORER, MAX_ATTEMPTS } from '@/lib/config';
import { explainAttempt } from '@/lib/explain';
import { checkAgentKey, loadAgentKey, saveAgentKey } from '@/lib/keys';
import { errorText, getMandate, outcomeFailure } from '@/lib/near';
import type { Mandate } from '@/lib/types';
import { formatNear } from '@/lib/units';
import { useWallet } from '@/lib/wallet';
import { ConnectAgent } from './ConnectAgent';
import { DemoAgent } from './DemoAgent';
import { Stamp } from './Stamp';

const when = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toLocaleString();

export function MandateView({ id }: { id: number }) {
  const { accountId, call } = useWallet();
  const [m, setM] = useState<Mandate | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      setM(await getMandate(id));
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pk = m?.agent_public_key;
  useEffect(() => {
    if (pk) setSecret(loadAgentKey(pk));
  }, [pk]);

  if (m === undefined) {
    return (
      <div className="page">
        {error ? (
          <p className="alert">
            Could not read this budget from the blockchain: {error}{' '}
            <button className="link" onClick={refresh}>
              Try again
            </button>
          </p>
        ) : (
          <p className="desk-note" role="status">
            Reading from the blockchain
          </p>
        )}
      </div>
    );
  }
  if (m === null) {
    return (
      <div className="page narrow">
        <h1>There is no budget #{id}</h1>
        <p className="lead">Nothing with that number exists on this contract.</p>
        <Link href="/budgets" className="button on-desk">
          See your budgets
        </Link>
      </div>
    );
  }

  const expired = BigInt(Date.now()) * 1_000_000n >= BigInt(m.expires_at);
  const full = m.attempts.length >= MAX_ATTEMPTS;
  const isOwner = accountId === m.owner;
  const live = !m.closed && !full && !expired;
  const state = m.closed ? 'Closed' : full ? 'Full' : expired ? 'Expired' : 'Open';
  const spentShare = Number((BigInt(m.spent) * 100n) / BigInt(m.max_total));

  async function close() {
    if (!m) return;
    setError('');
    setNotice('');
    setClosing(true);
    try {
      const outcome = await call('close', { mandate_id: m.id }, 1n, 30);
      const failure = outcomeFailure(outcome);
      if (failure) setError(failure);
      else setNotice(`Closed. ${formatNear(m.balance)} NEAR is on its way back to ${m.owner}, and the agent’s key is deleted.`);
    } catch (e) {
      const text = errorText(e);
      setError(/reject|cancel|denied/i.test(text) ? 'You cancelled in your wallet. Nothing changed.' : text);
    }
    setClosing(false);
    refresh();
  }

  function importKey() {
    const ok = checkAgentKey(paste, m!.agent_public_key);
    if (!ok) return setError('That key does not belong to this budget.');
    saveAgentKey({ publicKey: m!.agent_public_key, secret: ok });
    setSecret(ok);
    setPaste('');
    setError('');
  }

  return (
    <div className="page budget">
      <div className="budget-main">
        <p className="crumb">
          <Link href="/budgets" className="quiet-link">
            Your budgets
          </Link>
        </p>
        <h1>
          Budget #{m.id} <span className="state">{state}</span>
        </h1>
        {notice && (
          <div className="good" role="status">
            <p>{notice}</p>
            <Link href="/budgets/new" className="button on-desk">
              Start another budget
            </Link>
          </div>
        )}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <div className="sheet instruction-sheet">
          <p className="field-label">The instruction the judge goes by</p>
          <p className="written">{m.instruction}</p>
        </div>

        {live &&
          (secret ? (
            <DemoAgent mandate={m} secret={secret} onDone={refresh} />
          ) : (
            <section className="stage">
              <h2>This browser does not hold the agent’s key</h2>
              <p className="section-lead">The key stays in the browser that created the budget. Open this page there, or paste the key here to run the sample agent.</p>
              <div className="paste">
                <input aria-label="Agent secret key" className="on-desk-input" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="ed25519:..." />
                <button className="on-desk" disabled={!paste} onClick={importKey}>
                  Use this key
                </button>
              </div>
            </section>
          ))}
        {live && secret && <ConnectAgent mandate={m} secret={secret} onWatch={refresh} />}
        {full && !m.closed && <p className="alert">All {MAX_ATTEMPTS} attempts are used. Close this budget to take your money back, then create a new one.</p>}
        {expired && !m.closed && !full && <p className="alert">This budget has expired, so the agent can no longer pay from it. Close it to take your money back.</p>}

        <section aria-labelledby="record-title">
          <div className="record-head">
            <h2 id="record-title">Every attempt</h2>
            <span className="desk-note">
              {m.attempts.length} of {MAX_ATTEMPTS} used
            </span>
          </div>
          {m.attempts.length === 0 ? (
            <p className="desk-note">Nothing yet. Every payment the agent tries shows up here, paid or refused.</p>
          ) : (
            <ol className="sheet ledger">
              {[...m.attempts].reverse().map((a) => (
                <li key={a.nonce}>
                  <div className="ledger-body">
                    <p className="ledger-title">
                      <span className="mono">{formatNear(a.amount)} NEAR</span> to <span className="mono wrap">{a.payee}</span>
                    </p>
                    {a.purpose && <p className="ledger-purpose">For “{a.purpose}”</p>}
                    <p className="hint">{explainAttempt(a)}</p>
                    <p className="hint">{when(a.timestamp)}</p>
                  </div>
                  <Stamp outcome={a.outcome} small />
                </li>
              ))}
            </ol>
          )}
          <p className="desk-note">
            <a href={`${EXPLORER}/address/${CONTRACT_ID}`} target="_blank" rel="noreferrer">
              See all transactions on the explorer
            </a>
          </p>
        </section>
      </div>

      <aside className="budget-side">
        <p className="side-label">Left in this budget</p>
        <p className="side-figure" key={m.balance}>
          {formatNear(m.balance)} NEAR
        </p>
        <div className="meter" role="img" aria-label={`${formatNear(m.spent)} of ${formatNear(m.max_total)} NEAR spent`}>
          <span style={{ transform: `scaleX(${Math.min(spentShare, 100) / 100})` }} />
        </div>
        <p className="desk-note">
          {formatNear(m.spent)} of {formatNear(m.max_total)} NEAR spent, in {m.payments_made} {m.payments_made === 1 ? 'payment' : 'payments'}
        </p>

        <dl className="limits-list">
          <dt>Most per payment</dt>
          <dd>{formatNear(m.max_per_payment)} NEAR</dd>
          <dt>Most payments</dt>
          <dd>{m.max_payments}</dd>
          <dt>{expired ? 'Expired' : 'Stops'}</dt>
          <dd>{when(m.expires_at)}</dd>
        </dl>

        {!m.closed &&
          (isOwner ? (
            <div className="close-box">
              <button className="on-desk wide" disabled={closing} onClick={close}>
                {closing ? 'Approve it in your wallet' : `Close and take back ${formatNear(m.balance)} NEAR`}
              </button>
              <p className="desk-note">Your wallet asks you to approve a trace amount (1 yoctoNEAR), which proves it is you. The setup fee is not refunded.</p>
            </div>
          ) : (
            <p className="desk-note close-box">
              Only the owner, <span className="mono wrap">{m.owner}</span>, can close this budget. {accountId ? 'You are connected as another account.' : 'Connect that wallet to close it.'}
            </p>
          ))}

        <details className="side-details">
          <summary>Technical details</summary>
          <p>The judge was fixed when this budget was created and cannot be swapped while your money is in it.</p>
          <dl className="tech">
            <dt>Owner</dt>
            <dd className="mono">{m.owner}</dd>
            <dt>Judge model</dt>
            <dd className="mono">{m.judge.model_id}</dd>
            <dt>Judge signing key</dt>
            <dd className="mono">{m.judge.public_key_hex}</dd>
            <dt>Agent public key</dt>
            <dd className="mono">{m.agent_public_key}</dd>
            <dt>Contract</dt>
            <dd className="mono">{CONTRACT_ID}</dd>
          </dl>
        </details>
      </aside>
    </div>
  );
}
