import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// "Sign out of all devices." Stamps User.sessionsValidFrom with the current time, which
// getCurrentUserId() then uses to refuse every session minted before that moment — the only form
// of revocation available while sessions are JWT-only (auth.ts explains why they have to be).
//
// Self-only, and deliberately not an admin capability: this is a personal safety control (a lost
// phone, a shared computer), not a moderation tool. Forcing someone else out of their account is a
// different feature with different consequences, and inventing it silently as a side effect of
// this one would be wrong.
//
// The caller's own current session is invalidated too — there is no way to exempt it, since the
// timestamp is coarse and applies to every token equally, and exempting it would defeat the point
// on the very device most likely to have been compromised. The client signs itself out
// immediately afterwards rather than waiting to discover it on the next request.
export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  await prisma.user.update({ where: { id: userId }, data: { sessionsValidFrom: new Date() } });
  return NextResponse.json({ ok: true });
}
