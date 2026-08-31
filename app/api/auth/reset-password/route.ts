import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { hashResetToken } from '@/lib/passwordReset';

// Consumes a reset link and sets the new password. Same 8-character floor the signup route
// enforces — kept in sync deliberately, since this is the other way a password enters the system.
const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: Request) {
  if (!checkRateLimit(`reset:${getClientIp(req)}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again later' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const raw = typeof body?.token === 'string' ? body.token : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!raw) return NextResponse.json({ error: 'Missing reset token' }, { status: 400 });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
  }

  const record = await prisma.passwordResetToken.findUnique({ where: { token: hashResetToken(raw) } });

  // One message for every failure mode (unknown, already used, expired) — distinguishing them
  // tells an attacker holding a guessed token which part they got right.
  const invalid = NextResponse.json({ error: 'This reset link is invalid or has expired. Request a new one.' }, { status: 400 });
  if (!record || record.usedAt || record.expiresAt < new Date()) return invalid;

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { password: await bcrypt.hash(password, 10) } }),
    // Marked used in the same transaction as the password change, so a token can never be
    // consumed twice even if two requests arrive together.
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Any other outstanding link for this account is now stale — resetting the password should
    // invalidate every route back in, not just the one that was used.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
