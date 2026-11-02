// In-memory, per server process. Resets on restart and is not shared between instances.
const hits = new Map<string, number[]>();

// x-forwarded-for can be forged, so a cap across all callers is what actually bounds the NEAR AI bill.
export const GLOBAL_PER_MINUTE = 60;

export function rateLimited(bucket: string, ip: string, max: number, windowMs = 60_000): boolean {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export const clientIp = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
