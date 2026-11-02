// Proves the agent tool the way a user meets it: a standard MCP client installs it from the site's own URL,
// then pays through the real judge on testnet. Run with the site up:
//
//   node testnet/agent-tool-check.mjs --site http://localhost:3100
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { Account, JsonRpcProvider, KeyPair, actions, nearToYocto, teraToGas } from 'near-api-js';
import { Client } from '../agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../agent/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { DEFAULT_RPC, loadCredentials } from './check.mjs';

const { values: v } = parseArgs({
  options: {
    site: { type: 'string', default: 'http://localhost:3100' },
    contract: { type: 'string', default: 'secondeyes-dev.testnet' },
    owner: { type: 'string', default: 'secondeyes-owner.testnet' },
    scam: { type: 'string', default: 'acme-supplies-payments.testnet' },
  },
});

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
};

const provider = new JsonRpcProvider({ url: DEFAULT_RPC });
const owner = new Account(v.owner, provider, loadCredentials(v.owner).privateKey);
const ownerCall = async (method, args, deposit) => {
  const tx = await owner.signAndSendTransaction({ receiverId: v.contract, actions: [actions.functionCall(method, args, teraToGas('50'), deposit)], waitUntil: 'FINAL', throwOnFailure: false });
  return JSON.parse(Buffer.from(tx.status.SuccessValue ?? '', 'base64').toString() || 'null');
};

// A fresh budget with a fresh agent key, created by the owner as the site would.
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
  nearToYocto('0.7'), // 0.5 for the budget, plus the 0.2 setup fee
);
console.log(`budget ${budget} created`);

const env = {
  ...process.env,
  AGENT_KEY: secret,
  SECONDEYES_BUDGET: String(budget),
  SECONDEYES_SITE: v.site,
  SECONDEYES_CONTRACT: v.contract,
  SECONDEYES_RPC: DEFAULT_RPC,
};
const tarball = new URL('/secondeyes-agent.tgz', v.site).href;
const seen = [];
const transport = new StdioClientTransport({ command: 'npx', args: ['-y', tarball], env, stderr: 'pipe' });
transport.stderr?.on('data', (d) => seen.push(String(d)));
const client = new Client({ name: 'agent-tool-check', version: '1.0.0' });

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const body = r.content[0].text;
  seen.push(body);
  return { isError: !!r.isError, body, json: r.isError ? null : JSON.parse(body) };
};
const pay = (payee, amount_near = '0.1', purpose = 'Invoice AC-1042, monthly design licence') => call('secondeyes_pay', { payee, amount_near, purpose });

try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  seen.push(JSON.stringify(tools));
  check('installs from the site and lists both tools', tools.map((t) => t.name).sort().join() === 'secondeyes_budget,secondeyes_pay', tools.map((t) => t.name).join(', '));

  const before = await call('secondeyes_budget');
  check('reads the budget', before.json?.left_near === '0.5' && before.json?.state === 'open', `${before.json?.left_near} NEAR left`);

  const scam = await pay(v.scam);
  check('scam account is refused', scam.json?.status === 'refused', `${scam.json?.status} ${scam.json?.tx_url ?? scam.body}`);
  check('refusal keeps the money', scam.json?.left_near === '0.5', `${scam.json?.left_near} NEAR left`);

  const honest = await pay(v.owner);
  check('honest payment is paid', honest.json?.status === 'paid', `${honest.json?.status} ${honest.json?.tx_url ?? honest.body}`);
  check('payment moves the money', honest.json?.left_near === '0.4', `${honest.json?.left_near} NEAR left`);

  const repeat = await pay(v.owner);
  check('same payment again is refused', repeat.json?.status === 'refused', `${repeat.json?.status} ${repeat.json?.tx_url ?? repeat.body}`);

  const big = await pay(v.owner, '0.2', 'Invoice AC-1042');
  check('over the limit is refused', big.json?.status === 'refused' && big.json?.reason?.startsWith('limit:'), big.json?.reason ?? big.body);

  const bad = await pay(v.owner, 'all of it');
  check('a bad amount is an error, not a payment', bad.isError, bad.body);

  const after = await call('secondeyes_budget');
  check('the record shows all four attempts', after.json?.attempts?.length === 4, after.json?.attempts?.map((a) => a.outcome).join(', '));
} finally {
  await client.close();
}

// Agents without MCP use the same tool from the command line.
const cli = spawnSync(`npx -y ${tarball} budget`, { shell: true, env, encoding: 'utf8' });
seen.push(cli.stdout, cli.stderr);
check('works from the command line', cli.status === 0 && JSON.parse(cli.stdout || '{}').budget === budget, `exit ${cli.status}`);

const noKey = spawnSync(`npx -y ${tarball} budget`, { shell: true, env: { ...env, AGENT_KEY: '' }, encoding: 'utf8' });
check('missing key gives a plain message', noKey.status === 2 && noKey.stderr.includes('AGENT_KEY'), noKey.stderr.trim().split('\n').pop());

check('the key never appears in anything the tool outputs', !seen.join('\n').includes(secret));

await ownerCall('close', { mandate_id: budget }, 1n);
console.log(`budget ${budget} closed`);
console.log(failures ? `RESULT: ${failures} failed` : 'RESULT: all checks passed');
process.exit(failures ? 1 : 0);
