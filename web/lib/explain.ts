import type { Attempt } from './types';

/** A plain sentence for one history row. Limit reasons from the contract are shown as they are. */
export function explainAttempt(a: Attempt): string {
  if (a.outcome === 'Paid') return 'The judge answered ALLOW and the contract sent the payment.';
  if (a.outcome === 'PayoutFailed') {
    return `The judge allowed it but the transfer failed (${a.reason}). The money is back in the budget.`;
  }
  if (a.reason.startsWith('limit:')) return `Stopped before the judge was asked. ${a.reason}`;
  if (a.reason === 'BLOCK') {
    return 'The judge answered BLOCK: it did not find this payment clearly asked for in your instruction. The money stayed in the budget.';
  }
  if (a.reason.startsWith('judge response had no')) return `The money stayed in the budget. ${a.reason}`;
  return `The judge did not answer exactly ALLOW (it said: ${a.reason}). Only an exact ALLOW pays, so the money stayed in the budget.`;
}
