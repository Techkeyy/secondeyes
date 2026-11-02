import { JsonRpcProvider } from 'near-api-js';
import { CONTRACT_ID, RPC_URL } from './config';
import type { Mandate } from './types';

export const provider = new JsonRpcProvider({ url: RPC_URL });

export function view<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  return provider.callFunction({ contractId: CONTRACT_ID, method, args }) as Promise<T>;
}

export const getMandate = (id: number) => view<Mandate | null>('get_mandate', { id });
export const getSetupFee = () => view<string>('get_setup_fee');

export async function mandatesByOwner(owner: string): Promise<Mandate[]> {
  const all: Mandate[] = [];
  for (let from = 0; ; from += 50) {
    const page = await view<Mandate[]>('get_mandates_by_owner', { owner, from, limit: 50 });
    all.push(...page);
    if (page.length < 50) return all;
  }
}

/** The contract's own message when a call panicked, else the raw message. */
export function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  // Transactions say "Smart contract panicked: <msg>"; view calls say GuestPanic { panic_msg: "<msg>" }.
  const m = /panicked: ([^"\\]*)/.exec(raw) ?? /panic_msg: \\?"([^"\\]*)/.exec(raw);
  return m ? m[1].trim() : raw;
}

/** Looks for a failed receipt anywhere in a transaction outcome. */
export function outcomeFailure(outcome: unknown): string | null {
  const o = outcome as {
    status?: { Failure?: unknown };
    receipts_outcome?: { outcome?: { status?: { Failure?: unknown } } }[];
  };
  const failure = o.status?.Failure ?? o.receipts_outcome?.find((r) => r.outcome?.status?.Failure)?.outcome?.status?.Failure;
  if (!failure) return null;
  return errorText(JSON.stringify(failure));
}

/** The JSON value a successful transaction returned, if any. */
export function successValue(outcome: unknown): unknown {
  const status = (outcome as { status?: { SuccessValue?: string } }).status;
  if (!status?.SuccessValue) return undefined;
  const text = atob(status.SuccessValue);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function txHash(outcome: unknown): string | undefined {
  return (outcome as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } }).transaction?.hash ??
    (outcome as { transaction_outcome?: { id?: string } }).transaction_outcome?.id;
}
