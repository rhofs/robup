import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { sendPushToUser } from '@/lib/push';

// Sends a notification to yourself, so setting push up can be verified without needing a second
// person or a second account.
//
// Until this existed the only way to see a notification was to have a colleague message you —
// which makes "did I set this up correctly?" a question you cannot answer alone, on a feature whose
// failure mode is silence. Every colleague installing the app would have hit the same wall.
//
// Deliberately sends to the CALLER only. There is no user parameter, so this cannot be turned into
// a way to make someone else's phone buzz.

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // A person testing their setup presses this a handful of times at most. The limit is here because
  // it sends real notifications to a real device, and a stuck retry loop should not be able to
  // hammer someone's phone.
  if (!checkRateLimit(`push-test:${userId}:${getClientIp(req)}`, 10, 5 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many test notifications — wait a few minutes' }, { status: 429 });
  }

  // Counted before sending, and reported back, because "nothing arrived" has two very different
  // causes that feel identical: nothing was registered to send to, or something was registered and
  // delivery failed. The first is by far the more common and is entirely fixable by the user, so
  // the UI can say which one happened instead of leaving them guessing.
  const [browsers, devices] = await Promise.all([
    prisma.pushSubscription.count({ where: { userId } }),
    prisma.deviceToken.count({ where: { userId } }),
  ]);

  if (browsers === 0 && devices === 0) {
    return NextResponse.json(
      { error: 'Nothing is registered for notifications yet on this account.' },
      { status: 400 }
    );
  }

  await sendPushToUser(userId, {
    title: 'Siqt',
    body: 'Test notification — your notifications are working.',
    url: '/',
  });

  return NextResponse.json({ ok: true, browsers, devices });
}
