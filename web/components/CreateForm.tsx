'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FAUCET_URL, MAX_INSTRUCTION_LEN, PAYEE_ACME } from '@/lib/config';
import { instructionError } from '@/lib/fields';
import { generateAgentKey, saveAgentKey } from '@/lib/keys';
import { errorText, getSetupFee, mandatesByOwner, outcomeFailure, provider } from '@/lib/near';
import { formatNear, parseNear } from '@/lib/units';
import { useWallet } from '@/lib/wallet';

const EXPIRIES = [
  { label: '1 hour', hours: 1 },
  { label: '1 day', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WATCH_TRIES = 90; // three minutes, at 2 seconds each: long enough to read and approve in a wallet
const DEMO_INSTRUCTION = `Pay Acme invoice AC-1042, 0.1 NEAR, to ${PAYEE_ACME}.`;

function Tick() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" />
      <path pathLength="1" d="M6 10.5l3 3 5-6.5" />
    </svg>
  );
}

export function CreateForm({ accountId }: { accountId: string }) {
  const { call } = useWallet();
  const router = useRouter();
  const [fee, setFee] = useState<bigint | null>(null);
  const [instruction, setInstruction] = useState(DEMO_INSTRUCTION);
  const [budget, setBudget] = useState('0.3');
  const [perPayment, setPerPayment] = useState('0.1');
  const [count, setCount] = useState('3');
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const [wallet, setWallet] = useState<bigint | null>(null);

  useEffect(() => {
    getSetupFee().then((f) => setFee(BigInt(f)), (e) => setError(errorText(e)));
  }, []);

  const perY = parseNear(perPayment);
  const budgetY = parseNear(budget);
  const countN = /^[0-9]+$/.test(count) ? Number(count) : 0;
  const needed = budgetY && fee !== null ? budgetY + fee : null;
  const short = wallet !== null && needed !== null && wallet < needed;

  // Keeps looking while the wallet is short, so topping up from the faucet carries on by itself.
  useEffect(() => {
    let alive = true;
    const look = () =>
      provider.viewAccount({ accountId }).then(
        (a) => alive && setWallet(BigInt(a.amount)),
        () => alive && setWallet(0n), // a new account does not exist on the network until it first receives NEAR
      );
    look();
    const timer = setInterval(look, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [accountId]);

  const namesPayee = /[a-z0-9_-]+\.(near|testnet)\b|\b[0-9a-f]{64}\b/i.test(instruction);
  const namesAmount = /\d+(\.\d+)?\s*NEAR\b/i.test(instruction);
  const slots = perY && budgetY && perY > 0n ? Math.min(countN, Number(budgetY / perY)) : 0;
  const problem =
    instructionError(instruction) ??
    (!budgetY || budgetY === 0n ? 'The budget must be a number above zero.' : null) ??
    (!perY || perY === 0n ? 'The most per payment must be a number above zero.' : null) ??
    (perY! > budgetY! ? 'The most per payment cannot be more than the budget.' : null) ??
    (countN < 1 ? 'The most payments must be a whole number of at least 1.' : null);

  async function create() {
    if (problem || fee === null || !perY || !budgetY) return;
    setError('');
    // Save the key before asking the wallet, so a mandate can never exist without it.
    const key = generateAgentKey();
    saveAgentKey(key);
    const expires = BigInt(Date.now() + hours * 3_600_000) * 1_000_000n;
    let failure = '';
    let walletDone = false;
    setBusy('Approve it in your wallet');
    call(
      'create_mandate',
      {
        agent_public_key: key.publicKey,
        instruction,
        max_per_payment: perY.toString(),
        max_total: budgetY.toString(),
        max_payments: countN,
        expires_at: expires.toString(),
      },
      budgetY + fee,
      50,
    )
      .then((outcome) => (failure = outcomeFailure(outcome) ?? ''), (e) => (failure = errorText(e)))
      .finally(() => (walletDone = true));
    // Watch the chain for the new mandate by its agent key. Some wallets never answer the page, so
    // the chain decides, not the wallet's reply.
    for (let i = 0; i < WATCH_TRIES; i++) {
      await sleep(2000);
      const mine = (await mandatesByOwner(accountId).catch(() => [])).find((m) => m.agent_public_key === key.publicKey);
      if (mine) return router.push(`/budget/${mine.id}`);
      if (failure) break;
    }
    setBusy('');
    setError(
      /reject|cancel|denied/i.test(failure)
        ? 'You cancelled in your wallet. Nothing changed and no money moved.'
        : failure ||
            (walletDone
              ? 'The wallet finished, but the new budget did not show up. Check "Your budgets" in a moment.'
              : 'Your wallet has not answered and no budget has appeared on the blockchain. Check your wallet. If the transaction goes through later, the budget will show under "Your budgets".'),
    );
  }

  return (
    <div className="page form-page">
      <div className="form-intro">
        <h1>New budget</h1>
        <p className="lead">Every payment your agent asks for gets compared with this sheet.</p>
        <p className="desk-note">It is already filled in to match our sample invoices. Just press the button to try it, and write your own when you bring your own agent.</p>
      </div>
      <form
        className="sheet form-sheet"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <label htmlFor="instruction">What may your agent pay for?</label>
        <textarea id="instruction" className="written-input" value={instruction} onChange={(e) => setInstruction(e.target.value)} aria-describedby="instruction-hint" />
        <ul className="checks" aria-live="polite">
          <li className={namesPayee ? 'ok' : ''}>
            <Tick />
            Says who gets paid
          </li>
          <li className={namesAmount ? 'ok' : ''}>
            <Tick />
            Says how much
          </li>
        </ul>
        <p className="hint" id="instruction-hint">
          The sharper this is, the more it catches. Paying more than once? Say how many, like “weekly invoices, week 1 to week 3”. Anyone can read this, so no secrets. {[...instruction].length} of {MAX_INSTRUCTION_LEN}.
        </p>

        <div className="row">
          <div>
            <label htmlFor="budget">Budget</label>
            <div className="unit">
              <input id="budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
              <span>NEAR</span>
            </div>
          </div>
          <div>
            <label htmlFor="per">Most per payment</label>
            <div className="unit">
              <input id="per" inputMode="decimal" value={perPayment} onChange={(e) => setPerPayment(e.target.value)} />
              <span>NEAR</span>
            </div>
          </div>
          <div>
            <label htmlFor="count">Most payments</label>
            <input id="count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <div>
            <label htmlFor="expiry">Stops after</label>
            <select id="expiry" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {EXPIRIES.map((x) => (
                <option key={x.hours} value={x.hours}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {slots > 0 && (
          <div className="slots" role="img" aria-label={`Room for ${slots} payments`}>
            <span className="slots-row">
              {Array.from({ length: Math.min(slots, 20) }, (_, i) => (
                <span key={i} style={{ animationDelay: `${i * 30}ms` }} />
              ))}
            </span>
            <span className="hint">
              Room for {slots} {slots === 1 ? 'payment' : 'payments'} of up to {perPayment} NEAR
            </span>
          </div>
        )}

        <dl className="total">
          <dt>Budget, yours again when you close it</dt>
          <dd className="mono">{budgetY ? formatNear(budgetY) : '...'} NEAR</dd>
          <dt>Setup fee, not refunded</dt>
          <dd className="mono">{fee === null ? '...' : formatNear(fee)} NEAR</dd>
          <dt className="total-line">Your wallet will ask for</dt>
          <dd className="mono total-line">{budgetY && fee !== null ? formatNear(budgetY + fee) : '...'} NEAR</dd>
        </dl>
        <p className="hint">The fee pays for storage and for the agent’s gas. A budget holds up to 20 attempts, paid or refused.</p>

        {short && (
          <p className="topup" role="status">
            Your wallet has {formatNear(wallet!)} NEAR and this needs {formatNear(needed!)}.
            {FAUCET_URL && (
              <>
                {' '}
                <a href={FAUCET_URL} target="_blank" rel="noreferrer">
                  Get free test NEAR
                </a>{' '}
                for <span className="mono">{accountId}</span>. This page carries on by itself once it arrives.
              </>
            )}
          </p>
        )}
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        <button type="submit" className="primary wide" disabled={!!problem || fee === null || !!busy || short}>
          {busy || 'Create budget'}
        </button>
        {busy && (
          <p className="hint" role="status">
            Your wallet shows the amount before you approve. This page moves on by itself once the budget is on the blockchain.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="hint">This browser makes a key for the agent and keeps it here, never on our server. The key can only ask to pay from this budget, within your limits.</p>
      </form>
    </div>
  );
}
