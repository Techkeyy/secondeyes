// Gate 0 live check: does a NEAR AI Cloud provider_tee ed25519 signature verify
// from the exact request and response bytes?
//
// Usage: node --env-file=.env verify/verify-signature.mjs [model] [--repeat N]
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSignature, sha256hex } from './verify-lib.mjs';

const DEFAULT_MODEL = 'z-ai/glm-5.3-flash';
const BASE = 'https://cloud-api.near.ai';
const SIG_RETRIES = 5;
const SIG_RETRY_MS = 2000;
const VECTORS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'vectors');

const SYSTEM_PROMPT = 'You are a payment gate. Answer with exactly one word, ALLOW or BLOCK.';
const USER_PROMPT = [
  'Mandate: pay Acme Hosting up to 50 USDC for its March 2026 hosting invoice, to payee acme-hosting.near only.',
  'Payment: 25 USDC to acme-hosting.near, memo "March hosting invoice #3317".',
  'Does this payment fit the mandate? Answer ALLOW or BLOCK.',
].join('\n');

function parseArgs(argv) {
  let model = DEFAULT_MODEL;
  let repeat = 1;
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repeat') {
      repeat = Number(argv[++i]);
    } else {
      positional.push(argv[i]);
    }
  }
  if (positional[0]) model = positional[0];
  if (!Number.isInteger(repeat) || repeat < 1) {
    throw new Error('--repeat must be a positive integer');
  }
  return { model, repeat };
}

// Built once per run and reused for every repeat, so the request bytes are identical.
function buildRequestBody(model) {
  return JSON.stringify({
    model,
    stream: false,
    temperature: 0,
    seed: 7,
    max_tokens: 16,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_PROMPT },
    ],
  });
}

// Preflight: public endpoint, no auth needed. Returns the single ed25519 model signer.
async function preflight(model) {
  const nonce = randomBytes(32).toString('hex');
  const url = new URL('/v1/attestation/report', BASE);
  url.search = new URLSearchParams({
    model,
    signing_algo: 'ed25519',
    nonce,
    provider: 'near',
  }).toString();

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`attestation preflight HTTP ${res.status}: ${text}`);

  const body = JSON.parse(text);
  const candidates = body.model_attestations;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('preflight: model_attestations is missing or empty');
  }
  const ed25519 = candidates.filter((c) => c.signing_algo === 'ed25519');
  if (ed25519.length !== 1) {
    throw new Error(`preflight: expected exactly one ed25519 model candidate, found ${ed25519.length}`);
  }
  return {
    signer: ed25519[0].signing_address,
    modelName: ed25519[0].model_name,
  };
}

async function postCompletion(requestBytes, apiKey) {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'identity',
      'x-no-aliasing': 'true',
    },
    body: requestBytes,
  });
  const responseBytes = Buffer.from(await res.arrayBuffer());
  if (!res.ok) {
    throw new Error(`chat/completions HTTP ${res.status}: ${responseBytes.toString('utf8')}`);
  }
  return responseBytes;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchSignature(id, apiKey) {
  const url = `${BASE}/v1/signature/${encodeURIComponent(id)}?signing_algo=ed25519`;
  for (let attempt = 0; attempt <= SIG_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
    });
    const text = await res.text();
    if (res.status === 404 && attempt < SIG_RETRIES) {
      console.log(`signature not found yet (404), retry ${attempt + 1}/${SIG_RETRIES} in ${SIG_RETRY_MS / 1000}s`);
      await sleep(SIG_RETRY_MS);
      continue;
    }
    if (!res.ok) throw new Error(`signature HTTP ${res.status}: ${text}`);
    const signature = JSON.parse(text);
    if (signature.error_code) {
      throw new Error(`signature unavailable: ${signature.error_code}: ${signature.message ?? ''}`);
    }
    return { signature, signatureText: text };
  }
  throw new Error('signature fetch: retries exhausted');
}

function verdictWord(content) {
  return content.toUpperCase().replace(/[^A-Z]/g, '');
}

async function runOnce({ index, total, model, requestBytes, apiKey, signer }) {
  console.log(`\n--- run ${index}/${total} ---`);
  const responseBytes = await postCompletion(requestBytes, apiKey);

  const parsed = JSON.parse(responseBytes.toString('utf8'));
  const id = parsed.id;
  if (typeof id !== 'string' || id === '') throw new Error('completion response has no id');
  const content = String(parsed.choices?.[0]?.message?.content ?? '').trim();
  console.log(`id: ${id}`);
  console.log(`verdict: ${content}`);

  const { signature, signatureText } = await fetchSignature(id, apiKey);

  const dir = join(VECTORS_DIR, id.replace(/[^A-Za-z0-9._-]/g, '_'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'request.bin'), requestBytes);
  writeFileSync(join(dir, 'response.bin'), responseBytes);
  writeFileSync(join(dir, 'signature.json'), signatureText);
  console.log(`saved vectors: ${dir}`);

  const checks = checkSignature({
    signature,
    model,
    requestBytes,
    responseBytes,
    preflightSigner: signer,
  });
  for (const c of checks) {
    console.log(c.pass ? `PASS ${c.name}` : `FAIL ${c.name} (${c.detail})`);
  }
  return { verdict: verdictWord(content), pass: checks.every((c) => c.pass) };
}

async function main() {
  const { model, repeat } = parseArgs(process.argv.slice(2));
  const apiKey = process.env.NEAR_AI_API_KEY;
  if (!apiKey) {
    console.error('NEAR_AI_API_KEY is missing. Add it to .env (see .env.example), then rerun.');
    process.exit(2);
  }

  console.log(`model: ${model}`);
  console.log(`repeats: ${repeat}`);

  const pre = await preflight(model);
  console.log(`preflight signer (ed25519): ${pre.signer}`);
  console.log(`preflight model_name: ${pre.modelName}`);

  const requestBytes = Buffer.from(buildRequestBody(model), 'utf8');
  console.log(`request sha256: ${sha256hex(requestBytes)}`);

  const tally = { ALLOW: 0, BLOCK: 0, OTHER: 0 };
  let allPass = true;
  for (let i = 1; i <= repeat; i++) {
    const result = await runOnce({
      index: i,
      total: repeat,
      model,
      requestBytes,
      apiKey,
      signer: pre.signer,
    });
    allPass = allPass && result.pass;
    if (result.verdict === 'ALLOW' || result.verdict === 'BLOCK') {
      tally[result.verdict]++;
    } else {
      tally.OTHER++;
    }
  }

  console.log(`\nverdicts over ${repeat} run(s): ALLOW ${tally.ALLOW}, BLOCK ${tally.BLOCK}, OTHER ${tally.OTHER}`);
  console.log(allPass ? 'RESULT: all checks passed' : 'RESULT: one or more checks failed');
  process.exitCode = allPass ? 0 : 1;
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exitCode = 1;
});
