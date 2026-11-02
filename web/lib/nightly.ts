import { actions, baseDecode, baseEncode, createTransaction, encodeTransaction, PublicKey, Signature, SignedTransaction, type JsonRpcProvider } from 'near-api-js';

const ANSWER_MS = 120_000;

type Bytes = ArrayLike<number> | Record<string, number>;
const toBytes = (b: Bytes) => Uint8Array.from(Object.values(b));

interface NightlyAccount {
  accountId: string;
  publicKey: { ed25519Key?: { data: Bytes }; data?: Bytes };
}

export interface NightlyNear {
  account: NightlyAccount | (() => Promise<NightlyAccount>);
  signTransaction(tx: Uint8Array & { encode: () => Uint8Array }, send?: boolean): Promise<{ signature?: { data?: Bytes } }>;
}

export const nightlyExtension = () => (window as unknown as { nightly?: { near?: NightlyNear } }).nightly?.near;

/**
 * Asked to send, Nightly's extension never finishes on testnet and nothing reaches the chain.
 * So it only signs here, and we send to our own RPC. A block hash ties the transaction to one network,
 * and a bad signature is rejected by the chain, so the worst case is an error with no money moved.
 */
export async function callThroughNightly(nightly: NightlyNear, rpc: JsonRpcProvider, receiverId: string, method: string, args: Record<string, unknown>, deposit: bigint, tgas: number) {
  // The extension exposes this as a plain value, not a method.
  const { accountId, publicKey } = typeof nightly.account === 'function' ? await nightly.account() : nightly.account;
  const keyData = publicKey.ed25519Key?.data ?? publicKey.data;
  if (!accountId || !keyData) throw new Error('Nightly did not share an account');
  const key = PublicKey.fromString(`ed25519:${baseEncode(toBytes(keyData))}`);

  const [access, block] = await Promise.all([rpc.viewAccessKey({ accountId, publicKey: key }), rpc.viewBlock({ finality: 'final' })]);
  const transaction = createTransaction(accountId, key, receiverId, access.nonce + 1n, [actions.functionCall(method, args, BigInt(tgas) * 10n ** 12n, deposit)], baseDecode(block.header.hash));

  // The extension calls encode() on whatever it is given.
  const bytes = encodeTransaction(transaction);
  const signed = await Promise.race([
    nightly.signTransaction(Object.assign(bytes, { encode: () => bytes })),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Nightly did not answer. Nothing was sent.')), ANSWER_MS)),
  ]);
  if (!signed?.signature?.data) throw new Error('Nightly did not return a signature. Nothing was sent.');

  const signature = new Signature({ keyType: key.keyType, data: toBytes(signed.signature.data) });
  return rpc.sendTransactionUntil(new SignedTransaction({ transaction, signature }), 'FINAL');
}
