import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { sendEmail, emailLayout } from '@/lib/email';
import { RESET_TOKEN_TTL_MS, hashResetToken, newResetToken } from '@/lib/passwordReset';

// Requests a password-reset link. Until this existed there was no recovery path at all — a
// forgotten password could only be fixed by editing the database by hand.
//
// Tokens are 32 random bytes; only their SHA-256 hash is stored (see PasswordResetToken in
// schema.prisma), so the database alone can never be used to take over an account. One hour to
// live, single use.

export async function POST(req: Request) {
  // Tighter than signup's 10/15min: this endpoint takes an arbitrary email and sends mail, so
  // it's the most attractive thing here to abuse both as a spam relay and as an account probe.
  if (!checkRateLimit(`forgot:${getClientIp(req)}`, 5, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many attempts, please try again later' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return NextResponse.json({ error: 'Enter your email address' }, { status: 400 });

  // Case-insensitive for the same reason the invite lookup is: signup lowercases before storing,
  // but a Google-created account keeps whatever casing the provider sent.
  const rows = await prisma.$queryRaw<{ id: string; password: string | null }[]>`
    SELECT id, password FROM "User" WHERE LOWER(email) = ${email} LIMIT 1`;
  const user = rows[0] ?? null;

  // Deliberately identical response whether or not the address exists, and whether or not it has
  // a password at all (a Google-only account has none to reset). Anything else turns this into a
  // public "does this person have an account here" oracle — the opposite tradeoff from the
  // workspace invite route, where the caller is an authenticated admin acting on an address they
  // already know, and a useless answer would make the feature pointless.
  const genericOk = NextResponse.json({ ok: true });

  if (!user?.password) return genericOk;

  const raw = newResetToken();
  await prisma.passwordResetToken.create({
    data: { token: hashResetToken(raw), userId: user.id, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const base = process.env.AUTH_URL ?? new URL(req.url).origin;
  const link = `${base}/reset-password?token=${raw}`;

  await sendEmail({
    to: email,
    subject: 'Reset your Siqt password',
    html: emailLayout({
      heading: 'Reset your password',
      body: '<p style="margin:0;">We received a request to reset the password for your Siqt account. This link is valid for one hour and can be used once.</p>',
      cta: { label: 'Choose a new password', url: link },
      footer: 'If you didn&rsquo;t request this, you can ignore this email — your password stays unchanged.',
    }),
    text: `Reset your Siqt password\n\nOpen this link to choose a new password (valid for one hour, single use):\n${link}\n\nIf you didn't request this, ignore this email — your password stays unchanged.`,
  });

  return genericOk;
}
