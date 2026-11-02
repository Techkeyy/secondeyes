export type Outcome = 'Paid' | 'Refused' | 'PayoutFailed';

export interface Attempt {
  nonce: number;
  payee: string;
  amount: string;
  purpose: string;
  outcome: Outcome;
  reason: string;
  timestamp: string;
}

export interface Mandate {
  id: number;
  owner: string;
  agent_public_key: string;
  instruction: string;
  max_per_payment: string;
  max_total: string;
  max_payments: number;
  expires_at: string;
  balance: string;
  spent: string;
  payments_made: number;
  nonce: number;
  closed: boolean;
  attempts: Attempt[];
  judge: { model_id: string; public_key_hex: string };
}

export interface InvoiceRead {
  payee: string;
  amount_near: string;
  purpose: string;
  page_text: string;
}

export interface JudgeAnswer {
  response_b64: string;
  signature_hex: string;
}
