'use client';

import { useCallback, useEffect, useState } from 'react';
import { CONTRACT_ID, EXPLORER, MAX_ATTEMPTS } from '@/lib/config';
import { explainAttempt } from '@/lib/explain';
import { checkAgentKey, loadAgentKey, saveAgentKey } from '@/lib/keys';
import { errorText, getMandate, outcomeFailure } from '@/lib/near';
import type { Mandate } from '@/lib/types';
import { formatNear } from '@/lib/units';
import { useWallet } from '@/lib/wallet';
import { DemoAgent } from './DemoAgent';

const when = (ns: string) => new Date(Number(BigInt(ns) / 1_000_000n)).toLocaleString();

export function MandateView({ id }: { id: number }) {
  const { accountId, call } = useWallet();
  const [m, setM] = useState<Mandate | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
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

  if (m === undefined) return <p className="muted">{error || 'Loading from the blockchain...'}</p>;
  if (m === null) return <p>There is no mandate #{id} on {CONTRACT_ID}.</p>;

  const expired = BigInt(Date.now()) * 1_000_000n >= BigInt(m.expires_at);
  const full = m.attempts.length >= MAX_ATTEMPTS;
  const isOwner = accountId === m.owner;
  const state = m.closed ? 'Closed' : full ? 'Full' : expired ? 'Expired' : 'Open';

  async function close() {
    if (!m) return;
    setError('');
    setNotice('');
    setClosing(true);
    try {
      const outcome = await call('close', { mandate_id: m.id }, 1n, 30);
      const failure = outcomeFailure(outcome);
      if (failure) setError(failure);
      else setNotice(`Closed. ${formatNear(m.balance)} NEAR is on its way back to ${m.owner}, and the agent key is deleted.`);
    } catch (e) {
      setError(errorText(e));
    }
    setClosing(false);
    refresh();
  }

  function importKey() {
    const ok = checkAgentKey(paste, m!.agent_public_key);
    if (!ok) return setError('That key does not belong to this mandate.');
    saveAgentKey({ publicKey: m!.agent_public_key, secret: ok });
    setSecret(ok);
    setPaste('');
    setError('');
  }

  return (
    <>
      <h1>
        Mandate #{m.id} <span className="chip">{state}</span>
      </h1>
      <p className="muted">
        Owner <span className="mono wrap">{m.owner}</span>
      </p>
      {notice && <div className="notice">{notice}</div>}
      {error && <p className="error">{error}</p>}

      <h2>Instruction</h2>
      <div className="instruction">{m.instruction}</div>
      <p className="hint">Public on the blockchain. The judge compares every payment with exactly this text.</p>

      <h2>Money</h2>
      <dl className="facts">
        <dt>Balance</dt>
        <dd>{formatNear(m.balance)} NEAR</dd>
        <dt>Spent</dt>
        <dd>
          {formatNear(m.spent)} NEAR in {m.payments_made} payment{m.payments_made === 1 ? '' : 's'}
        </dd>
        <dt>Max per payment</dt>
        <dd>{formatNear(m.max_per_payment)} NEAR</dd>
        <dt>Max total</dt>
        <dd>{formatNear(m.max_total)} NEAR</dd>
        <dt>Max payments</dt>
        <dd>{m.max_payments}</dd>
        <dt>Expires</dt>
        <dd>
          {when(m.expires_at)}
          {expired && ' (expired)'}
        </dd>
      </dl>

      <h2>Judge</h2>
      <p className="hint">Fixed when this mandate was created. It cannot be swapped while your money is in it.</p>
      <dl className="facts">
        <dt>Model</dt>
        <dd className="mono">{m.judge.model_id}</dd>
        <dt>Signing key</dt>
        <dd className="mono">{m.judge.public_key_hex}</dd>
      </dl>

      <h2>Agent key</h2>
      <dl className="facts">
        <dt>Public</dt>
        <dd className="mono">{m.agent_public_key}</dd>
      </dl>
      {secret ? (
        <>
          <p className="hint">
            This browser holds the secret key. It can only call <span className="mono">pay</span> on {CONTRACT_ID}, within your limits. It is
            deleted when you close the mandate. Give it to your agent as <span className="mono">AGENT_KEY</span>, and keep it private.
          </p>
          <div className="actions">
            <button className="small" onClick={() => setReveal(!reveal)}>
              {reveal ? 'Hide secret key' : 'Show secret key'}
            </button>
            <button className="small" onClick={() => navigator.clipboard.writeText(secret)}>
              Copy secret key
            </button>
          </div>
          {reveal && <p className="mono wrap">{secret}</p>}
        </>
      ) : (
        <>
          <p className="hint">This browser does not hold the secret key for this mandate. Paste it here to use the demo agent.</p>
          <input aria-label="Agent secret key" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="ed25519:..." />
          <div className="actions">
            <button className="small" disabled={!paste} onClick={importKey}>
              Use this key
            </button>
          </div>
        </>
      )}

      {secret && !m.closed && !full && !expired && <DemoAgent mandate={m} secret={secret} onDone={refresh} />}

      <h2>
        Attempts: {m.attempts.length} of {MAX_ATTEMPTS}
      </h2>
      {full && !m.closed && (
        <div className="notice warn">All 20 attempts are used. Close this mandate to take your money back, then create a new one.</div>
      )}
      <p className="hint">
        A refusal is a normal, successful transaction: the contract records it and keeps the money. Every attempt uses one of the 20.{' '}
        <a href={`${EXPLORER}/address/${CONTRACT_ID}`} target="_blank" rel="noreferrer">
          See all transactions on the explorer
        </a>
        .
      </p>
      {m.attempts.length === 0 && <p className="muted">No attempts yet.</p>}
      <ul className="plain">
        {[...m.attempts].reverse().map((a) => (
          <li key={a.nonce}>
            <span className={`status ${a.outcome}`}>{a.outcome === 'PayoutFailed' ? 'Payout failed' : a.outcome}</span>{' '}
            {formatNear(a.amount)} NEAR to <span className="mono wrap">{a.payee}</span>
            <div className="muted">
              {a.purpose ? `Purpose: ${a.purpose}. ` : ''}
              {when(a.timestamp)}
            </div>
            <div>{explainAttempt(a)}</div>
          </li>
        ))}
      </ul>

      {!m.closed && (
        <>
          <h2>Close and withdraw</h2>
          {isOwner ? (
            <>
              <p>
                Returns the remaining {formatNear(m.balance)} NEAR to you and deletes the agent key. The setup fee is not refunded. Your
                wallet will ask you to approve 1 yoctoNEAR (a trace amount, returned with your funds).
              </p>
              <div className="actions">
                <button className="danger" disabled={closing} onClick={close}>
                  {closing ? 'Waiting for your wallet...' : 'Close and withdraw'}
                </button>
              </div>
            </>
          ) : (
            <p className="muted">
              Only the owner, <span className="mono wrap">{m.owner}</span>, can close this mandate. {accountId ? 'You are connected as another account.' : 'Connect that wallet to close it.'}
            </p>
          )}
        </>
      )}
    </>
  );
}
