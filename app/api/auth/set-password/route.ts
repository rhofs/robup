import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// Same bar as signup and the reset flow — kept a local constant in each rather than shared,
// matching how reset-password already does it.
const MIN_PASSWORD_LENGTH = 8;

// Set or change your own password while signed in. Two gaps this closes, both hit for real:
//
//  1. An account created through Google has no password at all, so "forgot password" correctly
//     sends nothing (there is nothing to reset) and the person can never sign in with email +
//     password. Until now there was no way out of that except staying on Google forever.
//  2. Someone WITH a password had no way to change it without going through the forgot-password
//     email round trip, which is a strange thing to require of a person who already knows it.
//
// Deliberately not an emailed "temporary password", which is the older pattern for case 1: that
// puts a working credential into an inbox where it persists, is searchable and backed up, and
// gives the account away to anyone who reaches the mailbox. A password the owner chooses in a
// session they already hold never transmits a usable credential anywhere.
//
// Changing a password does NOT sign other devices out on its own. That is a real, defensible
// choice either way; doing it silently would be a surprising side effect, and "Sign out of all
// devices" sits directly above this control for whoever actually wants it.
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // An existing password must be re-proved: holding a live session is not the same as knowing the
  // credential, and an unattended unlocked device should not be enough to lock the real owner out.
  // With no password set there is nothing to prove — the session is the only evidence that exists,
  // and it is the same bar every other account change on this page already uses. Worth naming as a
  // real tradeoff rather than hiding it: someone with access to an unlocked, signed-in device can
  // give a Google-only account a password. They could already act as that person entirely, so this
  // grants no new reach, but it does make the access outlive the session — which is why "Sign out
  // of all devices" exists next to it.
  if (user.password) {
    if (!currentPassword) return NextResponse.json({ error: 'Enter your current password' }, { status: 400 });
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(newPassword, 10) } });
  return NextResponse.json({ ok: true });
}
