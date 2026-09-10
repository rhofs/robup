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

  // Deliberately identical response whether or not the address exists. Anything else turns this
  // into a public "does this person have an account here" oracle — the opposite tradeoff from the
  // workspace invite route, where the caller is an authenticated admin acting on an address they
  // already know, and a useless answer would make the feature pointless.
  const genericOk = NextResponse.json({ ok: true });

  if (!user) return genericOk;

  // A Google-only account has no password to *reset*, but it still gets a link — to set a first
  // one. This used to return early here, which quietly stranded exactly the people most likely to
  // need it: the Android app cannot use Google sign-in at all (Google refuses OAuth inside
  // embedded WebViews), so every Google user installing the app needs a password, asks for one
  // here, and used to receive nothing at all with no explanation anywhere.
  //
  // This does not weaken the anti-oracle property above. The HTTP response is unchanged in every
  // case; only the wording inside the email differs, and the sole person who can read that is
  // whoever already controls the mailbox.
  const isFirstPassword = !user.password;

  const raw = newResetToken();
  await prisma.passwordResetToken.create({
    data: { token: hashResetToken(raw), userId: user.id, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const base = process.env.AUTH_URL ?? new URL(req.url).origin;
  const link = `${base}/reset-password?token=${raw}`;

  // Someone who has only ever pressed "Continue with Google" does not think of themselves as
  // having a password at all, so "reset" would read as addressed to the wrong person. Name the
  // Google account explicitly and say why a password is worth having — otherwise the likeliest
  // reaction to this mail is to assume it was sent in error and ignore it.
  await sendEmail({
    to: email,
    subject: isFirstPassword ? 'Set a password for your Siqt account' : 'Reset your Siqt password',
    html: emailLayout({
      heading: isFirstPassword ? 'Set a password' : 'Reset your password',
      body: isFirstPassword
        ? '<p style="margin:0;">Your Siqt account signs in with Google and doesn&rsquo;t have a password yet. This link sets one, so you can also sign in with your email address &mdash; which is what the Siqt mobile app needs, as Google sign-in isn&rsquo;t available there. You can keep using Google in your browser exactly as before. The link is valid for one hour and can be used once.</p>'
        : '<p style="margin:0;">We received a request to reset the password for your Siqt account. This link is valid for one hour and can be used once.</p>',
      cta: { label: isFirstPassword ? 'Set a password' : 'Choose a new password', url: link },
      footer: isFirstPassword
        ? 'If you didn&rsquo;t request this, you can ignore this email &mdash; nothing changes and you can carry on signing in with Google.'
        : 'If you didn&rsquo;t request this, you can ignore this email — your password stays unchanged.',
    }),
    text: isFirstPassword
      ? `Set a password for your Siqt account\n\nYour account signs in with Google and doesn't have a password yet. Open this link to set one, so you can also sign in with your email address — which is what the Siqt mobile app needs, as Google sign-in isn't available there. You can keep using Google in your browser exactly as before.\n\nValid for one hour, single use:\n${link}\n\nIf you didn't request this, ignore this email — nothing changes and you can carry on signing in with Google.`
      : `Reset your Siqt password\n\nOpen this link to choose a new password (valid for one hour, single use):\n${link}\n\nIf you didn't request this, ignore this email — your password stays unchanged.`,
  });

  return genericOk;
}
