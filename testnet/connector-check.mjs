// Checks the one-link connector on a real budget: a stock MCP client, the real judge, the deployed contract.
//
//   node testnet/connector-check.mjs --site https://secondeyes-j5ey.onrender.com
//
// Needs the owner account's key in ~/.near-credentials/testnet/. The agent key is never printed.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Account, JsonRpcProvider, KeyPair, actions, nearToYocto, teraToGas } from 'near-api-js';
import { DEFAULT_RPC, loadCredentials } from './check.mjs';

const require = createRequire(new URL('../agent/package.json', import.meta.url));
const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')));
const { StreamableHTTPClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')));

const { values: v } = parseArgs({
  options: {
    site: { type: 'string' },
    contract: { type: 'string', default: 'secondeyes-dev.testnet' },
    owner: { type: 'string', default: 'secondeyes-owner.testnet' },
    scam: { type: 'string', default: 'acme-supplies-payments.testnet' },
  },
});
if (!v.site) throw new Error('Usage: node testnet/connector-check.mjs --site <url>');

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
};

const owner = new Account(v.owner, new JsonRpcProvider({ url: DEFAULT_RPC }), loadCredentials(v.owner).privateKey);
const ownerCall = async (method, args, deposit) => {
  const tx = await owner.signAndSendTransaction({ receiverId: v.contract, actions: [actions.functionCall(method, args, teraToGas('50'), deposit)], waitUntil: 'FINAL', throwOnFailure: false });
  return JSON.parse(Buffer.from(tx.status.SuccessValue ?? '', 'base64').toString() || 'null');
};

const key = KeyPair.fromRandom('ed25519');
const secret = key.toString();
const budget = await ownerCall(
  'create_mandate',
  {
    agent_public_key: key.getPublicKey().toString(),
    instruction: `Pay Acme invoice AC-1042, 0.1 NEAR, to ${v.owner}.`,
    max_per_payment: nearToYocto('0.1').toString(),
    max_total: nearToYocto('0.3').toString(),
    max_payments: 3,
    expires_at: (BigInt(Date.now() + 3_600_000) * 1_000_000n).toString(),
  },
  nearToYocto('0.5'),
);
console.log(`budget ${budget} created`);
const link = `${v.site}/mcp/${budget}-${secret.replace('ed25519:', '')}`;
const seen = [];

try {
  const client = new Client({ name: 'connector-check', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(link)));
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    seen.push(r.content[0].text);
    return r.isError ? { error: r.content[0].text } : JSON.parse(r.content[0].text);
  };
  const tools = (await client.listTools()).tools.map((t) => t.name).sort().join();
  check('a stock MCP client connects with only the link', tools === 'secondeyes_budget,secondeyes_pay', tools);

  const read = await call('secondeyes_budget');
  check('reads the budget', read.left_near === '0.3' && read.state === 'open', `${read.left_near} NEAR left`);

  const scam = await call('secondeyes_pay', { payee: v.scam, amount_near: '0.1', purpose: 'Invoice AC-1042, new payment account' });
  check('scam account is refused', scam.status === 'refused', scam.tx_url ?? scam.error);
  check('refusal keeps the money', scam.left_near === '0.3');

  const paid = await call('secondeyes_pay', { payee: v.owner, amount_near: '0.1', purpose: 'Invoice AC-1042, monthly design licence' });
  check('honest payment is paid', paid.status === 'paid', paid.tx_url ?? paid.error);
  check('payment moves the money', paid.left_near === '0.2');

  const again = await call('secondeyes_pay', { payee: v.owner, amount_near: '0.1', purpose: 'Invoice AC-1042, monthly design licence' });
  check('same payment again is refused', again.status === 'refused', again.tx_url ?? again.error);

  const bad = await call('secondeyes_pay', { payee: v.owner, amount_near: 'all of it', purpose: 'x' });
  check('a bad amount is an error, not a payment', !!bad.error, bad.error);
  await client.close();

  const wrongKey = KeyPair.fromRandom('ed25519').toString().replace('ed25519:', '');
  const wrong = await fetch(`${v.site}/mcp/${budget}-${wrongKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check('a link with the wrong key is not found', wrong.status === 404, String(wrong.status));
  check('the key never appears in anything the tool returns', !seen.join('\n').includes(secret.replace('ed25519:', '')));
} finally {
  await ownerCall('close', { mandate_id: budget }, 1n);
  console.log(`budget ${budget} closed`);
}

const closed = new Client({ name: 'connector-check', version: '1.0.0' });
await closed.connect(new StreamableHTTPClientTransport(new URL(link)));
const after = await closed.callTool({ name: 'secondeyes_pay', arguments: { payee: v.owner, amount_near: '0.1', purpose: 'x' } });
check('closing the budget kills the link', !!after.isError, after.content[0].text);
await closed.close();

console.log(failures ? `RESULT: ${failures} failed` : 'RESULT: all checks passed');
process.exit(failures ? 1 : 0);
