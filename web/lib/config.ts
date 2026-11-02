// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them in the browser bundle.
export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? 'secondeyes-dev.testnet';
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  (NETWORK === 'testnet' ? 'https://test.rpc.fastnear.com' : 'https://free.rpc.fastnear.com');
export const EXPLORER = NETWORK === 'testnet' ? 'https://testnet.nearblocks.io' : 'https://nearblocks.io';
export const PAYEE_ACME = process.env.NEXT_PUBLIC_PAYEE_ACME ?? 'secondeyes-owner.testnet';
export const PAYEE_ATTACKER = process.env.NEXT_PUBLIC_PAYEE_ATTACKER ?? 'acme-supplies-payments.testnet';

export const MAX_ATTEMPTS = 20;
export const MAX_INSTRUCTION_LEN = 500;
