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

  // Case-insensitive via raw SQL, for the fourth time in this codebase (see the member-invites,
  // connections-lookup and forgot-password routes): SQLite's unique index on email is
  // case-SENSITIVE and Prisma's `mode: 'insensitive'` isn't supported on this provider. This route
  // lowercases before comparing, but an account created through Google keeps whatever casing the
  // provider sent — so a plain findUnique here MISSES an existing Google account whenever the
  // casing differs, the duplicate check passes, and `create` below succeeds because the two
  // spellings are distinct as far as the index is concerned. The result is two accounts for one
  // person, which is almost certainly what produced the duplicate-person report of 2026-08-28
  // (recorded there as "most likely two different email addresses" — this is a better explanation:
  // one address, two spellings).
  const existingRows = await prisma.$queryRaw<{ id: string; password: string | null }[]>`
    SELECT id, password FROM "User" WHERE LOWER(email) = ${email} LIMIT 1`;
  const existing = existingRows[0] ?? null;
  if (existing) {
    // Naming the sign-in method here leaks nothing further: the 409 has already disclosed that an
    // account exists, so withholding *how* to get into it only strands the person. This is the
    // opposite of the forgot-password route's reasoning, where the whole point is that the response
    // must not reveal existence at all — there the silence is the feature; here it would just be
    // unhelpful. Without this, someone who signed up with Google and forgot hits three separate
    // dead ends in a row: "account already exists" here, "invalid email or password" at sign-in,
    // and a reset email that correctly never arrives.
    return NextResponse.json(
      {
        error: existing.password
          ? 'An account with this email already exists'
          : 'This email is already registered through Google — use "Continue with Google" to sign in.',
      },
      { status: 409 }
    );
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
