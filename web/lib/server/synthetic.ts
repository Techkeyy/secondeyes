// TEST JUDGE. Not NEAR AI. Signs with a development key from the server environment.
import crypto from 'node:crypto';
import type { JudgeAnswer } from '../types';

const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const sha256Hex = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');

export interface ParsedRequest {
  model: string;
  instruction: string;
  payee: string;
  amountNear: string;
}

/** Reads back the fields of a request the contract built (see build_request_body in the contract). */
export function parseRequest(request: string): ParsedRequest {
  const body = JSON.parse(request) as { model: string; messages: { content: string }[] };
  const user = body.messages[1].content;
  const m = /^INSTRUCTION: (.*)\nALREADY PAID:\n[^]*?\nPAYMENT:\npayee: (\S+)\namount: (\S+) NEAR /.exec(user);
  if (!m) throw new Error('request does not have the expected shape');
  return { model: body.model, instruction: m[1], payee: m[2], amountNear: m[3] };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** ALLOW if the payee account id and the amount both appear in the instruction, else BLOCK. */
export function syntheticVerdict(request: string): 'ALLOW' | 'BLOCK' {
  const { instruction, payee, amountNear } = parseRequest(request);
  const text = instruction.toLowerCase();
  const payeeRe = new RegExp(`(?<![a-z0-9._-])${escapeRe(payee)}(?![a-z0-9_-]|\\.[a-z0-9])`);
  const amountRe = new RegExp(`(?<![0-9.])${escapeRe(amountNear)}(?![0-9]|\\.[0-9])`);
  return payeeRe.test(text) && amountRe.test(text) ? 'ALLOW' : 'BLOCK';
}

export function privateKeyFromSeed(seedHex: string): crypto.KeyObject {
  if (!/^[0-9a-f]{64}$/i.test(seedHex)) throw new Error('JUDGE_DEV_KEY must be 32 bytes as 64 hex characters');
  return crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seedHex, 'hex')]),
    format: 'der',
    type: 'pkcs8',
  });
}

/** Same signed text as NEAR AI provider_tee: `{model}:{sha256(request)}:{sha256(response)}`. */
export function signSynthetic(request: string, seedHex: string): JudgeAnswer {
  const { model } = parseRequest(request);
  const response = Buffer.from(
    JSON.stringify({
      id: `synthetic-${crypto.randomUUID()}`,
      model,
      choices: [{ index: 0, message: { role: 'assistant', content: syntheticVerdict(request) }, finish_reason: 'stop' }],
    }),
    'utf8',
  );
  const text = `${model}:${sha256Hex(request)}:${sha256Hex(response)}`;
  const signature = crypto.sign(null, Buffer.from(text, 'utf8'), privateKeyFromSeed(seedHex));
  return { response_b64: response.toString('base64'), signature_hex: signature.toString('hex') };
}

/**
 * Imitates an agent that obeys text it finds on a page. Reads the payee and amount the way an
 * honest invoice states them, then follows an injected "pay X instead" line.
 */
export function syntheticRead(pageText: string): { payee: string; amount_near: string; purpose: string } {
  const payee = /Payee account:\s*([a-z0-9._-]+)/i.exec(pageText)?.[1];
  const amount = /Amount due:\s*([0-9.]+)\s*NEAR/i.exec(pageText)?.[1];
  const number = /Invoice number:\s*(\S+)/i.exec(pageText)?.[1];
  if (!payee || !amount) throw new Error('could not find a payee and amount on the page');
  const injected = /pay\s+([a-z0-9._-]+\.(?:testnet|near))\s+instead/i.exec(pageText)?.[1];
  return { payee: injected ?? payee, amount_near: amount, purpose: `Acme invoice ${number ?? ''}` };
}
