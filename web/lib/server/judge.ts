import { MAX_ATTEMPTS } from '../config';
import { errorText, getMandate, view } from '../near';
import type { JudgeAnswer } from '../types';
import { judgeWithNearAi, sha256Hex } from './nearai';
import { judgeMode } from './mode';
import { signSynthetic } from './synthetic';

export interface JudgeInput {
  mandate_id: number;
  payee: string;
  amount: string; // yoctoNEAR, decimal digits
  purpose: string;
}

export class JudgeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * The request bytes encode mandate, nonce and every payment field, so their hash is the
 * "mandate + nonce + fields" key: one judged answer per payment attempt.
 */
export const cacheKey = (request: string) => sha256Hex(request);

const CACHE_MAX = 1000;
const cache = new Map<string, Promise<JudgeAnswer>>();

export async function judge(input: JudgeInput): Promise<JudgeAnswer> {
  const mode = judgeMode();

  const mandate = await getMandate(input.mandate_id).catch((e) => {
    throw new JudgeError(errorText(e), 502);
  });
  if (!mandate) throw new JudgeError('No such mandate on this contract.', 404);
  if (mandate.closed) throw new JudgeError('This mandate is closed.', 409);
  if (mandate.attempts.length >= MAX_ATTEMPTS) throw new JudgeError('This mandate has used all 20 attempts.', 409);

  // The contract builds the bytes. Nothing the caller sends can change them.
  const request = await view<string>('build_request', {
    mandate_id: input.mandate_id,
    payee: input.payee,
    amount: input.amount,
    purpose: input.purpose,
  }).catch((e) => {
    throw new JudgeError(errorText(e), 400);
  });

  const key = cacheKey(request);
  let answer = cache.get(key);
  if (!answer) {
    answer =
      mode === 'synthetic'
        ? Promise.resolve().then(() => signSynthetic(request, process.env.JUDGE_DEV_KEY!))
        : judgeWithNearAi(request, process.env.NEAR_AI_API_KEY!);
    cache.set(key, answer);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
    answer.catch(() => cache.delete(key)); // a failed call may be retried
  }
  return answer;
}
