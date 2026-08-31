import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { ensurePersonalWorkspace } from '@/lib/personalWorkspace';

// Hand-rolled validation rather than adding zod for something this small — matches the project's
// existing "skip a dependency for a small need" precedent (pdfkit over Puppeteer).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  // No signup rate limiting existed at all before this — a public-facing signup form is an easy
  // target for mass account creation. 10 attempts per 15 minutes per IP is generous for a genuine
  // user (who needs at most one or two) but meaningfully slows down automated abuse.
  if (!checkRateLimit(`signup:${getClientIp(req)}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again later' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : email.split('@')[0];

  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  }

  // Same initials-from-name derivation as auth.ts's events.createUser (Google sign-in path) —
  // kept in sync so both paths produce the same style of avatar-fallback initials.
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.length
    ? ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? '')).toUpperCase()
    : '?';

  const user = await prisma.user.create({
    data: { email, password: await bcrypt.hash(password, 10), name, initials },
  });

  // Given up front, not lazily on the first "My Tasks" click — without it a brand-new account
  // loads with zero workspaces and essentially the whole app is gated off (see
  // lib/personalWorkspace.ts). Awaited rather than fire-and-forget: the very next thing this user
  // does is sign in and load the app, so it genuinely needs to exist by then.
  await ensurePersonalWorkspace(user.id);

  return NextResponse.json({ ok: true });
}
