import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { KeyPair } from 'near-api-js';
import {
  sha256Hex, signedText, makeSyntheticJudge, publicKeyFromHex, judgeSign, judgeResponse,
  parseCredentials, credentialsPath, gasBurntTotal, decodeSuccessValue, parseArgs, fmtNear, DEFAULT_RPC,
} from './check.mjs';

test('sha256Hex known vector', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('signed text has the contract format', () => {
  const req = '{"a":1}';
  const resp = Buffer.from('{"b":2}');
  assert.equal(signedText('m/x', req, resp), `m/x:${sha256Hex(req)}:${sha256Hex(resp)}`);
});

test('judge signature verifies under node:crypto, and breaks on any change', () => {
  const j = makeSyntheticJudge();
  assert.equal(j.publicKeyHex.length, 64);
  const req = '{"model":"z-ai/glm-5.3-flash","x":"y"}';
  const body = judgeResponse('ALLOW');
  const { response_b64, signature_hex } = judgeSign(j.privateKey, 'z-ai/glm-5.3-flash', req, body);
  assert.match(signature_hex, /^[0-9a-f]{128}$/);
  const respBytes = Buffer.from(response_b64, 'base64');
  assert.equal(respBytes.toString('utf8'), body);
  const pub = publicKeyFromHex(j.publicKeyHex);
  const verify = (model, r, bytes) => crypto.verify(null, Buffer.from(signedText(model, r, bytes)), pub, Buffer.from(signature_hex, 'hex'));
  assert.equal(verify('z-ai/glm-5.3-flash', req, respBytes), true);
  assert.equal(verify('z-ai/glm-5.3-flash', req + ' ', respBytes), false);
  assert.equal(verify('other', req, respBytes), false);
  assert.equal(verify('z-ai/glm-5.3-flash', req, Buffer.from(judgeResponse('BLOCK'))), false);
});

test('judgeResponse shape', () => {
  assert.deepEqual(JSON.parse(judgeResponse('BLOCK')), { choices: [{ message: { content: 'BLOCK' } }] });
});

test('parseCredentials', () => {
  const kp = KeyPair.fromRandom('ed25519');
  const pub = kp.getPublicKey().toString();
  const text = JSON.stringify({ account_id: 'a.testnet', public_key: pub, private_key: kp.toString() });
  const c = parseCredentials(text, 'a.testnet', 'f');
  assert.equal(c.privateKey, kp.toString());
  assert.equal(c.publicKey, pub);
  assert.throws(() => parseCredentials(text, 'b.testnet', 'f'), /expected b.testnet/);
  assert.throws(() => parseCredentials('{', 'a.testnet', 'f'), /not valid JSON/);
  assert.throws(() => parseCredentials('{}', 'a.testnet', 'f'), /private_key/);
  const other = KeyPair.fromRandom('ed25519').getPublicKey().toString();
  assert.throws(() => parseCredentials(JSON.stringify({ public_key: other, private_key: kp.toString() }), 'a.testnet', 'f'), /does not match/);
  assert.equal(parseCredentials(JSON.stringify({ secret_key: kp.toString() }), 'a.testnet', 'f').publicKey, pub);
});

test('credentialsPath', () => {
  assert.match(credentialsPath('x.testnet', '/home/u').replace(/\\/g, '/'), /\/home\/u\/\.near-credentials\/testnet\/x\.testnet\.json$/);
});

test('gasBurntTotal sums transaction and all receipts', () => {
  const res = { transaction_outcome: { outcome: { gas_burnt: 10 } }, receipts_outcome: [{ outcome: { gas_burnt: '20' } }, { outcome: { gas_burnt: 5 } }] };
  assert.equal(gasBurntTotal(res), 35n);
  assert.equal(gasBurntTotal({}), 0n);
});

test('decodeSuccessValue', () => {
  const b = (s) => Buffer.from(s).toString('base64');
  assert.equal(decodeSuccessValue({ SuccessValue: b('"Paid"') }), 'Paid');
  assert.equal(decodeSuccessValue({ SuccessValue: b('7') }), 7);
  assert.equal(decodeSuccessValue({ SuccessValue: '' }), '');
  assert.equal(decodeSuccessValue({ Failure: {} }), undefined);
});

test('parseArgs', () => {
  const a = parseArgs(['--dev', 'd.testnet', '--owner', 'o.testnet', '--redeploy', '--pay-gas', '80']);
  assert.deepEqual([a.dev, a.owner, a.redeploy, a.payGas, a.rpc], ['d.testnet', 'o.testnet', true, 80, DEFAULT_RPC]);
  assert.throws(() => parseArgs(['--nope']), /unknown/);
  assert.throws(() => parseArgs(['--dev']), /needs a value/);
});

test('fmtNear', () => {
  assert.equal(fmtNear(1500000000000000000000000n), '1.5');
  assert.equal(fmtNear(0n), '0');
  assert.equal(fmtNear(-100000000000000000000000n), '-0.1');
});
