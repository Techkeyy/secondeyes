'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONTRACT_ID, MAX_INSTRUCTION_LEN } from '@/lib/config';
import { instructionError } from '@/lib/fields';
import { generateAgentKey, saveAgentKey } from '@/lib/keys';
import { errorText, getSetupFee, mandatesByOwner, outcomeFailure } from '@/lib/near';
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

export function CreateForm({ accountId }: { accountId: string }) {
  const { call } = useWallet();
  const router = useRouter();
  const [fee, setFee] = useState<bigint | null>(null);
  const [instruction, setInstruction] = useState('');
  const [perPayment, setPerPayment] = useState('0.1');
  const [total, setTotal] = useState('0.3');
  const [count, setCount] = useState('3');
  const [hours, setHours] = useState(24);
  const [funds, setFunds] = useState('0.5');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getSetupFee().then((f) => setFee(BigInt(f)), (e) => setError(errorText(e)));
  }, []);

  const instrErr = instruction ? instructionError(instruction) : null;
  const perY = parseNear(perPayment);
  const totalY = parseNear(total);
  const fundsY = parseNear(funds);
  const countN = /^[0-9]+$/.test(count) ? Number(count) : 0;
  const problem =
    instructionError(instruction) ??
    (!perY || perY === 0n ? 'Max per payment must be a number above zero.' : null) ??
    (!totalY || totalY === 0n ? 'Max total must be a number above zero.' : null) ??
    (countN < 1 ? 'Max payments must be a whole number of at least 1.' : null) ??
    (!fundsY || fundsY === 0n ? 'Funds must be a number above zero.' : null);

  async function create() {
    if (problem || fee === null || !perY || !totalY || !fundsY) return;
    setError('');
    // Save the key before asking the wallet, so a mandate can never exist without it.
    const key = generateAgentKey();
    saveAgentKey(key);
    const expires = BigInt(Date.now() + hours * 3_600_000) * 1_000_000n;
    let failure = '';
    let walletDone = false;
    setBusy('Waiting for your wallet to approve...');
    call(
      'create_mandate',
      {
        agent_public_key: key.publicKey,
        instruction,
        max_per_payment: perY.toString(),
        max_total: totalY.toString(),
        max_payments: countN,
        expires_at: expires.toString(),
      },
      fundsY + fee,
      50,
    )
      .then((outcome) => (failure = outcomeFailure(outcome) ?? ''), (e) => (failure = errorText(e)))
      .finally(() => (walletDone = true));
    // Watch the chain for the new mandate by its agent key. Some wallets never answer the page, so
    // the chain decides, not the wallet's reply.
    for (let i = 0; i < WATCH_TRIES; i++) {
      await sleep(2000);
      const mine = (await mandatesByOwner(accountId).catch(() => [])).find((m) => m.agent_public_key === key.publicKey);
      if (mine) return router.push(`/mandate/${mine.id}`);
      if (failure) break;
    }
    setBusy('');
    setError(
      failure ||
        (walletDone
          ? 'The wallet finished, but the new mandate did not show up. Reload this page and check "Your mandates".'
          : 'Your wallet has not answered and no mandate has appeared on the blockchain. Check your wallet. If the transaction goes through later, the mandate will show under "Your mandates" after a reload.'),
    );
  }

  return (
    <section>
      <h2>Create a mandate</h2>
      <label htmlFor="instruction">Instruction for the agent</label>
      <textarea
        id="instruction"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Pay Acme invoice AC-1042, 0.1 NEAR, to secondeyes-owner.testnet."
        aria-invalid={!!instrErr}
      />
      <p className="hint">
        {[...instruction].length} of {MAX_INSTRUCTION_LEN}. Name the payee account and the amount: the judge can only check what you write here.
      </p>
      <p className="hint">
        The judge sees what this mandate has already paid and refuses repeats. For repeat payments, say how many and what each one is, such as &quot;weekly invoices, week 1 to week 3&quot;. It cannot see today&apos;s date.
      </p>
      {instrErr && <p className="error">{instrErr}</p>}
      <p className="hint">This text is stored on the public blockchain. Anyone can read it. Do not put secrets in it.</p>

      <div className="row">
        <div>
          <label htmlFor="per">Max per payment (NEAR)</label>
          <input id="per" inputMode="decimal" value={perPayment} onChange={(e) => setPerPayment(e.target.value)} />
        </div>
        <div>
          <label htmlFor="total">Max total (NEAR)</label>
          <input id="total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
        <div>
          <label htmlFor="count">Max payments</label>
          <input id="count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <div>
          <label htmlFor="expiry">Expires in</label>
          <select id="expiry" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {EXPIRIES.map((x) => (
              <option key={x.hours} value={x.hours}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label htmlFor="funds">Funds to put in the mandate (NEAR)</label>
      <input id="funds" inputMode="decimal" value={funds} onChange={(e) => setFunds(e.target.value)} />
      <p className="hint">You can take back whatever is left at any time by closing the mandate.</p>

      <div className="notice warn">
        <strong>Setup fee: {fee === null ? '...' : `${formatNear(fee)} NEAR`}, not refundable.</strong> It pays for storage and for the
        agent key&apos;s gas on {CONTRACT_ID}. Your wallet will ask you to approve {fundsY && fee !== null ? formatNear(fundsY + fee) : '...'} NEAR in
        total: funds plus fee. A mandate holds at most 20 attempts; when it is full, close it and create a new one.
      </div>
      <div className="notice">
        Your browser makes a key for the agent and keeps it in this browser only. It is never sent to this site&apos;s server. You will be able to
        copy it on the next page. Anyone who holds it can make the agent&apos;s payment attempts, within your limits.
      </div>

      {problem && instruction && <p className="error">{problem}</p>}
      <div className="actions">
        <button className="primary" disabled={!!problem || fee === null || !!busy} onClick={create}>
          {busy || 'Create mandate'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
