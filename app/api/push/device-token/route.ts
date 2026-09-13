import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// Where the native app registers the phone it is running on, so FCM can reach it.
//
// The web equivalent is ../subscribe; this is deliberately a separate route for the same reason
// DeviceToken is a separate table — the two transports share nothing but an intent.

const MAX_TOKEN_LENGTH = 4096;
const PLATFORMS = new Set(['android', 'ios']);

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const platform = typeof body?.platform === 'string' ? body.platform : '';

  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return NextResponse.json({ error: 'Missing or malformed token' }, { status: 400 });
  }
  if (!PLATFORMS.has(platform)) {
    return NextResponse.json({ error: 'Unknown platform' }, { status: 400 });
  }

  // Upsert on the token, and reassign userId on conflict. That reassignment is the point rather
  // than an afterthought: a shared or handed-down phone can present a token already recorded
  // against whoever signed in before, and without this the notifications would keep going to that
  // earlier account. The token identifies an app install, not a person.
  await prisma.deviceToken.upsert({
    where: { token },
    create: { token, platform, userId },
    update: { userId, platform },
  });

  return NextResponse.json({ ok: true });
}

// Called on sign-out so a shared device stops receiving the previous person's notifications, and
// when the user turns notifications off in the app.
export async function DELETE(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  // Scoped to this user: deleteMany with both conditions means presenting someone else's token
  // deletes nothing rather than silently unsubscribing a stranger's phone.
  await prisma.deviceToken.deleteMany({ where: { token, userId } });

  return NextResponse.json({ ok: true });
}
