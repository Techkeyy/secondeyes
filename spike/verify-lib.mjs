// Pure verification helpers for NEAR AI Cloud provider_tee response signatures.
// Node built-ins only.
import { createHash, createPublicKey, verify } from 'node:crypto';

// DER prefix for an Ed25519 SubjectPublicKeyInfo. Append the 32-byte raw key.
const ED25519_SPKI_PREFIX = '302a300506032b6570032100';

export function sha256hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// Signed payload for provider_tee: MODEL_ID:sha256(request bytes):sha256(response bytes)
export function expectedText(model, requestBytes, responseBytes) {
  return `${model}:${sha256hex(requestBytes)}:${sha256hex(responseBytes)}`;
}

// Verifies an Ed25519 signature over the UTF-8 bytes of `text`.
// publicKeyHex is the raw 32-byte key; signatureHex may carry a 0x prefix.
export function verifyEd25519(publicKeyHex, text, signatureHex) {
  try {
    const pub = String(publicKeyHex).replace(/^0x/i, '');
    const sig = String(signatureHex).replace(/^0x/i, '');
    if (!/^[0-9a-fA-F]{64}$/.test(pub)) return false;
    if (!/^[0-9a-fA-F]{128}$/.test(sig)) return false;
    const key = createPublicKey({
      key: Buffer.from(ED25519_SPKI_PREFIX + pub, 'hex'),
      format: 'der',
      type: 'spki',
    });
    return verify(null, Buffer.from(text, 'utf8'), key, Buffer.from(sig, 'hex'));
  } catch {
    return false;
  }
}

// Runs every check and returns [{ name, pass, detail }]. Overall pass = every(c => c.pass).
//   signature:       parsed JSON from GET /v1/signature/{id}
//   model:           canonical model id that was sent in the request
//   requestBytes:    exact request body bytes (Buffer)
//   responseBytes:   exact response body bytes (Buffer)
//   preflightSigner: signing_address of the single ed25519 model candidate from preflight
export function checkSignature({ signature, model, requestBytes, responseBytes, preflightSigner }) {
  const sig = signature ?? {};
  const text = expectedText(model, requestBytes, responseBytes);
  const signedText = typeof sig.text === 'string' ? sig.text : '';

  return [
    {
      name: 'signature_kind is provider_tee',
      pass: sig.signature_kind === 'provider_tee',
      detail: `got ${JSON.stringify(sig.signature_kind)}`,
    },
    {
      name: 'text equals MODEL:sha256(request):sha256(response)',
      pass: signedText === text,
      detail: `expected ${text}, got ${signedText}`,
    },
    {
      name: 'signing_address equals preflight signer',
      pass: typeof preflightSigner === 'string' &&
        String(sig.signing_address ?? '').toLowerCase() === preflightSigner.toLowerCase(),
      detail: `signature ${sig.signing_address}, preflight ${preflightSigner}`,
    },
    {
      name: 'signing_algo is ed25519',
      pass: sig.signing_algo === 'ed25519',
      detail: `got ${JSON.stringify(sig.signing_algo)}`,
    },
    {
      name: 'ed25519 signature verifies over text',
      pass: verifyEd25519(sig.signing_address, signedText, sig.signature),
      detail: 'Ed25519 verify with signing_address as raw public key',
    },
  ];
}
