import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// Same rule PATCH /api/users/[id] enforces — kept in both places deliberately rather than shared:
// this one is only an early hint for the UI, that one is the actual gate. If they ever disagree,
// the server-side write is the one that decides.
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

// "Is this username free?" — a live check for the username field in Profile, so a taken name is
// visible while typing rather than only after pressing Save. The unique constraint on
// User.username plus PATCH /api/users/[id]'s own P2002 catch remain the real guarantee: this can
// always go stale between the check and the write (someone else can claim the name in between),
// so it is deliberately advisory only.
//
// Discloses nothing that isn't already discoverable: GET /api/connections/lookup already resolves
// an exact username to a real person, so "is it taken" is strictly less than what a signed-in
// caller can already learn. Still requires a session, for the same reason every other route here
// does — an anonymous caller has no business enumerating anything.
export async function GET(req: Request) {
  const callerId = await getCurrentUserId();
  if (!callerId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const username = (new URL(req.url).searchParams.get('username') ?? '').trim().toLowerCase();
  if (!username) return NextResponse.json({ available: false, reason: 'empty' });
  if (!USERNAME_RE.test(username)) return NextResponse.json({ available: false, reason: 'invalid' });

  const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  // Your own current username reads as available — otherwise re-saving your own handle (or just
  // opening the field with it already filled in) would report itself as taken.
  const available = !existing || existing.id === callerId;
  return NextResponse.json({ available, reason: available ? null : 'taken' });
}
