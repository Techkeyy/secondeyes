const YOCTO = 10n ** 24n;

/** "1.5" -> 1500000000000000000000000n. Null if not a plain decimal with at most 24 places. */
export function parseNear(text: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,24}))?$/.exec(text.trim());
  if (!m) return null;
  return BigInt(m[1]) * YOCTO + BigInt((m[2] ?? '').padEnd(24, '0') || '0');
}

/** yoctoNEAR -> "1.5". Same format the contract writes into the judge request. */
export function formatNear(yocto: bigint | string): string {
  const y = BigInt(yocto);
  const whole = y / YOCTO;
  const frac = (y % YOCTO).toString().padStart(24, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}
