import { NextRequest, NextResponse } from 'next/server';
import { handlers } from '@/auth';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const { GET } = handlers;

// No rate limiting existed on login at all before this — this whole route is NextAuth's own
// catch-all handler (GET/POST /api/auth/*), so the credentials-login path can't be rate-limited
// in its own separate route file the way signup could; wrapping POST here instead. Only the
// actual sign-in attempt is gated (session/csrf/callbackUrl reads etc. all also hit this same
// handler and shouldn't be throttled) — 20 attempts per 15 minutes per IP is generous for a real
// user (a few mistyped passwords) but slows down credential-stuffing meaningfully.
export async function POST(req: NextRequest) {
  const path = new URL(req.url).pathname;
  if (path.endsWith('/callback/credentials')) {
    if (!checkRateLimit(`login:${getClientIp(req)}`, 20, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many attempts, please try again later' }, { status: 429 });
    }
  }
  return handlers.POST(req);
}
