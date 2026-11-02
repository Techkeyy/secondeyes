import { Account, actions, teraToGas } from 'near-api-js';
import { CONTRACT_ID, EXPLORER } from './config';
import { outcomeFailure, provider, successValue, txHash } from './near';
import { parseNear } from './units';
import type { InvoiceRead, JudgeAnswer, Mandate } from './types';

export type AgentStep =
  | { kind: 'read'; path: string; pageText: string }
  | { kind: 'concluded'; payee: string; amountNear: string; purpose: string }
  | { kind: 'judge'; answer: string }
  | { kind: 'result'; text: string; ok: boolean; txUrl?: string };

export const txUrl = (hash: string) => `${EXPLORER}/txns/${hash}`;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

/**
 * The demo agent, running in this browser with the mandate's agent key:
 * read the invoice page, work out the payment, ask the judge, call `pay`.
 */
export async function runDemoAgent(m: Mandate, secret: string, path: string, emit: (s: AgentStep) => void): Promise<void> {
  const read = await post<InvoiceRead>('/api/agent-read', { path });
  emit({ kind: 'read', path, pageText: read.page_text });
  emit({ kind: 'concluded', payee: read.payee, amountNear: read.amount_near, purpose: read.purpose });

  const amount = parseNear(read.amount_near)!.toString();
  const answer = await post<JudgeAnswer>('/api/judge', { mandate_id: m.id, payee: read.payee, amount, purpose: read.purpose });
  const body = JSON.parse(atob(answer.response_b64)) as { choices?: { message?: { content?: string } }[] };
  emit({ kind: 'judge', answer: body.choices?.[0]?.message?.content?.trim() ?? '(no answer)' });

  const agent = new Account(CONTRACT_ID, provider, secret as `ed25519:${string}`);
  const outcome = await agent.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    actions: [
      actions.functionCall(
        'pay',
        { mandate_id: m.id, payee: read.payee, amount, purpose: read.purpose, ...answer },
        teraToGas('30'),
        0n,
      ),
    ],
    waitUntil: 'FINAL',
    throwOnFailure: false,
  });
  const hash = txHash(outcome);
  const failure = outcomeFailure(outcome);
  if (failure) {
    emit({ kind: 'result', ok: false, text: `The contract rejected the call and recorded nothing: ${failure}`, txUrl: hash && txUrl(hash) });
  } else {
    // A refusal is a successful transaction. The return value says what happened.
    emit({ kind: 'result', ok: true, text: String(successValue(outcome)), txUrl: hash && txUrl(hash) });
  }
}
