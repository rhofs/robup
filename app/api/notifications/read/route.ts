import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserId } from '@/lib/auth/session';

// Marks notifications read: one by id, or every unread one when no id is given.
//
// `userId` is in the where clause of both branches, not just the all-branch. Without it, passing
// somebody else's notification id would mark THEIR notification read — a small thing to get wrong
// and an invisible one to notice, since nothing in the response would look different.
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const now = new Date();

  if (typeof body.id === 'string') {
    await prisma.notification.updateMany({ where: { id: body.id, userId }, data: { readAt: now } });
  } else {
    await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: now } });
  }

  return NextResponse.json({ ok: true });
}
