import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { baseEncode, KeyPair, type JsonRpcProvider, type SignedTransaction } from 'near-api-js';
import { callThroughNightly, type NightlyNear } from './nightly';

const pair = KeyPair.fromRandom('ed25519');
const keyData = pair.getPublicKey().data;

function setup(signature: 'good' | 'none') {
  const sent: SignedTransaction[] = [];
  const signTransaction = vi.fn(async (tx: { encode: () => Uint8Array }) => {
    if (signature === 'none') return {};
    const hash = createHash('sha256').update(tx.encode()).digest();
    // Crossing the extension boundary can turn bytes into a plain object.
    return { signature: { data: { ...pair.sign(hash).signature } } };
  });
  const nightly = { account: { accountId: 'me.testnet', publicKey: { data: keyData } }, signTransaction } as unknown as NightlyNear;
  const rpc = {
    viewAccessKey: async () => ({ nonce: 41n }),
    viewBlock: async () => ({ header: { hash: baseEncode(new Uint8Array(32).fill(7)) } }),
    sendTransactionUntil: async (tx: SignedTransaction) => {
      sent.push(tx);
      return { status: { SuccessValue: '' } };
    },
  } as unknown as JsonRpcProvider;
  return { nightly, rpc, sent, signTransaction };
}

describe('callThroughNightly', () => {
  it('asks only for a signature, then sends a transaction the chain can verify', async () => {
    const { nightly, rpc, sent, signTransaction } = setup('good');
    await callThroughNightly(nightly, rpc, 'contract.testnet', 'close', { mandate_id: 1 }, 1n, 30);

    expect(signTransaction.mock.calls[0]).toHaveLength(1); // no "send it yourself" flag
    const { transaction, signature } = sent[0];
    expect(transaction.signerId).toBe('me.testnet');
    expect(transaction.receiverId).toBe('contract.testnet');
    expect(transaction.nonce).toBe(42n);
    const hash = createHash('sha256').update(transaction.encode()).digest();
    expect(pair.getPublicKey().verify(hash, signature.data)).toBe(true);
  });

  it('sends nothing when no signature comes back', async () => {
    const { nightly, rpc, sent } = setup('none');
    await expect(callThroughNightly(nightly, rpc, 'contract.testnet', 'close', {}, 1n, 30)).rejects.toThrow('Nothing was sent');
    expect(sent).toHaveLength(0);
  });
});
