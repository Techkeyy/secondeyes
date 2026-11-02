import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { checkSignature, expectedText, sha256hex, verifyEd25519 } from './verify-lib.mjs';

const MODEL = 'z-ai/glm-5.3-flash';
const REQUEST = Buffer.from('{"model":"z-ai/glm-5.3-flash","stream":false,"seed":7}');
const RESPONSE = Buffer.from('{"id":"chatcmpl-test","choices":[{"message":{"content":"ALLOW"}}]}');

function rawPublicKeyHex(publicKey) {
  // SPKI DER for Ed25519 is 44 bytes: 12-byte prefix then the 32-byte raw key.
  return publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
}

const signer = generateKeyPairSync('ed25519');
const signerHex = rawPublicKeyHex(signer.publicKey);
const other = generateKeyPairSync('ed25519');
const otherHex = rawPublicKeyHex(other.publicKey);

function signText(text, privateKey) {
  return sign(null, Buffer.from(text, 'utf8'), privateKey).toString('hex');
}

function makeSignature(overrides = {}) {
  const text = expectedText(MODEL, REQUEST, RESPONSE);
  return {
    text,
    signature: signText(text, signer.privateKey),
    signing_address: signerHex,
    signing_algo: 'ed25519',
    signature_kind: 'provider_tee',
    ...overrides,
  };
}

function run({ signature, model = MODEL, response = RESPONSE, preflightSigner = signerHex }) {
  return checkSignature({
    signature,
    model,
    requestBytes: REQUEST,
    responseBytes: response,
    preflightSigner,
  });
}

const failedNames = (checks) => checks.filter((c) => !c.pass).map((c) => c.name);
const ALL_PASS = (checks) => checks.every((c) => c.pass);

test('sha256hex matches the known empty-string digest', () => {
  assert.equal(
    sha256hex(Buffer.alloc(0)),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
});

test('valid provider_tee signature passes every check', () => {
  const checks = run({ signature: makeSignature() });
  assert.equal(checks.length, 5);
  assert.deepEqual(failedNames(checks), []);
  assert.ok(ALL_PASS(checks));
});

test('tampered response bytes fail the text binding', () => {
  const tampered = Buffer.from(RESPONSE.toString('utf8') + ' ');
  const checks = run({ signature: makeSignature(), response: tampered });
  assert.deepEqual(failedNames(checks), ['text equals MODEL:sha256(request):sha256(response)']);
});

test('wrong model fails the text binding', () => {
  const checks = run({ signature: makeSignature(), model: 'other/model' });
  assert.deepEqual(failedNames(checks), ['text equals MODEL:sha256(request):sha256(response)']);
});

test('signature from a different signer fails the preflight signer match', () => {
  // Signed by `other` and signing_address = otherHex, but preflight expects signerHex.
  const text = expectedText(MODEL, REQUEST, RESPONSE);
  const signature = makeSignature({
    signing_address: otherHex,
    signature: signText(text, other.privateKey),
  });
  const checks = run({ signature, preflightSigner: signerHex });
  assert.deepEqual(failedNames(checks), ['signing_address equals preflight signer']);
});

test('gateway signature_kind fails the provider_tee kind check', () => {
  const text = `${sha256hex(REQUEST)}:${sha256hex(RESPONSE)}`;
  const signature = makeSignature({
    signature_kind: 'gateway',
    text,
    signature: signText(text, signer.privateKey),
  });
  const checks = run({ signature });
  assert.deepEqual(failedNames(checks), ['signature_kind is provider_tee', 'text equals MODEL:sha256(request):sha256(response)']);
});

test('0x-prefixed signature hex verifies', () => {
  const checks = run({ signature: makeSignature({ signature: '0x' + makeSignature().signature }) });
  assert.deepEqual(failedNames(checks), []);
});

test('verifyEd25519 rejects a signature over different text and malformed input', () => {
  const sig = signText('hello', signer.privateKey);
  assert.equal(verifyEd25519(signerHex, 'hello', sig), true);
  assert.equal(verifyEd25519(signerHex, 'hello!', sig), false);
  assert.equal(verifyEd25519(signerHex, 'hello', 'not-hex'), false);
  assert.equal(verifyEd25519('abcd', 'hello', sig), false);
});
