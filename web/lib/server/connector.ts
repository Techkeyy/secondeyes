import { Account, actions, KeyPair, teraToGas } from 'near-api-js';
import { CONTRACT_ID, EXPLORER } from '../config';
import { sanitisePurpose } from '../fields';
import { getMandate, provider, txHash } from '../near';
import type { Attempt, Mandate } from '../types';
import { formatNear, parseNear } from '../units';
import { judge } from './judge';

const MEANING: Record<Attempt['outcome'], string> = {
  Paid: 'The payment matched the instruction and the money was sent.',
  Refused: 'The payment did not pass the check and the money stayed in the budget. Do not retry it with different wording. Tell the person who owns this budget.',
  PayoutFailed: 'The check passed but the transfer failed, so the money is back in the budget. Tell the person who owns this budget.',
};

/**
 * A connector link is /mcp/<budget>-<agent key>. Nothing is stored: the link is all the server ever
 * has, and only for the length of a request. Null unless the key really belongs to that budget.
 */
export async function openLink(token: string): Promise<{ id: number; key: KeyPair } | null> {
  const match = /^(\d{1,15})-([1-9A-HJ-NP-Za-km-z]+)$/.exec(token);
  if (!match) return null;
  try {
    const id = Number(match[1]);
    const key = KeyPair.fromString(`ed25519:${match[2]}`);
    const mandate = await getMandate(id);
    return mandate?.agent_public_key === key.getPublicKey().toString() ? { id, key } : null;
  } catch {
    return null;
  }
}

async function readMandate(id: number): Promise<Mandate> {
  const m = await getMandate(id);
  if (!m) throw new Error(`There is no budget #${id}.`);
  return m;
}

export async function budgetSummary(id: number) {
  const m = await readMandate(id);
  const expired = BigInt(Date.now()) * 1_000_000n >= BigInt(m.expires_at);
  return {
    budget: m.id,
    state: m.closed ? 'closed' : expired ? 'expired' : 'open',
    instruction: m.instruction,
    left_near: formatNear(m.balance),
    spent_near: formatNear(m.spent),
    most_per_payment_near: formatNear(m.max_per_payment),
    most_in_total_near: formatNear(m.max_total),
    payments_made: m.payments_made,
    most_payments: m.max_payments,
    stops_at: new Date(Number(BigInt(m.expires_at) / 1_000_000n)).toISOString(),
    attempts: m.attempts.map((a) => ({ outcome: a.outcome, payee: a.payee, amount_near: formatNear(a.amount), purpose: a.purpose })),
  };
}

/** Same steps as agent/pay.mjs, signing here instead of on the agent's machine. The contract's record decides the result. */
export async function payFromBudget(id: number, key: KeyPair, { payee, amount_near, purpose }: { payee: string; amount_near: string; purpose: string }) {
  const near = parseNear(amount_near.trim());
  if (near === null) throw new Error(`The amount must be a plain number of NEAR, like 0.1. Got "${amount_near}".`);
  const amount = near.toString();
  const cleanPurpose = sanitisePurpose(purpose);
  const before = await readMandate(id);

  const answer = await judge({ mandate_id: id, payee, amount, purpose: cleanPurpose });

  const agent = new Account(CONTRACT_ID, provider, key.toString() as `ed25519:${string}`);
  const outcome = await agent.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    actions: [actions.functionCall('pay', { mandate_id: id, payee, amount, purpose: cleanPurpose, ...answer }, teraToGas('30'), 0n)],
    waitUntil: 'FINAL',
    throwOnFailure: false,
  });
  const hash = txHash(outcome);
  const tx_url = hash && `${EXPLORER}/txns/${hash}`;

  const after = await readMandate(id);
  const attempt = after.attempts.length > before.attempts.length ? after.attempts[after.attempts.length - 1] : null;
  if (!attempt) {
    return { status: 'rejected', meaning: 'The contract rejected the call and recorded nothing. No money moved.', left_near: formatNear(after.balance), tx_url };
  }
  return {
    status: attempt.outcome === 'Paid' ? 'paid' : attempt.outcome === 'Refused' ? 'refused' : 'not_sent',
    meaning: MEANING[attempt.outcome],
    reason: attempt.reason,
    payee: attempt.payee,
    amount_near: formatNear(attempt.amount),
    left_near: formatNear(after.balance),
    tx_url,
  };
}
