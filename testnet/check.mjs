// SecondEyes real-VM check on NEAR testnet.
//
//   node testnet/check.mjs --dev <account> --owner <account> [--rpc <url>] [--redeploy] [--pay-gas <TGas>]
//   node testnet/check.mjs --rpc-check [--rpc <url>]        (read-only RPC probe, needs no credentials)
//
// Keys are read from ~/.near-credentials/testnet/<account>.json (near-cli legacy format, `private_key`).
// The judge key is SYNTHETIC (generated here), so this proves the contract's use of the VM
// (ed25519_verify, signer_account_pk, callbacks, gas, access-key limits), NOT the real NEAR AI signer.
// Private keys are never printed or written to the results file.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Account, JsonRpcProvider, KeyPair, actions, nearToYocto, teraToGas } from 'near-api-js';

export const DEFAULT_RPC = 'https://test.rpc.fastnear.com';
export const JUDGE_MODEL = 'z-ai/glm-5.3-flash';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WASM_PATH = path.resolve(HERE, '../contract/target/wasm32-unknown-unknown/release/secondeyes.wasm');
const NO_CODE_HASH = '11111111111111111111111111111111';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

// ---------------------------------------------------------------------------------------------
// Pure helpers (tested in check.test.mjs)
// ---------------------------------------------------------------------------------------------

export function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** The exact text the contract verifies: `{model}:{sha256hex(request)}:{sha256hex(response)}`. */
export function signedText(model, request, responseBytes) {
  return `${model}:${sha256Hex(Buffer.from(request, 'utf8'))}:${sha256Hex(responseBytes)}`;
}

/** SYNTHETIC judge: a fresh ed25519 key made here. Never the real NEAR AI signer. */
export function makeSyntheticJudge() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  return { privateKey, publicKeyHex: Buffer.from(raw).toString('hex'), label: 'SYNTHETIC' };
}

export function publicKeyFromHex(hex) {
  return crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(hex, 'hex')]),
    format: 'der',
    type: 'spki',
  });
}

/** Returns the two `pay` arguments: base64 of the response bytes and the hex signature. */
export function judgeSign(privateKey, model, request, responseText) {
  const responseBytes = Buffer.from(responseText, 'utf8');
  const sig = crypto.sign(null, Buffer.from(signedText(model, request, responseBytes), 'utf8'), privateKey);
  return { response_b64: responseBytes.toString('base64'), signature_hex: sig.toString('hex') };
}

export function judgeResponse(content) {
  return JSON.stringify({ choices: [{ message: { content } }] });
}

export function credentialsPath(account, home = os.homedir()) {
  return path.join(home, '.near-credentials', 'testnet', `${account}.json`);
}

/** Parses a near-cli legacy credentials file. Throws with a clear message. Returns the secret. */
export function parseCredentials(text, account, file = '<credentials>') {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`${file}: not valid JSON`);
  }
  const privateKey = j.private_key ?? j.secret_key;
  if (typeof privateKey !== 'string' || !privateKey.startsWith('ed25519:')) {
    throw new Error(`${file}: missing an "ed25519:..." private_key field`);
  }
  if (j.account_id && j.account_id !== account) {
    throw new Error(`${file}: account_id is ${j.account_id}, expected ${account}`);
  }
  const derived = KeyPair.fromString(privateKey).getPublicKey().toString();
  if (j.public_key && j.public_key !== derived) {
    throw new Error(`${file}: public_key does not match private_key`);
  }
  return { accountId: account, privateKey, publicKey: derived };
}

export function loadCredentials(account) {
  const file = credentialsPath(account);
  if (!fs.existsSync(file)) {
    throw new Error(`credentials file missing: ${file}`);
  }
  return parseCredentials(fs.readFileSync(file, 'utf8'), account, file);
}

/** Sum of gas_burnt over the transaction outcome and every receipt outcome. */
export function gasBurntTotal(res) {
  let total = BigInt(res?.transaction_outcome?.outcome?.gas_burnt ?? 0);
  for (const r of res?.receipts_outcome ?? []) total += BigInt(r.outcome?.gas_burnt ?? 0);
  return total;
}

