// Owner sets the contract's judge to the synthetic dev key from .env.local. Dev contract only.
//   node --env-file=.env.local scripts/set-judge.mjs <owner-account>
// Reads the owner key from ~/.near-credentials/testnet/. Prints no secrets.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Account, JsonRpcProvider, actions, teraToGas } from 'near-api-js';

const owner = process.argv[2];
const contract = process.env.NEXT_PUBLIC_CONTRACT_ID;
const model = process.env.JUDGE_MODEL ?? 'z-ai/glm-5.3-flash';
if (!owner || !process.env.JUDGE_DEV_KEY) throw new Error('usage: node --env-file=.env.local scripts/set-judge.mjs <owner-account> (needs JUDGE_DEV_KEY)');

const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(process.env.JUDGE_DEV_KEY, 'hex')]);
const pub = crypto.createPublicKey(crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })).export({ type: 'spki', format: 'der' }).subarray(-32);
const publicKeyHex = Buffer.from(pub).toString('hex');

const creds = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.near-credentials', 'testnet', `${owner}.json`), 'utf8'));
const provider = new JsonRpcProvider({ url: process.env.NEXT_PUBLIC_RPC_URL || 'https://test.rpc.fastnear.com' });
const account = new Account(owner, provider, creds.private_key);
const res = await account.signAndSendTransaction({
  receiverId: contract,
  actions: [actions.functionCall('set_judge', { model_id: model, public_key_hex: publicKeyHex }, teraToGas('30'), 0n)],
  waitUntil: 'FINAL',
  throwOnFailure: false,
});
console.log('set_judge status:', Object.keys(res.status)[0], 'tx', res.transaction_outcome.id);
const j = await provider.callFunction({ contractId: contract, method: 'get_judge', args: {} });
console.log('get_judge:', j.model_id, j.public_key_hex, j.public_key_hex === publicKeyHex ? '(matches dev key)' : '(DOES NOT MATCH)');
