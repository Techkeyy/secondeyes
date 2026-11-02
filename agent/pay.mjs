// What any agent needs: read its budget, and ask to make one payment.
// The agent key only signs here on the agent's machine. It is never sent to the site.
import { Account, JsonRpcProvider, actions, teraToGas } from 'near-api-js';

const YOCTO = 10n ** 24n;

export function loadConfig(env = process.env) {
  const config = {
    budget: Number(env.SECONDEYES_BUDGET),
    key: env.AGENT_KEY,
    site: env.SECONDEYES_SITE,
    contract: env.SECONDEYES_CONTRACT ?? 'secondeyes-dev.testnet',
    rpc: env.SECONDEYES_RPC ?? 'https://test.rpc.fastnear.com',
  };
  const missing = [
    !Number.isSafeInteger(config.budget) && 'SECONDEYES_BUDGET',
    !config.key && 'AGENT_KEY',
    !config.site && 'SECONDEYES_SITE',
  ].filter(Boolean);
  if (missing.length) throw new Error(`Missing settings: ${missing.join(', ')}. Copy the setup from your budget page on the SecondEyes site.`);
  return config;
}

const toYocto = (near) => {
  const m = /^(\d+)(?:\.(\d{1,24}))?$/.exec(String(near).trim());
  if (!m) throw new Error(`The amount must be a plain number of NEAR, like 0.1. Got "${near}".`);
  return (BigInt(m[1]) * YOCTO + BigInt((m[2] ?? '').padEnd(24, '0') || '0')).toString();
};

const toNear = (yocto) => {
  const v = BigInt(yocto);
  const part = (v % YOCTO).toString().padStart(24, '0').replace(/0+$/, '');
  return `${v / YOCTO}${part ? `.${part}` : ''}`;
};

const txUrl = (contract, hash) => `https://${contract.endsWith('.testnet') ? 'testnet.' : ''}nearblocks.io/txns/${hash}`;

const view = (config, id) => new JsonRpcProvider({ url: config.rpc }).callFunction({ contractId: config.contract, method: 'get_mandate', args: { id } });

export async function getBudget(config) {
  const m = await view(config, config.budget);
  if (!m) throw new Error(`There is no budget #${config.budget} on ${config.contract}.`);
  const expired = BigInt(Date.now()) * 1_000_000n >= BigInt(m.expires_at);
  return {
    budget: m.id,
    state: m.closed ? 'closed' : expired ? 'expired' : 'open',
    instruction: m.instruction,
    left_near: toNear(m.balance),
    spent_near: toNear(m.spent),
    most_per_payment_near: toNear(m.max_per_payment),
    most_in_total_near: toNear(m.max_total),
    payments_made: m.payments_made,
    most_payments: m.max_payments,
    stops_at: new Date(Number(BigInt(m.expires_at) / 1_000_000n)).toISOString(),
    attempts: m.attempts.map((a) => ({ outcome: a.outcome, payee: a.payee, amount_near: toNear(a.amount), purpose: a.purpose })),
  };
}

const MEANING = {
  Paid: 'The payment matched the instruction and the money was sent.',
  Refused: 'The payment did not pass the check and the money stayed in the budget. Do not retry it with different wording. Tell the person who owns this budget.',
  PayoutFailed: 'The check passed but the transfer failed, so the money is back in the budget. Tell the person who owns this budget.',
};

/** Asks the judge about one payment, then asks the contract to make it. The contract's record decides the result. */
export async function pay(config, { payee, amount_near, purpose = '' }) {
  const amount = toYocto(amount_near);
  const before = await view(config, config.budget);
  if (!before) throw new Error(`There is no budget #${config.budget} on ${config.contract}.`);

  const res = await fetch(new URL('/api/judge', config.site), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mandate_id: config.budget, payee, amount, purpose }),
  });
  const judged = await res.json();
  if (!res.ok) throw new Error(`The check could not run: ${judged.error ?? res.status}. Nothing was paid.`);

  const agent = new Account(config.contract, new JsonRpcProvider({ url: config.rpc }), config.key);
  const outcome = await agent.signAndSendTransaction({
    receiverId: config.contract,
    actions: [
      actions.functionCall(
        'pay',
        { mandate_id: config.budget, payee, amount, purpose, response_b64: judged.response_b64, signature_hex: judged.signature_hex },
        teraToGas('30'),
        0n,
      ),
    ],
    waitUntil: 'FINAL',
    throwOnFailure: false,
  });
  const tx_url = txUrl(config.contract, outcome.transaction_outcome.id);

  const failure = [outcome.status, ...outcome.receipts_outcome.map((r) => r.outcome.status)].find((s) => s?.Failure)?.Failure;
  const after = await view(config, config.budget);
  const attempt = after.attempts.length > before.attempts.length ? after.attempts[after.attempts.length - 1] : null;
  if (!attempt) {
    const why = failure ? (/panicked: ([^"\\]*)/.exec(JSON.stringify(failure))?.[1] ?? JSON.stringify(failure)) : 'no attempt was recorded';
    return { status: 'rejected', meaning: `The contract rejected the call and recorded nothing: ${why}. No money moved.`, left_near: toNear(after.balance), tx_url };
  }
  return {
    status: attempt.outcome === 'Paid' ? 'paid' : attempt.outcome === 'Refused' ? 'refused' : 'not_sent',
    meaning: MEANING[attempt.outcome],
    reason: attempt.reason,
    payee: attempt.payee,
    amount_near: toNear(attempt.amount),
    left_near: toNear(after.balance),
    tx_url,
  };
}
