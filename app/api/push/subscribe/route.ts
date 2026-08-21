import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// Registers/updates the caller's own subscription — body is a raw PushSubscriptionJSON
// ({endpoint, keys: {p256dh, auth}}), exactly what `PushSubscription.toJSON()` produces
// client-side. Upsert by endpoint (globally unique per the Push API spec) so re-subscribing the
// same browser (e.g. after clearing permission and re-granting) doesn't create a duplicate row.
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, p256dh, auth },
    create: { userId, endpoint, p256dh, auth },
  });
  return NextResponse.json({ ok: true });
}

// Unsubscribing (disabling notifications, or the client's own subscription having gone stale) —
// endpoint is the only thing needed to identify which row to remove. Scoped to the caller's own
// userId so one person can't delete someone else's subscription by guessing/replaying an endpoint.
export async function DELETE(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });

  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  return NextResponse.json({ ok: true });
}
