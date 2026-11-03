// In-memory, per server process. Resets on restart and is not shared between instances.
const hits = new Map<string, number[]>();

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

// x-forwarded-for can be forged, so caps across all callers are what actually bound the NEAR AI bill.
// One call costs at most about $0.002, so a route tops out near $2 a day.
const GLOBAL_PER_MINUTE = 60;
const GLOBAL_PER_DAY = 1000;
export const overGlobalLimit = (bucket: string) =>
  rateLimited(bucket, 'all-minute', GLOBAL_PER_MINUTE) || rateLimited(bucket, 'all-day', GLOBAL_PER_DAY, 86_400_000);
