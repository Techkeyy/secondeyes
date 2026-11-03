import crypto from 'node:crypto';
import type { JudgeAnswer } from '../types';

const BASE = 'https://cloud-api.near.ai';
const SIG_RETRIES = 5;
const SIG_RETRY_MS = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const sha256Hex = (data: string) => crypto.createHash('sha256').update(data).digest('hex');

/**
 * Sends the exact request bytes the contract built, keeps the exact response bytes, and fetches the
 * provider_tee signature for that completion. Mirrors verify/verify-signature.mjs.
 */
export async function judgeWithNearAi(request: string, apiKey: string): Promise<JudgeAnswer> {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept-Encoding': 'identity',
      'x-no-aliasing': 'true',
    },
    body: Buffer.from(request, 'utf8'),
    cache: 'no-store',
  });
  const responseBytes = Buffer.from(await res.arrayBuffer());
  if (!res.ok) throw new Error(`NEAR AI answered HTTP ${res.status}`);

  const id = (JSON.parse(responseBytes.toString('utf8')) as { id?: string }).id;
  if (!id) throw new Error('NEAR AI response has no id');

  const url = `${BASE}/v1/signature/${encodeURIComponent(id)}?signing_algo=ed25519`;
  for (let attempt = 0; ; attempt++) {
    const sigRes = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    if (sigRes.status === 404 && attempt < SIG_RETRIES) {
      await sleep(SIG_RETRY_MS);
      continue;
    }
    if (!sigRes.ok) throw new Error(`NEAR AI signature fetch answered HTTP ${sigRes.status}`);
    const sig = (await sigRes.json()) as { signature?: string; signature_kind?: string; error_code?: string };
    if (sig.error_code || !sig.signature) throw new Error('NEAR AI returned no signature');
    if (sig.signature_kind !== 'provider_tee') throw new Error(`unexpected signature kind ${sig.signature_kind}`);
    return { response_b64: responseBytes.toString('base64'), signature_hex: sig.signature.replace(/^0x/, '') };
  }
}

/** Cheap, unsigned model call used by the demo agent to read an invoice. */
export async function chat(model: string, system: string, user: string, apiKey: string): Promise<string> {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0,
      max_tokens: 2000, // the model reasons first, and that counts
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`NEAR AI answered HTTP ${res.status}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? '';
}