export function decodeSuccessValue(status) {
  const sv = status && typeof status === 'object' ? status.SuccessValue : undefined;
  if (sv === undefined) return undefined;
  const text = Buffer.from(sv, 'base64').toString('utf8');
  if (text === '') return '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function parseArgs(argv) {
  const out = { rpc: DEFAULT_RPC, redeploy: false, rpcCheck: false, payGas: 60 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--dev') out.dev = val();
    else if (a === '--owner') out.owner = val();
    else if (a === '--rpc') out.rpc = val();
    else if (a === '--pay-gas') out.payGas = Number(val());
    else if (a === '--redeploy') out.redeploy = true;
    else if (a === '--rpc-check') out.rpcCheck = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!Number.isFinite(out.payGas) || out.payGas <= 0 || out.payGas > 300) throw new Error('--pay-gas must be 1..300 (TGas)');
  return out;
}

export const fmtNear = (yocto) => {
  const y = BigInt(yocto);
  const neg = y < 0n;
  const a = neg ? -y : y;
  const whole = a / 10n ** 24n;
  const frac = (a % 10n ** 24n).toString().padStart(24, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
};
const tgas = (g) => (Number(g) / 1e12).toFixed(2);
const jsonSafe = (_, v) => (typeof v === 'bigint' ? v.toString() : v);

// ---------------------------------------------------------------------------------------------
// Transaction plumbing
// ---------------------------------------------------------------------------------------------

function describeError(e) {
  const o = { name: e?.name, type: e?.type, message: String(e?.message ?? e).slice(0, 1500) };
  for (const k of ['cause', 'data', 'context']) {
    if (e?.[k] !== undefined) {
      try {
        o[k] = JSON.parse(JSON.stringify(e[k], jsonSafe));
      } catch {
        o[k] = String(e[k]);
      }
    }
  }
  return o;
}

/** Every Failure found in the outcome (top level and any receipt). */
function failuresOf(res) {
  const f = [];
  if (res?.status?.Failure) f.push(res.status.Failure);
  for (const r of res?.receipts_outcome ?? []) {
    if (r.outcome?.status?.Failure) f.push({ executor: r.outcome.executor_id, failure: r.outcome.status.Failure });
  }
  return f;
}

const failureText = (res) => JSON.stringify(failuresOf(res), jsonSafe);

/** Gas of the receipt that executed `on_payout` (it returns the string "Paid" or "PayoutFailed"). */
function onPayoutGas(res) {
  for (const r of res?.receipts_outcome ?? []) {
    const v = decodeSuccessValue(r.outcome?.status);
    if (v === 'Paid' || v === 'PayoutFailed') return BigInt(r.outcome.gas_burnt);
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = new JsonRpcProvider({ url: args.rpc });

  if (args.rpcCheck) {
    const st = await provider.viewNodeStatus();
    const blk = await provider.viewBlock({ finality: 'final' });
    console.log(JSON.stringify({ rpc: args.rpc, chain_id: st.chain_id, version: st.version?.version, protocol_version: st.protocol_version, final_height: blk.header.height }, jsonSafe, 2));
    return 0;
  }

  if (!args.dev || !args.owner) throw new Error('usage: node testnet/check.mjs --dev <account> --owner <account> [--rpc url] [--redeploy] [--pay-gas TGas]');
  if (!fs.existsSync(WASM_PATH)) throw new Error(`wasm missing: ${WASM_PATH} (build from contract/: AWS_LC_SYS_PREBUILT_NASM=1 cargo build --release --target wasm32-unknown-unknown)`);
  const missing = [args.dev, args.owner].map((a) => credentialsPath(a)).filter((f) => !fs.existsSync(f));
  if (missing.length) throw new Error(`credentials file missing: ${missing.join(', ')}`);

  const dev = args.dev;
  const owner = args.owner;
  const devCreds = loadCredentials(dev);
  const ownerCreds = loadCredentials(owner);
  const devAcc = new Account(dev, provider, devCreds.privateKey);
  const ownerAcc = new Account(owner, provider, ownerCreds.privateKey);
  const wasm = fs.readFileSync(WASM_PATH);

  const chain = (await provider.viewNodeStatus()).chain_id;
  if (chain !== 'testnet') throw new Error(`RPC ${args.rpc} reports chain_id ${chain}, expected testnet`);

  const PAY_GAS = teraToGas(String(args.payGas));
  const LIMIT_GAS = teraToGas('30'); // refusals that stop at the limit checks
  const ONE_NEAR = nearToYocto('1');
  const PER_PAYMENT = nearToYocto('0.1');
  const TOTAL = nearToYocto('0.3');
  const OVER_LIMIT = nearToYocto('0.2');

  const results = [];
  const meta = {
    started: new Date().toISOString(),
    rpc: args.rpc,
    dev,
    owner,
    wasm_bytes: wasm.length,
    wasm_sha256: sha256Hex(wasm),
    judge_model: JUDGE_MODEL,
    judge_key: 'SYNTHETIC (generated by this script, not the real NEAR AI signer)',
    pay_gas_tgas: args.payGas,
  };
  const judge = makeSyntheticJudge();
  meta.judge_public_key_hex = judge.publicKeyHex;

  let n = 0;
  async function step(name, fn) {
    const rec = { step: ++n, name, pass: false, checks: [], txs: [], gas_burnt: '0', notes: {}, error: null };
    const ctx = {
      note: (k, v) => (rec.notes[k] = v),
      check: (label, ok, detail) => rec.checks.push({ label, ok: !!ok, detail: detail === undefined ? undefined : detail }),
      /** Sign and send; returns a summary. Protocol rejections (RPC errors) are thrown. */
      send: async (account, receiver, acts, label) => {
        const res = await account.signAndSendTransaction({ receiverId: receiver, actions: acts, waitUntil: 'FINAL', throwOnFailure: false });
        const gas = gasBurntTotal(res);
        rec.gas_burnt = (BigInt(rec.gas_burnt) + gas).toString();
        const hash = res.transaction_outcome?.id;
        rec.txs.push({ label, hash, gas_burnt: gas.toString(), status: res.status && typeof res.status === 'object' ? Object.keys(res.status)[0] : String(res.status) });
        return { res, hash, gas, ok: !res.status?.Failure, value: decodeSuccessValue(res.status), failure: failureText(res) };
      },
    };
    try {
      await fn(ctx, rec);
      rec.pass = rec.checks.length > 0 && rec.checks.every((c) => c.ok);
    } catch (e) {
      rec.error = describeError(e);
      rec.pass = false;
    }
    results.push(rec);
    const bad = rec.checks.filter((c) => !c.ok).map((c) => c.label);
    console.log(`[${rec.step}] ${rec.pass ? 'pass' : 'FAIL'}  ${name}  gas=${tgas(rec.gas_burnt)}T${rec.txs[0] ? '  tx=' + rec.txs[0].hash : ''}${bad.length ? '  failed checks: ' + bad.join('; ') : ''}${rec.error ? '  error: ' + rec.error.message.slice(0, 200) : ''}`);
    return rec;
  }

  const view = (method, a = {}) => provider.callFunction({ contractId: dev, method, args: a });
  const balanceOf = async (id) => BigInt((await provider.viewAccount({ accountId: id })).amount);
  const getMandate = async (id) => view('get_mandate', { id });
  const keyInfo = async (pk) => {
    const list = await provider.viewAccessKeyList({ accountId: dev });
    return list.keys.find((k) => k.public_key === pk);
  };
  const allowanceOf = async (pk) => {
    const k = await provider.viewAccessKey({ accountId: dev, publicKey: pk }).catch(() => null);
    const fc = k?.permission?.FunctionCall;
    return fc && fc.allowance !== undefined && fc.allowance !== null ? BigInt(fc.allowance) : null;
  };
  const stopped = () => {
    console.log('Stopping: later steps depend on this one.');
  };

  console.log(`SecondEyes testnet check  dev=${dev} owner=${owner} rpc=${args.rpc}`);
  console.log(`judge key is SYNTHETIC; wasm ${wasm.length} bytes sha256 ${meta.wasm_sha256.slice(0, 16)}...`);
  try {
    const [d, o] = await Promise.all([balanceOf(dev), balanceOf(owner)]);
    meta.start_balances = { dev: d.toString(), owner: o.toString() };
    console.log(`balances: dev ${fmtNear(d)} NEAR (wasm storage alone needs about ${fmtNear(BigInt(wasm.length) * 10n ** 19n)}), owner ${fmtNear(o)} NEAR (needs about 2.6 + gas)`);
  } catch (e) {
    throw new Error(`cannot read balances (does the account exist on testnet?): ${e.message}`);
  }

  // ---- 1. deploy + new ---------------------------------------------------------------------
  let deployed = false;
  await step('deploy wasm + new({owner}) in one batch', async (ctx) => {
    const acct = await provider.viewAccount({ accountId: dev });
    const has = acct.code_hash !== NO_CODE_HASH;
    ctx.note('code_hash_before', acct.code_hash);
    if (has && !args.redeploy) {
      ctx.note('result', 'code already deployed; stopping without overwriting (pass --redeploy to override)');
      ctx.check('dev account has no code yet', false, acct.code_hash);
      return;
    }
    // On a redeploy the state persists, so `new` would panic. The state layout must not have changed.
    const acts = has ? [actions.deployContract(wasm)] : [actions.deployContract(wasm), actions.functionCall('new', { owner }, teraToGas('30'), 0n)];
    const r = await ctx.send(devAcc, dev, acts, has ? 'redeploy' : 'deploy+new');
    ctx.note('failure', r.ok ? undefined : r.failure);
    ctx.check('batch succeeded', r.ok, r.ok ? undefined : r.failure);
    if (r.ok) {
      const after = await provider.viewAccount({ accountId: dev });
      ctx.check('code hash changed from none/previous', after.code_hash !== acct.code_hash && after.code_hash !== NO_CODE_HASH, after.code_hash);
      ctx.check('get_owner returns owner', (await view('get_owner')) === owner);
      deployed = true;
    }
  });
  if (!deployed) {
    stopped();
    return finish(results, meta);
  }

  // ---- 2. set_judge ------------------------------------------------------------------------
  let judgeOk = false;
  await step('owner set_judge (SYNTHETIC key)', async (ctx) => {
    const r = await ctx.send(ownerAcc, dev, [actions.functionCall('set_judge', { model_id: JUDGE_MODEL, public_key_hex: judge.publicKeyHex }, teraToGas('30'), 0n)], 'set_judge');
    ctx.check('tx succeeded', r.ok, r.ok ? undefined : r.failure);
    const j = await view('get_judge');
    ctx.check('get_judge matches', j?.model_id === JUDGE_MODEL && j?.public_key_hex === judge.publicKeyHex, j);
    judgeOk = r.ok && j?.public_key_hex === judge.publicKeyHex;
  });
  if (!judgeOk) {
    stopped();
    return finish(results, meta);
  }

  const fee = BigInt(await view('get_setup_fee'));
  meta.setup_fee_yocto = fee.toString();

  async function createMandate(ctx, instruction, label) {
    const kp = KeyPair.fromRandom('ed25519');
    const pk = kp.getPublicKey().toString();
    const expires = BigInt(Date.now()) * 1_000_000n + 3_600n * 1_000_000_000n;
    const r = await ctx.send(
      ownerAcc,
      dev,
      [
        actions.functionCall(
          'create_mandate',
          { agent_public_key: pk, instruction, max_per_payment: PER_PAYMENT.toString(), max_total: TOTAL.toString(), max_payments: 5, expires_at: expires.toString() },
          teraToGas('50'),
          ONE_NEAR + fee,
        ),
      ],
      label,
    );
    ctx.check(`${label} succeeded`, r.ok, r.ok ? undefined : r.failure);
    const id = r.ok && typeof r.value === 'number' ? r.value : undefined;
    ctx.check('returned a mandate id', id !== undefined, r.value);
    return { id, kp, pk, agent: new Account(dev, provider, kp.toString()), expires, r };
  }

  /** The agent key signs `pay` on the dev account. mode: 'sign' builds request + signed response, 'empty' sends none. */
  async function agentPay(ctx, M, { payee, amount, purpose = '', content, mode = 'sign', gas = PAY_GAS, label }) {
    let req;
    let pa = { response_b64: '', signature_hex: '' };
    if (mode === 'sign') {
      req = await view('build_request', { mandate_id: M.id, payee, amount: amount.toString(), purpose });
      pa = judgeSign(judge.privateKey, JUDGE_MODEL, req, judgeResponse(content));
    }
    const r = await ctx.send(M.agent, dev, [actions.functionCall('pay', { mandate_id: M.id, payee, amount: amount.toString(), purpose, ...pa }, gas, 0n)], label);
    return { ...r, req, ...pa };
  }

  // ---- 3. create mandate A -----------------------------------------------------------------
  let A;
  const stateA = {};
  await step('owner create_mandate (1 NEAR + fee), agent key checks', async (ctx) => {
    A = await createMandate(ctx, 'Pay the owner 0.1 NEAR for invoice 42.', 'create_mandate A');
    if (A.id === undefined) return;
    ctx.note('mandate_id', A.id);
    ctx.note('agent_public_key', A.pk);
    ctx.note('expires_at_ns', A.expires.toString());
    const k = await keyInfo(A.pk);
    ctx.check('agent key present in view_access_key_list', !!k);
    const fc = k?.access_key?.permission?.FunctionCall;
    ctx.check('permission is FunctionCall only', !!fc && k.access_key.permission !== 'FullAccess', k?.access_key?.permission);
    ctx.check('receiver is dev', fc?.receiver_id === dev, fc?.receiver_id);
    ctx.check('methods are exactly ["pay"]', JSON.stringify(fc?.method_names) === '["pay"]', fc?.method_names);
    ctx.check('allowance present (limited)', fc?.allowance !== undefined && fc?.allowance !== null, fc?.allowance);
    ctx.note('allowance_yocto', fc?.allowance ?? null);
    ctx.note('allowance_near', fc?.allowance ? fmtNear(fc.allowance) : null);
    const m = await getMandate(A.id);
    ctx.check('mandate balance is 1 NEAR', m && BigInt(m.balance) === ONE_NEAR, m?.balance);
    ctx.check('mandate pinned judge', m?.judge?.model_id === JUDGE_MODEL && m?.judge?.public_key_hex === judge.publicKeyHex);
  });
  if (!A || A.id === undefined) {
    stopped();
    return finish(results, meta);
  }

  // ---- 4. ALLOW pays ----------------------------------------------------------------------
  await step('agent key pay: signed ALLOW pays the payee', async (ctx) => {
    const before = { payee: await balanceOf(owner), m: await getMandate(A.id), allowance: await allowanceOf(A.pk) };
    const r = await agentPay(ctx, A, { payee: owner, amount: PER_PAYMENT, purpose: 'invoice 42', content: 'ALLOW', label: 'pay ALLOW' });
    stateA.allow = r;
    ctx.note('prepaid_gas_tgas', args.payGas);
    ctx.note('return_value', r.value);
    ctx.check('tx succeeded (no receipt failed)', r.ok, r.ok ? undefined : r.failure);
    ctx.check('on_payout returned "Paid"', r.value === 'Paid', r.value);
    const after = { payee: await balanceOf(owner), m: await getMandate(A.id), allowance: await allowanceOf(A.pk) };
    ctx.check('payee balance rose by exactly the amount', after.payee - before.payee === PER_PAYMENT, (after.payee - before.payee).toString());
    ctx.check('mandate balance fell by the amount', BigInt(before.m.balance) - BigInt(after.m.balance) === PER_PAYMENT, [before.m.balance, after.m.balance]);
    ctx.check('spent rose, nonce advanced', BigInt(after.m.spent) === PER_PAYMENT && after.m.nonce === before.m.nonce + 1, [after.m.spent, after.m.nonce]);
    ctx.check('attempt recorded Paid', after.m.attempts.at(-1)?.outcome === 'Paid', after.m.attempts.at(-1));
    ctx.note('on_payout_gas', onPayoutGas(r.res)?.toString());
    ctx.note('allowance_change_yocto', before.allowance !== null && after.allowance !== null ? (after.allowance - before.allowance).toString() : null);
  });

  // ---- 5. BLOCK refuses -------------------------------------------------------------------
  await step('agent key pay: signed BLOCK is a recorded refusal', async (ctx) => {
    const before = { payee: await balanceOf(owner), m: await getMandate(A.id) };
    const r = await agentPay(ctx, A, { payee: owner, amount: PER_PAYMENT, purpose: 'invoice 42', content: 'BLOCK', label: 'pay BLOCK' });
    ctx.note('return_value', r.value);
    ctx.check('tx succeeded', r.ok, r.ok ? undefined : r.failure);
    const after = { payee: await balanceOf(owner), m: await getMandate(A.id) };
    ctx.check('attempt recorded Refused', after.m.attempts.at(-1)?.outcome === 'Refused', after.m.attempts.at(-1));
    ctx.check('payee balance unchanged', after.payee === before.payee);
    ctx.check('mandate balance unchanged', after.m.balance === before.m.balance);
    ctx.check('nonce advanced', after.m.nonce === before.m.nonce + 1);
  });

  // ---- 6. replay --------------------------------------------------------------------------
  await step('replay of step 4 response + signature fails', async (ctx) => {
    const m0 = await getMandate(A.id);
    const r = await ctx.send(A.agent, dev, [actions.functionCall('pay', { mandate_id: A.id, payee: owner, amount: PER_PAYMENT.toString(), purpose: 'invoice 42', response_b64: stateA.allow.response_b64, signature_hex: stateA.allow.signature_hex }, PAY_GAS, 0n)], 'pay replay');
    ctx.note('failure', r.failure);
    ctx.check('tx failed', !r.ok);
    ctx.check('error says "invalid judge signature"', r.failure.includes('invalid judge signature'), r.failure);
    const m1 = await getMandate(A.id);
    ctx.check('state unchanged', m1.balance === m0.balance && m1.nonce === m0.nonce && m1.attempts.length === m0.attempts.length);
  });

  // ---- 7. over-limit ----------------------------------------------------------------------
  await step('over-limit amount (0.2 NEAR), empty response/signature, recorded Refused', async (ctx) => {
    const before = await getMandate(A.id);
    const r = await agentPay(ctx, A, { payee: owner, amount: OVER_LIMIT, purpose: 'invoice 42', mode: 'empty', gas: LIMIT_GAS, label: 'pay over limit' });
    ctx.note('return_value', r.value);
    ctx.check('tx succeeded', r.ok, r.ok ? undefined : r.failure);
    const after = await getMandate(A.id);
    ctx.check('attempt recorded Refused', after.attempts.at(-1)?.outcome === 'Refused', after.attempts.at(-1));
    ctx.check('reason is the per-payment limit', String(after.attempts.at(-1)?.reason).includes('over max per payment'), after.attempts.at(-1)?.reason);
    ctx.check('balance unchanged', after.balance === before.balance);
  });

  // ---- 8. agent key abuse -----------------------------------------------------------------
  await step('agent key cannot Transfer or call close (protocol rejects)', async (ctx) => {
    const ownerBefore = await balanceOf(owner);
    const m0 = await getMandate(A.id);
    const attempt = async (label, acts, receiver) => {
      try {
        const r = await ctx.send(A.agent, receiver, acts, label);
        ctx.note(label, { accepted: true, failure: r.failure, ok: r.ok });
        ctx.check(`${label} did not succeed`, !r.ok, r.failure);
      } catch (e) {
        const d = describeError(e);
        ctx.note(label, { rejected: true, error: d });
        ctx.check(`${label} rejected`, true, d.message);
      }
    };
    await attempt('transfer 0.01 NEAR to owner', [actions.transfer(nearToYocto('0.01'))], owner);
    await attempt('function call close, 0 deposit', [actions.functionCall('close', { mandate_id: A.id }, LIMIT_GAS, 0n)], dev);
    await attempt('function call close, 1 yocto', [actions.functionCall('close', { mandate_id: A.id }, LIMIT_GAS, 1n)], dev);
    ctx.check('owner balance unchanged', (await balanceOf(owner)) === ownerBefore);
    const m1 = await getMandate(A.id);
    ctx.check('mandate untouched', m1.balance === m0.balance && m1.closed === false);
  });

  // ---- 9. stranger ------------------------------------------------------------------------
  await step('stranger (owner account) calling pay directly fails', async (ctx) => {
    const m0 = await getMandate(A.id);
    const r = await ctx.send(ownerAcc, dev, [actions.functionCall('pay', { mandate_id: A.id, payee: owner, amount: PER_PAYMENT.toString(), purpose: '', response_b64: '', signature_hex: '' }, LIMIT_GAS, 0n)], 'pay by stranger');
    ctx.note('failure', r.failure);
    ctx.check('tx failed', !r.ok);
    ctx.check('error says pay may only be called through the agent key', r.failure.includes('function-call key'), r.failure);
    const m1 = await getMandate(A.id);
    ctx.check('state unchanged', m1.nonce === m0.nonce && m1.balance === m0.balance);
  });

  // ---- 10. failed payout ------------------------------------------------------------------
  const rand = () => crypto.randomBytes(6).toString('hex');
  await step('failed payout: ALLOW to a nonexistent account is restored', async (ctx) => {
    const payee = `no-such-${rand()}.testnet`;
    ctx.note('payee', payee);
    const before = await getMandate(A.id);
    const r = await agentPay(ctx, A, { payee, amount: PER_PAYMENT, purpose: 'invoice 42', content: 'ALLOW', label: 'pay to nonexistent' });
    ctx.note('return_value', r.value);
    ctx.note('on_payout_gas', onPayoutGas(r.res)?.toString());
    ctx.note('on_payout_gas_tgas', onPayoutGas(r.res) !== undefined ? tgas(onPayoutGas(r.res)) : null);
    ctx.check('tx succeeded (callback ran)', r.ok, r.ok ? undefined : r.failure);
    ctx.check('return value is "PayoutFailed"', r.value === 'PayoutFailed', r.value);
    const after = await getMandate(A.id);
    ctx.check('attempt outcome PayoutFailed', after.attempts.at(-1)?.outcome === 'PayoutFailed', after.attempts.at(-1));
    ctx.check('mandate balance restored', after.balance === before.balance, [before.balance, after.balance]);
    ctx.check('spent restored', after.spent === before.spent, [before.spent, after.spent]);
    ctx.check('payments_made restored', after.payments_made === before.payments_made);
  });

  // ---- 11. worst-case callback ------------------------------------------------------------
  const MAX_INSTRUCTION = 'Pay only the invoice the owner approved, one payment at a time. '.repeat(10).slice(0, 500);
  const MAX_PURPOSE = 'Max length purpose 0123456789 abcdefghijklmnopqrstuvwxyz ABCDEFGHIJ'.slice(0, 64);
  const LONG_PAYEE = `no-such-${crypto.randomBytes(24).toString('hex')}.testnet`; // 8 + 48 + 8 = 64 chars
  let B;
  await step('worst case: 19 max-length refusals, then failed payout under 10 TGas callback', async (ctx) => {
    ctx.note('instruction_len', MAX_INSTRUCTION.length);
    ctx.note('purpose_len', MAX_PURPOSE.length);
    ctx.note('payee_len', LONG_PAYEE.length);
    ctx.check('test inputs are maximum length', MAX_INSTRUCTION.length === 500 && MAX_PURPOSE.length === 64 && LONG_PAYEE.length === 64);
    B = await createMandate(ctx, MAX_INSTRUCTION, 'create_mandate B');
    if (B.id === undefined) return;
    ctx.note('mandate_id', B.id);
    ctx.note('agent_public_key', B.pk);
    const a0 = await allowanceOf(B.pk);
    ctx.note('allowance_start_yocto', a0?.toString() ?? null);
    const deltas = [];
    let prev = a0;
    let guard = 0;
    while ((await getMandate(B.id)).attempts.length < 19 && guard++ < 30) {
      try {
        await agentPay(ctx, B, { payee: LONG_PAYEE, amount: OVER_LIMIT, purpose: MAX_PURPOSE, mode: 'empty', gas: LIMIT_GAS, label: `refusal ${guard}` });
      } catch (e) {
        ctx.note(`refusal_${guard}_error`, describeError(e));
      }
      const a = await allowanceOf(B.pk);
      deltas.push(prev !== null && a !== null ? (a - prev).toString() : null);
      prev = a;
    }
    const mid = await getMandate(B.id);
    ctx.check('19 attempts recorded', mid.attempts.length === 19, mid.attempts.length);
    ctx.note('allowance_delta_per_refusal_yocto', deltas);
    ctx.note('refusal_prepaid_gas_tgas', 30);

    const before = mid;
    const aBefore = await allowanceOf(B.pk);
    const r = await agentPay(ctx, B, { payee: LONG_PAYEE, amount: PER_PAYMENT, purpose: MAX_PURPOSE, content: 'ALLOW', label: 'pay to nonexistent (attempt 20)' });
    const cb = onPayoutGas(r.res);
    ctx.note('return_value', r.value);
    ctx.note('on_payout_gas', cb?.toString());
    ctx.note('on_payout_gas_tgas', cb !== undefined ? tgas(cb) : null);
    ctx.check('tx succeeded (callback ran under ON_PAYOUT_GAS 10 TGas)', r.ok, r.ok ? undefined : r.failure);
    ctx.check('return value is "PayoutFailed"', r.value === 'PayoutFailed', r.value);
    const after = await getMandate(B.id);
    ctx.check('attempts now 20, last is PayoutFailed', after.attempts.length === 20 && after.attempts.at(-1)?.outcome === 'PayoutFailed', after.attempts.at(-1));
    ctx.check('mandate balance restored', after.balance === before.balance, [before.balance, after.balance]);
    ctx.check('spent restored', after.spent === before.spent);
    const aAfter = await allowanceOf(B.pk);
    ctx.note('allowance_after_pay_change_yocto', aBefore !== null && aAfter !== null ? (aAfter - aBefore).toString() : null);
    ctx.note('allowance_remaining_yocto', aAfter?.toString() ?? null);
    ctx.note('allowance_remaining_near', aAfter !== null ? fmtNear(aAfter) : null);
    ctx.note('allowance_spent_total_yocto', a0 !== null && aAfter !== null ? (a0 - aAfter).toString() : null);
  });

  // ---- 12. close --------------------------------------------------------------------------
  await step('close: non-owner fails, owner returns balance, key removed and unusable', async (ctx) => {
    const m0 = await getMandate(A.id);
    const nonOwner = await ctx.send(devAcc, dev, [actions.functionCall('close', { mandate_id: A.id }, LIMIT_GAS, 1n)], 'close by non-owner');
    ctx.note('non_owner_failure', nonOwner.failure);
    ctx.check('non-owner close failed', !nonOwner.ok);
    ctx.check('error says only the mandate owner', nonOwner.failure.includes('only the mandate owner'), nonOwner.failure);

    const ownerBefore = await balanceOf(owner);
    const r = await ctx.send(ownerAcc, dev, [actions.functionCall('close', { mandate_id: A.id }, LIMIT_GAS, 1n)], 'close by owner');
    ctx.check('owner close succeeded', r.ok, r.ok ? undefined : r.failure);
    const ownerAfter = await balanceOf(owner);
    const m1 = await getMandate(A.id);
    ctx.check('mandate closed, balance 0', m1.closed === true && m1.balance === '0', [m1.closed, m1.balance]);
    // The owner paid gas for this tx, so the delta is the refund minus gas; report both.
    ctx.note('mandate_balance_returned_yocto', m0.balance);
    ctx.note('owner_balance_delta_yocto', (ownerAfter - ownerBefore).toString());
    ctx.note('owner_tx_gas_cost_note', 'delta = returned balance - owner gas cost; gas cost is bounded by prepaid 30 TGas');
    ctx.check('owner balance rose by the returned balance minus gas (within 0.01 NEAR)', ownerAfter - ownerBefore <= BigInt(m0.balance) && BigInt(m0.balance) - (ownerAfter - ownerBefore) < nearToYocto('0.01'), (ownerAfter - ownerBefore).toString());
    ctx.check('agent key gone from view_access_key_list', !(await keyInfo(A.pk)));
    try {
      const p = await ctx.send(A.agent, dev, [actions.functionCall('pay', { mandate_id: A.id, payee: owner, amount: '1', purpose: '', response_b64: '', signature_hex: '' }, LIMIT_GAS, 0n)], 'pay after close');
      ctx.note('pay_after_close', { accepted: true, failure: p.failure });
      ctx.check('agent key can no longer sign pay', !p.ok, p.failure);
    } catch (e) {
      const d = describeError(e);
      ctx.note('pay_after_close', { rejected: true, error: d });
      ctx.check('agent key can no longer sign pay (rejected)', true, d.message);
    }
  });

  // Cleanup: not one of the numbered checks. Returns mandate B's funds to the owner.
  if (B && B.id !== undefined) {
    await step('cleanup: owner closes mandate B (returns its funds)', async (ctx) => {
      const r = await ctx.send(ownerAcc, dev, [actions.functionCall('close', { mandate_id: B.id }, LIMIT_GAS, 1n)], 'close B');
      ctx.check('close B succeeded', r.ok, r.ok ? undefined : r.failure);
      ctx.check('agent key B removed', !(await keyInfo(B.pk)));
    });
  }

  return finish(results, meta);
}

function finish(results, meta) {
  meta.finished = new Date().toISOString();
  meta.total_gas_burnt = results.reduce((s, r) => s + BigInt(r.gas_burnt), 0n).toString();
  const file = path.join(HERE, `results-${meta.finished.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ meta, steps: results }, jsonSafe, 2));
  console.log('\n #  result  gas(TGas)  step');
  for (const r of results) console.log(`${String(r.step).padStart(2)}  ${r.pass ? 'pass  ' : 'FAIL  '}  ${tgas(r.gas_burnt).padStart(8)}  ${r.name}`);
  console.log(`\nresults written to ${file}`);
  return results.every((r) => r.pass) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(`error: ${e.message}`);
      process.exitCode = 2;
    },
  );
}
