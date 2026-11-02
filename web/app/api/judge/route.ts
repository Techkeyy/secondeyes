import { NextResponse } from 'next/server';
import { clientIp, rateLimited, GLOBAL_PER_MINUTE } from '@/lib/server/limit';
import { judge, JudgeError } from '@/lib/server/judge';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  if (rateLimited('judge', clientIp(req), 10) || rateLimited('judge', 'everyone', GLOBAL_PER_MINUTE)) return fail('Too many requests. Wait a minute and try again.', 429);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Body must be JSON.', 400);
  }
  // Only these four fields are read. Anything else in the body is ignored.
  const { mandate_id, payee, amount, purpose } = body;
  if (typeof mandate_id !== 'number' || !Number.isSafeInteger(mandate_id) || mandate_id < 0) {
    return fail('mandate_id must be a non-negative integer.', 400);
  }
  if (typeof payee !== 'string' || payee.length > 64) return fail('payee must be a NEAR account id.', 400);
  if (typeof amount !== 'string' || !/^[0-9]{1,40}$/.test(amount)) {
    return fail('amount must be a string of digits in yoctoNEAR.', 400);
  }
  if (typeof purpose !== 'string' || purpose.length > 200) return fail('purpose must be a string.', 400);

  try {
    return NextResponse.json(await judge({ mandate_id, payee, amount, purpose }));
  } catch (e) {
    if (e instanceof JudgeError) return fail(e.message, e.status);
    return fail(e instanceof Error ? e.message : 'Judge failed.', 500);
  }
}
