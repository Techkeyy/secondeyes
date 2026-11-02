export type JudgeMode = 'real' | 'synthetic';

/** JUDGE_MODE unset means real NEAR AI. The only other value is "synthetic". Anything else is an error. */
export function judgeMode(): JudgeMode {
  const m = process.env.JUDGE_MODE;
  if (m === undefined || m === '') {
    if (!process.env.NEAR_AI_API_KEY) throw new Error('NEAR_AI_API_KEY is not set on the server, so no judge is available.');
    return 'real';
  }
  if (m === 'synthetic') {
    if (!process.env.JUDGE_DEV_KEY) throw new Error('JUDGE_MODE=synthetic needs JUDGE_DEV_KEY (32-byte hex seed).');
    return 'synthetic';
  }
  throw new Error('JUDGE_MODE must be unset or "synthetic".');
}
