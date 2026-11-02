// A small real agent: asks the SecondEyes judge about one payment, then calls `pay` with the agent key.
//
//   AGENT_KEY=ed25519:... node agent/run.mjs --mandate 7 --payee acme.testnet --amount 0.1 \
//       --purpose "Acme invoice AC-1042" --judge https://your-site.example
//
// The key is read from AGENT_KEY (preferred) or --key. It is only used to sign `pay` here and is never sent to the site.
import { parseArgs } from 'node:util';
import { Account, JsonRpcProvider, actions, teraToGas } from 'near-api-js';

const { values: v } = parseArgs({
  options: {
    mandate: { type: 'string' },
    key: { type: 'string' },
    payee: { type: 'string' },
    amount: { type: 'string' }, // in NEAR, for example 0.1
    purpose: { type: 'string', default: '' },
    judge: { type: 'string' }, // base URL of the SecondEyes site
    contract: { type: 'string', default: process.env.CONTRACT_ID ?? 'secondeyes-dev.testnet' },
    rpc: { type: 'string', default: process.env.RPC_URL ?? 'https://test.rpc.fastnear.com' },
  },
});

const key = process.env.AGENT_KEY ?? v.key;
if (!key || !v.mandate || !v.payee || !v.amount || !v.judge) {
  console.error('usage: AGENT_KEY=ed25519:... node agent/run.mjs --mandate <id> --payee <account> --amount <NEAR> [--purpose <text>] --judge <site url>');
  process.exit(2);
}

const m = /^(\d+)(?:\.(\d{1,24}))?$/.exec(v.amount);
if (!m) throw new Error(`--amount must be a plain decimal number of NEAR, got "${v.amount}"`);
const amount = (BigInt(m[1]) * 10n ** 24n + BigInt((m[2] ?? '').padEnd(24, '0') || '0')).toString();
const mandateId = Number(v.mandate);

// 1. Ask the judge. The site builds the question from the contract; we only name the payment.
const res = await fetch(new URL('/api/judge', v.judge), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mandate_id: mandateId, payee: v.payee, amount, purpose: v.purpose }),
});
const judged = await res.json();
if (!res.ok) throw new Error(`judge: ${judged.error ?? res.status}`);
const answer = JSON.parse(Buffer.from(judged.response_b64, 'base64').toString('utf8')).choices?.[0]?.message?.content;
console.log(`judge answered: ${String(answer).trim()}`);

// 2. Call pay as the agent key.
const provider = new JsonRpcProvider({ url: v.rpc });
const agent = new Account(v.contract, provider, key);
const outcome = await agent.signAndSendTransaction({
  receiverId: v.contract,
  actions: [
    actions.functionCall(
      'pay',
      { mandate_id: mandateId, payee: v.payee, amount, purpose: v.purpose, response_b64: judged.response_b64, signature_hex: judged.signature_hex },
      teraToGas('30'),
      0n,
    ),
  ],
  waitUntil: 'FINAL',
  throwOnFailure: false,
});

const failure = [outcome.status, ...outcome.receipts_outcome.map((r) => r.outcome.status)].find((s) => s?.Failure)?.Failure;
console.log(`transaction: ${outcome.transaction_outcome.id}`);
if (failure) {
  const msg = /panicked: ([^"\\]*)/.exec(JSON.stringify(failure))?.[1] ?? JSON.stringify(failure);
  console.error(`rejected by the contract, nothing recorded: ${msg}`);
  process.exit(1);
}
// A refusal is a successful transaction; the return value says what happened.
const value = outcome.status.SuccessValue ? JSON.parse(Buffer.from(outcome.status.SuccessValue, 'base64').toString('utf8')) : '';
console.log(`result: ${value}`);
